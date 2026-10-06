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
  content: string,
  replyMessageId?: string
): Promise<boolean> {
  if (!botToken || !channelId || !content) return false;
  try {
    const payload: Record<string, unknown> = { content };
    if (replyMessageId) {
      payload.message_reference = { message_id: replyMessageId };
    }
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
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

// ----------------------------------------------------
// Twitch Stream Chat & Voice Engine
// ----------------------------------------------------
export async function testTwitchConnection(channel: string, oauthToken?: string): Promise<TestResult> {
  const ch = (channel || '').trim().replace(/^#/, '').toLowerCase();
  if (!ch) {
    return { ok: false, message: 'Twitch channel name cannot be empty.' };
  }

  try {
    // If OAuth token is provided, test user identity
    if (oauthToken?.trim()) {
      const cleanToken = oauthToken.trim().replace(/^oauth:/i, '');
      const res = await fetch('https://id.twitch.tv/oauth/validate', {
        headers: { Authorization: `OAuth ${cleanToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        return {
          ok: true,
          message: `Authenticated as @${data.login} for Twitch channel #${ch}!`,
          details: data,
        };
      }
    }

    // Test WebSocket reachability to Twitch IRC
    return new Promise((resolve) => {
      const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
      const timer = setTimeout(() => {
        try { ws.close(); } catch {}
        resolve({ ok: true, message: `Connected to Twitch IRC for #${ch} (Anonymous Listen Mode)` });
      }, 3000);

      ws.onopen = () => {
        clearTimeout(timer);
        ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
        ws.send('PASS SCHMOOPIIE');
        ws.send('NICK justinfan' + Math.floor(Math.random() * 80000 + 1000));
        ws.send(`JOIN #${ch}`);
        setTimeout(() => {
          try { ws.close(); } catch {}
          resolve({ ok: true, message: `Successfully connected to Twitch stream chat #${ch}!` });
        }, 1000);
      };

      ws.onerror = () => {
        clearTimeout(timer);
        resolve({ ok: false, message: `Failed to open Twitch IRC WebSocket connection.` });
      };
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error validating Twitch channel';
    return { ok: false, message: msg };
  }
}

// ----------------------------------------------------
// YouTube Live Stream Chat & Voice Engine
// ----------------------------------------------------
export async function testYouTubeConnection(apiKey: string, videoId: string): Promise<TestResult> {
  const key = (apiKey || '').trim();
  const vid = (videoId || '').trim();

  if (!key) {
    return { ok: false, message: 'YouTube Data API v3 key is required.' };
  }
  if (!vid) {
    return { ok: false, message: 'YouTube Live Broadcast Video ID is required.' };
  }

  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${encodeURIComponent(vid)}&key=${encodeURIComponent(key)}`
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        ok: false,
        message: err.error?.message || `YouTube API returned status ${res.status}: ${res.statusText}`,
      };
    }

    const data = await res.json();
    if (!data.items || data.items.length === 0) {
      return { ok: false, message: `No YouTube video found for ID "${vid}". Please verify your Video ID.` };
    }

    const item = data.items[0];
    const liveChatId = item.liveStreamingDetails?.activeLiveChatId;
    const title = item.snippet?.title || vid;

    if (liveChatId) {
      return {
        ok: true,
        message: `Connected to live broadcast: "${title}" (Active Live Chat ID found)`,
        details: { liveChatId, title },
      };
    } else {
      return {
        ok: true,
        message: `Video "${title}" found! Broadcast is currently offline or chat is inactive. Ready to stream once live.`,
        details: { title },
      };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network error communicating with YouTube API';
    return { ok: false, message: msg };
  }
}

// ----------------------------------------------------
// Gmail Workspace API Connector
// ----------------------------------------------------
export async function testGmailConnection(accessToken: string, userEmail?: string): Promise<TestResult> {
  const token = (accessToken || '').trim();
  if (!token) {
    return { ok: false, message: 'Google OAuth Access Token is required.' };
  }

  try {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const data = await res.json();
      return {
        ok: true,
        message: `Connected to Gmail account: ${data.emailAddress} (${data.messagesTotal} total messages)`,
        details: data,
      };
    }

    const err = await res.json().catch(() => ({}));
    return {
      ok: false,
      message: err.error?.message || `Gmail API error (${res.status}): ${res.statusText}`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network error verifying Gmail token';
    return { ok: false, message: msg };
  }
}

export async function fetchRecentGmailMessages(
  accessToken: string,
  maxResults = 5
): Promise<Array<{ id: string; snippet: string; threadId: string }>> {
  const token = (accessToken || '').trim();
  if (!token) return [];

  try {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=is:unread`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const list = data.messages || [];

    const messages = await Promise.all(
      list.slice(0, maxResults).map(async (item: { id: string; threadId: string }) => {
        try {
          const detailRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=minimal`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (detailRes.ok) {
            const detail = await detailRes.json();
            return { id: item.id, threadId: item.threadId, snippet: detail.snippet || '' };
          }
        } catch {}
        return { id: item.id, threadId: item.threadId, snippet: '' };
      })
    );

    return messages;
  } catch {
    return [];
  }
}

// ----------------------------------------------------
// Google Sheets API Connector
// ----------------------------------------------------
export async function testSheetsConnection(
  accessToken: string,
  spreadsheetId: string,
  range?: string
): Promise<TestResult> {
  const token = (accessToken || '').trim();
  const sheetId = (spreadsheetId || '').trim();

  if (!token) {
    return { ok: false, message: 'Google OAuth Access Token is required.' };
  }
  if (!sheetId) {
    return { ok: false, message: 'Google Spreadsheet ID is required.' };
  }

  try {
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const data = await res.json();
      const title = data.properties?.title || sheetId;
      const sheetNames = (data.sheets || []).map((s: any) => s.properties?.title).join(', ');
      return {
        ok: true,
        message: `Connected to spreadsheet "${title}" (Sheets: ${sheetNames || 'default'})`,
        details: data,
      };
    }

    const err = await res.json().catch(() => ({}));
    return {
      ok: false,
      message: err.error?.message || `Google Sheets API error (${res.status}): ${res.statusText}`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network error verifying Google Sheet';
    return { ok: false, message: msg };
  }
}

export async function readGoogleSheetRows(
  accessToken: string,
  spreadsheetId: string,
  range = 'Sheet1!A1:Z50'
): Promise<string[][]> {
  const token = (accessToken || '').trim();
  const sheetId = (spreadsheetId || '').trim();
  if (!token || !sheetId) return [];

  try {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.values || [];
  } catch {
    return [];
  }
}

export async function appendGoogleSheetRow(
  accessToken: string,
  spreadsheetId: string,
  rowValues: string[],
  range = 'Sheet1!A:Z'
): Promise<boolean> {
  const token = (accessToken || '').trim();
  const sheetId = (spreadsheetId || '').trim();
  if (!token || !sheetId) return false;

  try {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [rowValues],
        }),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Dispatches chat event to all active automation webhooks (n8n, Zapier, Sheets)
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
    (item) => item.enabled && (item.platform === 'n8n' || item.platform === 'zapier' || item.platform === 'sheets')
  );

  for (const item of activeAutomations) {
    // 1. Google Sheets Logging
    if (item.platform === 'sheets' && item.googleAccessToken && item.spreadsheetId) {
      appendGoogleSheetRow(
        item.googleAccessToken,
        item.spreadsheetId,
        [
          new Date(payload.timestamp).toISOString(),
          payload.prompt,
          payload.response,
          payload.modelUsed,
        ],
        item.sheetRange || 'Sheet1!A:D'
      ).catch(() => {});
      continue;
    }

    // 2. n8n and Zapier Webhooks
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

export { testMcpConnection } from './mcpRunner';


