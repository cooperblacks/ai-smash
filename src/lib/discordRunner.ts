import { IntegrationConfig } from '../types';
import { sendDiscordMessage } from './integrations';
import { SYSTEM_PROMPTS } from '../constants';

/**
 * Client-Side Discord Bot Runner
 * Connects directly to Discord Gateway via browser WebSocket (wss://gateway.discord.gg).
 * Automatically heartbeats, listens for messages, and uses the app's AI persona to reply.
 */
class DiscordBotRunner {
  private ws: WebSocket | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private currentIntegration: IntegrationConfig | null = null;
  private lastSequence: number | null = null;
  private botUser: { id: string; username: string } | null = null;
  private isRunning = false;
  private onStatusChange?: (status: 'connected' | 'disconnected' | 'polling' | 'error', message: string) => void;

  public start(
    integration: IntegrationConfig,
    onStatusChange?: (status: 'connected' | 'disconnected' | 'polling' | 'error', message: string) => void
  ) {
    if (!integration.botToken || !integration.enabled) {
      this.stop();
      return;
    }

    // If already running with same token, just update callback
    if (
      this.isRunning &&
      this.currentIntegration?.botToken === integration.botToken &&
      this.currentIntegration?.enabled === integration.enabled
    ) {
      this.currentIntegration = integration;
      this.onStatusChange = onStatusChange;
      return;
    }

    this.stop();
    this.currentIntegration = integration;
    this.onStatusChange = onStatusChange;
    this.isRunning = true;
    this.connect();
  }

  public stop() {
    this.isRunning = false;
    this.currentIntegration = null;
    this.botUser = null;
    this.lastSequence = null;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      try {
        this.ws.close(1000, 'Client closed');
      } catch {}
      this.ws = null;
    }

    this.onStatusChange?.('disconnected', 'Discord bot runner stopped');
  }

  public getBotUser() {
    return this.botUser;
  }

  public getIsRunning() {
    return this.isRunning;
  }

  private connect() {
    if (!this.isRunning || !this.currentIntegration?.botToken) return;

    const token = this.currentIntegration.botToken.trim();
    this.onStatusChange?.('polling', 'Connecting to Discord Gateway...');

    try {
      const ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');
      this.ws = ws;

      ws.onopen = () => {
        // Connected to gateway, awaiting Opcode 10 Hello
      };

      ws.onmessage = async (event) => {
        try {
          const payload = JSON.parse(event.data);
          const { op, d, s, t } = payload;

          if (s !== undefined && s !== null) {
            this.lastSequence = s;
          }

          // Opcode 10: Hello (Initial handshake)
          if (op === 10) {
            const heartbeatMs = d.heartbeat_interval || 41250;
            this.startHeartbeat(heartbeatMs);

            // Send Opcode 2: Identify
            const identifyPayload = {
              op: 2,
              d: {
                token: token,
                intents: 33280, // GuildMessages (512) | MessageContent (32768)
                properties: {
                  os: 'browser',
                  browser: 'chrome',
                  device: 'browser',
                },
              },
            };
            ws.send(JSON.stringify(identifyPayload));
          }

          // Opcode 1: Heartbeat request
          if (op === 1) {
            this.sendHeartbeat();
          }

          // Opcode 7: Reconnect
          // Opcode 9: Invalid Session
          if (op === 7 || op === 9) {
            this.scheduleReconnect(2000);
          }

          // Opcode 0: Dispatch Events
          if (op === 0) {
            if (t === 'READY') {
              this.botUser = d.user;
              this.onStatusChange?.(
                'connected',
                `Online as @${d.user.username} (Browser Gateway Active)`
              );
            } else if (t === 'MESSAGE_CREATE') {
              await this.handleIncomingMessage(d);
            }
          }
        } catch (err) {
          console.warn('Discord Gateway parse error:', err);
        }
      };

      ws.onerror = (err) => {
        console.warn('Discord Gateway WebSocket error:', err);
        this.onStatusChange?.('error', 'Gateway connection error. Retrying...');
      };

      ws.onclose = (event) => {
        if (this.heartbeatInterval) {
          clearInterval(this.heartbeatInterval);
          this.heartbeatInterval = null;
        }

        if (this.isRunning && event.code !== 1000) {
          this.scheduleReconnect(5000);
        }
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create WebSocket';
      this.onStatusChange?.('error', msg);
      this.scheduleReconnect(5000);
    }
  }

  private startHeartbeat(intervalMs: number) {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.sendHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, intervalMs);
  }

  private sendHeartbeat() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ op: 1, d: this.lastSequence }));
    }
  }

  private scheduleReconnect(delayMs: number) {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (!this.isRunning) return;
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delayMs);
  }

  private async handleIncomingMessage(msg: any) {
    if (!this.currentIntegration || !this.currentIntegration.botToken) return;
    if (!msg || !msg.author || msg.author.bot) return;
    if (this.botUser && msg.author.id === this.botUser.id) return;

    const botId = this.botUser?.id || '';
    const content = (msg.content || '').trim();
    if (!content) return;

    // Check channel eligibility:
    // If a channelId is specified in settings, match channelId, or if bot is mentioned, or if in DM
    const targetChannel = this.currentIntegration.channelId?.trim();
    const isDirectMessage = !msg.guild_id;
    const isMentioned = botId && (content.includes(`<@${botId}>`) || content.includes(`<@!${botId}>`));
    const isTargetChannel = targetChannel && msg.channel_id === targetChannel;

    // Process message if target channel matches, or is DM, or is mentioned, or no specific channel was constrained
    const shouldRespond = isMentioned || isDirectMessage || isTargetChannel || !targetChannel;
    if (!shouldRespond) return;

    // Clean user query
    const cleanedQuery = content.replace(new RegExp(`<@!?${botId}>`, 'g'), '').trim();
    if (!cleanedQuery) return;

    try {
      // Generate response using AI Persona (Hana / Serafina)
      const replyText = await this.generateAiResponse(cleanedQuery, msg.author.username);

      if (replyText) {
        await sendDiscordMessage(
          this.currentIntegration.botToken,
          msg.channel_id,
          replyText,
          msg.id
        );
      }
    } catch (err) {
      console.warn('Failed to reply to Discord message:', err);
    }
  }

  private async generateAiResponse(prompt: string, authorName: string): Promise<string> {
    try {
      // Try local /api/chat endpoint first
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `${authorName}: ${prompt}` }],
          systemPrompt:
            SYSTEM_PROMPTS.full ||
            "You are Hana, a cute, helpful AI companion with an energetic, caring personality. Keep your Discord responses conversational, concise, and helpful with friendly emojis.",
          maxTokens: 256,
        }),
      });

      if (resp.ok) {
        const reader = resp.body?.getReader();
        const decoder = new TextDecoder();
        let result = '';

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const parsed = JSON.parse(line.slice(6));
                  if (parsed.text) result += parsed.text;
                } catch {}
              }
            }
          }
        }

        if (result.trim()) return result.trim();
      }
    } catch {
      // Fallback
    }

    return `Hey ${authorName}! ✨ I hear you loud and clear. My browser engine is actively running this Discord bot right from the AI Smash app!`;
  }
}

export const discordBotRunner = new DiscordBotRunner();
