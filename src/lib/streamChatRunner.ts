/**
 * Live Stream Chat-to-Input-to-Output-to-Voice Pipeline Runner
 * Connects Twitch IRC WebSocket and YouTube Live Chat polling directly into the AI persona,
 * generating answers and speaking them aloud with avatar lip sync.
 */

import { IntegrationConfig } from '../types';
import { SYSTEM_PROMPTS } from '../constants';

export type StreamMessageHandler = (event: {
  platform: 'twitch' | 'youtube';
  author: string;
  message: string;
  aiReply: string;
  voiceSpoken: boolean;
}) => void;

class StreamChatRunner {
  // Twitch State
  private twitchWs: WebSocket | null = null;
  private currentTwitchConfig: IntegrationConfig | null = null;
  private twitchReconnectTimer: NodeJS.Timeout | null = null;

  // YouTube State
  private ytPollInterval: NodeJS.Timeout | null = null;
  private currentYouTubeConfig: IntegrationConfig | null = null;
  private ytLastPageToken: string | null = null;
  private ytActiveLiveChatId: string | null = null;
  private ytSeenMessageIds = new Set<string>();

  // Event handlers
  private messageListeners: StreamMessageHandler[] = [];
  private onVoiceSpeak?: (text: string) => void;

  public setVoiceSpeakHandler(handler: (text: string) => void) {
    this.onVoiceSpeak = handler;
  }

  public addMessageListener(listener: StreamMessageHandler) {
    this.messageListeners.push(listener);
    return () => {
      this.messageListeners = this.messageListeners.filter((l) => l !== listener);
    };
  }

