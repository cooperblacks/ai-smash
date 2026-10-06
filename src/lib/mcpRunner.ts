/**
 * Model Context Protocol (MCP) Runner & Integration Engine
 * Enables external IDEs, Claude Desktop, Cursor, and custom applications to connect
 * to the AI Smash model and tool suite via standardized JSON-RPC 2.0 / SSE.
 */

import { TestResult } from './integrations';

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpServerInfo {
  name: string;
  version: string;
  protocolVersion: string;
}

/**
 * Tests connection to an MCP endpoint (either built-in /api/mcp or external server)
 */
export async function testMcpConnection(
  serverUrl?: string,
  apiKey?: string
): Promise<TestResult> {
  const targetUrl = (serverUrl || '').trim() || '/api/mcp';

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (apiKey?.trim()) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }

    // Ping / initialize handshake via JSON-RPC 2.0
    const res = await fetch(targetUrl.replace(/\/sse$/, ''), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'test_init_' + Date.now(),
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          clientInfo: { name: 'ai-smash-client', version: '1.0.0' },
        },
      }),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const serverName = data.result?.serverInfo?.name || 'MCP Server';
      const version = data.result?.serverInfo?.version || '1.0.0';
      const protocol = data.result?.protocolVersion || '2024-11-05';
      return {
        ok: true,
        message: `Connected to ${serverName} v${version} (MCP Protocol ${protocol})`,
        details: data.result,
      };
    }

    // If serverUrl is an SSE endpoint, test SSE reachability
    if (targetUrl.includes('/sse')) {
      const sseRes = await fetch(targetUrl, {
        headers: { Accept: 'text/event-stream' },
      });
      if (sseRes.ok) {
        return {
          ok: true,
          message: `Connected to MCP SSE endpoint at ${targetUrl}! Ready for external client streaming.`,
        };
      }
    }

    const err = await res.json().catch(() => ({}));
    return {
      ok: false,
      message: err.error?.message || `MCP server returned status ${res.status}: ${res.statusText}`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error connecting to MCP server';
    return { ok: false, message: msg };
  }
}

/**
 * Client runner to manage external MCP server connections during /chat mode
 */
class McpClientManager {
  private activeTools: McpTool[] = [];
  private isConnected = false;

  public async discoverTools(serverUrl: string, apiKey?: string): Promise<McpTool[]> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const res = await fetch(serverUrl.replace(/\/sse$/, ''), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'list_tools_' + Date.now(),
          method: 'tools/list',
          params: {},
        }),
      });

      if (res.ok) {
        const data = await res.json();
        this.activeTools = data.result?.tools || [];
        this.isConnected = true;
        return this.activeTools;
      }
    } catch (e) {
      console.warn('MCP tool discovery error:', e);
    }
    return [];
  }

  public getConnectedTools(): McpTool[] {
    return this.activeTools;
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }
}

export const mcpClientManager = new McpClientManager();
