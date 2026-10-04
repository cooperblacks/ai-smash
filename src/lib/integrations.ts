import { IntegrationConfig } from '../types';

/**
 * Service for testing, polling, and dispatching events to external integrations
 * (Discord, Slack, n8n, Zapier).
 */

export interface TestResult {
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
}

// ----------------------------------------------------
// Discord Bot Integration Engine
// ----------------------------------------------------
export async function testDiscordConnection(botToken: string): Promise<TestResult> {
  const token = (botToken || '').trim();
  if (!token) {
    return { ok: false, message: 'Bot token cannot be empty.' };
  }

  try {
    const res = await fetch('https://discord.com/api/v10/users/@me', {
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (res.ok) {
      const data = await res.json();
      return {
        ok: true,
        message: `Connected successfully as @${data.username}#${data.discriminator || '0'} (ID: ${data.id})`,
        details: data,
      };
    } else {
      const err = await res.json().catch(() => ({}));
      return {
        ok: false,
        message: err.message || `Discord API error: ${res.status} ${res.statusText}`,
      };
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Network error communicating with Discord';
    return { ok: false, message: msg };
  }
}

/**
 * Dispatches a message to a Discord channel
 */
export async function sendDiscordMessage(
  botToken: string,
  channelId: string,
  content: string
): Promise<boolean> {
  if (!botToken || !channelId || !content) return false;
  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ----------------------------------------------------
// Slack Workspace Integration Engine
// ----------------------------------------------------
export async function testSlackConnection(botToken?: string, webhookUrl?: string): Promise<TestResult> {
  if (webhookUrl?.trim()) {
    try {
      const res = await fetch(webhookUrl.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'AI Smash integration test ping: Connected!' }),
      });
      if (res.ok) {
        return { ok: true, message: 'Slack Webhook connection active!' };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Slack webhook ping failed';
      return { ok: false, message: msg };
    }
  }

  if (botToken?.trim()) {
    try {
      const res = await fetch('https://slack.com/api/auth.test', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${botToken.trim()}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await res.json();
      if (data.ok) {
        return {
          ok: true,
          message: `Connected to workspace "${data.team}" as @${data.user}`,
          details: data,
        };
      }
      return { ok: false, message: data.error || 'Slack authentication failed' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Slack API connection error';
      return { ok: false, message: msg };
    }
  }

  return { ok: false, message: 'Please provide either a Slack Bot Token (xoxb-...) or Webhook URL.' };
}

// ----------------------------------------------------
// n8n Workflow Automation Engine
// ----------------------------------------------------
export async function testN8nConnection(webhookUrl: string, apiKey?: string): Promise<TestResult> {
  const url = (webhookUrl || '').trim();
  if (!url) {
    return { ok: false, message: 'n8n Webhook URL is required.' };
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey?.trim()) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
      headers['X-N8N-API-KEY'] = apiKey.trim();
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        event: 'test_ping',
        source: 'AI Smash',
        timestamp: Date.now(),
      }),
    });

    if (res.ok || res.status === 200 || res.status === 204) {
      return { ok: true, message: 'n8n webhook received test event successfully!' };
    }
    return {
      ok: false,
      message: `n8n webhook responded with status ${res.status}: ${res.statusText}`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to reach n8n webhook URL';
    return { ok: false, message: msg };
  }
}

// ----------------------------------------------------
// Zapier App Connector Engine
// ----------------------------------------------------
export async function testZapierConnection(webhookUrl: string): Promise<TestResult> {
  const url = (webhookUrl || '').trim();
  if (!url) {
    return { ok: false, message: 'Zapier Catch Hook URL is required.' };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'test_ping',
        app: 'AI Smash',
        timestamp: new Date().toISOString(),
      }),
    });

    if (res.ok) {
      return { ok: true, message: 'Zapier Catch Hook received test event!' };
    }
    return {
      ok: false,
      message: `Zapier webhook returned status ${res.status}: ${res.statusText}`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to send to Zapier hook';
    return { ok: false, message: msg };
  }
}

/**
 * Dispatches chat event to all active automation webhooks (n8n, Zapier)
 */
export async function dispatchChatToWebhooks(
  integrations: IntegrationConfig[],
  payload: {
    prompt: string;
    response: string;
    modelUsed: string;
    timestamp: number;
  }
): Promise<void> {
  const activeAutomations = integrations.filter(
    (item) => item.enabled && (item.platform === 'n8n' || item.platform === 'zapier') && item.webhookUrl
  );

  for (const item of activeAutomations) {
    if (!item.webhookUrl) continue;
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (item.apiKey) {
        headers['Authorization'] = `Bearer ${item.apiKey}`;
      }

      await fetch(item.webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          source: 'AI Smash',
          platform: item.platform,
          name: item.name,
          ...payload,
        }),
      });
    } catch (err) {
      console.warn(`Failed to dispatch to ${item.name}:`, err);
    }
  }
}