  // -----------------------------------------------------------------
  // 1. TWITCH LIVE STREAM RUNNER (via IRC WebSocket)
  // -----------------------------------------------------------------
  public startTwitch(
    config: IntegrationConfig,
    onStatus?: (status: 'connected' | 'disconnected' | 'polling' | 'error', message: string) => void
  ) {
    if (!config.enabled || !config.twitchChannel) {
      this.stopTwitch();
      return;
    }

    this.stopTwitch();
    this.currentTwitchConfig = config;
    const channel = config.twitchChannel.trim().replace(/^#/, '').toLowerCase();

    onStatus?.('polling', `Connecting to Twitch IRC for #${channel}...`);

    try {
      const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
      this.twitchWs = ws;

      ws.onopen = () => {
        ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
        if (config.botToken) {
          const cleanToken = config.botToken.trim().replace(/^oauth:/i, '');
          ws.send(`PASS oauth:${cleanToken}`);
          ws.send(`NICK ${channel}`);
        } else {
          ws.send('PASS SCHMOOPIIE');
          ws.send(`NICK justinfan${Math.floor(Math.random() * 80000 + 1000)}`);
        }
        ws.send(`JOIN #${channel}`);
        onStatus?.('connected', `Live on Twitch stream #${channel} (Listening to chat)`);
      };

      ws.onmessage = async (event) => {
        const raw = String(event.data);

        // Ping-Pong heartbeat
        if (raw.startsWith('PING')) {
          ws.send('PONG :tmi.twitch.tv');
          return;
        }

        // Parse IRC PRIVMSG
        const lines = raw.split('\r\n');
        for (const line of lines) {
          if (line.includes('PRIVMSG')) {
            const parsed = this.parseTwitchPrivmsg(line);
            if (parsed && parsed.text.trim()) {
              await this.processIncomingStreamMessage({
                platform: 'twitch',
                author: parsed.username,
                text: parsed.text,
                channel: channel,
                enableVoice: Boolean(config.enableVoice),
              });
            }
          }
        }
      };

      ws.onerror = () => {
        onStatus?.('error', `Twitch chat connection error`);
      };

      ws.onclose = () => {
        onStatus?.('disconnected', `Twitch chat disconnected`);
        if (this.currentTwitchConfig?.enabled) {
          this.twitchReconnectTimer = setTimeout(() => {
            if (this.currentTwitchConfig) this.startTwitch(this.currentTwitchConfig, onStatus);
          }, 6000);
        }
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to connect to Twitch';
      onStatus?.('error', msg);
    }
  }

  public stopTwitch() {
    if (this.twitchReconnectTimer) {
      clearTimeout(this.twitchReconnectTimer);
      this.twitchReconnectTimer = null;
    }
    if (this.twitchWs) {
      try {
        this.twitchWs.close(1000, 'Stopped by user');
      } catch {}
      this.twitchWs = null;
    }
    this.currentTwitchConfig = null;
  }

  private parseTwitchPrivmsg(line: string): { username: string; text: string } | null {
    // Example format: :username!username@username.tmi.twitch.tv PRIVMSG #channel :Hello world
    const match = line.match(/^:([a-zA-Z0-9_]+)![^ ]+ PRIVMSG #[^ ]+ :(.*)$/);
    if (match) {
      return { username: match[1], text: match[2] };
    }
    // Tagged format: @display-name=User;... :user!user@user.tmi.twitch.tv PRIVMSG #channel :Hello
    const tagMatch = line.match(/display-name=([a-zA-Z0-9_]+);.*PRIVMSG #[^ ]+ :(.*)$/);
    if (tagMatch) {
      return { username: tagMatch[1], text: tagMatch[2] };
    }
    return null;
  }

  // -----------------------------------------------------------------
  // 2. YOUTUBE LIVE CHAT POLLER (via YouTube Data API v3)
  // -----------------------------------------------------------------
  public async startYouTube(
    config: IntegrationConfig,
    onStatus?: (status: 'connected' | 'disconnected' | 'polling' | 'error', message: string) => void
  ) {
    if (!config.enabled || !config.apiKey || !config.youtubeVideoId) {
      this.stopYouTube();
      return;
    }

    this.stopYouTube();
    this.currentYouTubeConfig = config;
    this.ytSeenMessageIds.clear();
    this.ytLastPageToken = null;

    const apiKey = config.apiKey.trim();
    const videoId = config.youtubeVideoId.trim();

    onStatus?.('polling', `Fetching YouTube Live Chat for broadcast ${videoId}...`);

    try {
      // 1. Fetch live stream details to find activeLiveChatId
      const vidRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails,snippet&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`
      );

      if (!vidRes.ok) {
        throw new Error(`YouTube API returned status ${vidRes.status}`);
      }

      const vidData = await vidRes.json();
      const item = vidData.items?.[0];
      const liveChatId = item?.liveStreamingDetails?.activeLiveChatId;
      const title = item?.snippet?.title || videoId;

      if (!liveChatId) {
        onStatus?.(
          'error',
          `No active live chat found for "${title}". Ensure the stream is currently live and chat is enabled.`
        );
        return;
      }

      this.ytActiveLiveChatId = liveChatId;
      onStatus?.('connected', `Live polling YouTube chat: "${title}"`);

      // 2. Initial fetch to populate seen messages so we don't spam old chat history
      await this.pollYouTubeMessages(liveChatId, apiKey, true, Boolean(config.enableVoice));

      // 3. Periodic polling interval (every 4 seconds)
      this.ytPollInterval = setInterval(async () => {
        if (!this.currentYouTubeConfig?.enabled || !this.ytActiveLiveChatId) return;
        await this.pollYouTubeMessages(this.ytActiveLiveChatId, apiKey, false, Boolean(config.enableVoice));
      }, 4500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'YouTube connection failed';
      onStatus?.('error', msg);
    }
  }

  public stopYouTube() {
    if (this.ytPollInterval) {
      clearInterval(this.ytPollInterval);
      this.ytPollInterval = null;
    }
    this.currentYouTubeConfig = null;
    this.ytActiveLiveChatId = null;
    this.ytLastPageToken = null;
    this.ytSeenMessageIds.clear();
  }

  private async pollYouTubeMessages(
    liveChatId: string,
    apiKey: string,
    isInitialSeed: boolean,
    enableVoice: boolean
  ) {
    try {
      let url = `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${encodeURIComponent(liveChatId)}&part=snippet,authorDetails&key=${encodeURIComponent(apiKey)}`;
      if (this.ytLastPageToken) {
        url += `&pageToken=${encodeURIComponent(this.ytLastPageToken)}`;
      }

      const res = await fetch(url);
      if (!res.ok) return;

      const data = await res.json();
      if (data.nextPageToken) {
        this.ytLastPageToken = data.nextPageToken;
      }

      const items = data.items || [];
      for (const item of items) {
        const msgId = item.id;
        if (!msgId || this.ytSeenMessageIds.has(msgId)) continue;
        this.ytSeenMessageIds.add(msgId);

        // Skip processing historical messages during initial connection
        if (isInitialSeed) continue;

        const authorName = item.authorDetails?.displayName || 'Viewer';
        const text = item.snippet?.displayMessage || item.snippet?.textMessageDetails?.messageText || '';

        if (text.trim()) {
          await this.processIncomingStreamMessage({
            platform: 'youtube',
            author: authorName,
            text: text.trim(),
            enableVoice,
          });
        }
      }
    } catch (err) {
      console.warn('YouTube live chat polling error:', err);
    }
  }

  // -----------------------------------------------------------------
  // 3. CHAT-TO-INPUT-TO-OUTPUT-TO-VOICE PIPELINE DISPATCHER
  // -----------------------------------------------------------------
  private async processIncomingStreamMessage(params: {
    platform: 'twitch' | 'youtube';
    author: string;
    text: string;
    channel?: string;
    enableVoice?: boolean;
  }) {
    const { platform, author, text, channel, enableVoice } = params;

    // Filter out commands or bot self-talk
    if (author.toLowerCase().includes('bot') || author.toLowerCase().includes('justinfan')) return;

    try {
      // 1. Generate persona reply via /api/chat
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `[${platform.toUpperCase()} Live Chat] ${author}: ${text}` }],
          systemPrompt:
            SYSTEM_PROMPTS.full +
            `\nYou are currently live streaming to your viewers on ${platform.toUpperCase()}. Keep stream answers punchy, entertaining, friendly, and lively with cute emojis. Address the viewer by name (${author}).`,
          maxTokens: 200,
        }),
      });

      let aiReply = '';
      if (resp.ok && resp.body) {
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          for (const l of lines) {
            if (l.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(l.slice(6));
                if (parsed.text) aiReply += parsed.text;
              } catch {}
            }
          }
        }
      }

      const finalReply = aiReply.trim() || `Thanks for the chat, ${author}! ✨`;

      // 2. Output to live voice audio if enabled
      let voiceSpoken = false;
      if (enableVoice && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        if (this.onVoiceSpeak) {
          this.onVoiceSpeak(finalReply);
          voiceSpoken = true;
        } else {
          try {
            window.speechSynthesis.cancel();
            const utter = new SpeechSynthesisUtterance(finalReply);
            utter.pitch = 1.2;
            utter.rate = 1.05;
            window.speechSynthesis.speak(utter);
            voiceSpoken = true;
          } catch {}
        }
      }

      // 3. Optional reply dispatch back to Twitch IRC chat if authenticated
      if (platform === 'twitch' && channel && this.twitchWs && this.currentTwitchConfig?.botToken) {
        try {
          this.twitchWs.send(`PRIVMSG #${channel} :@${author} ${finalReply.slice(0, 450)}`);
        } catch {}
      }

      // 4. Notify listeners
      for (const listener of this.messageListeners) {
        listener({
          platform,
          author,
          message: text,
          aiReply: finalReply,
          voiceSpoken,
        });
      }
    } catch (err) {
      console.warn(`Error processing ${platform} chat message:`, err);
    }
  }
}

export const streamChatRunner = new StreamChatRunner();
