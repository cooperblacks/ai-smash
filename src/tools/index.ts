/**
 * Tool Calling Engine & Built-in Tools Registry
 * Supports Web Search, Wikipedia, Weather, Browser Location, and Device Info.
 * Compatible with Gemini, OpenAI-compatible APIs, and local SLM tool prompt parsing.
 */

import { ToolDefinition, ToolExecutionResult } from '../types';
import { searchWeb } from './webSearch';
import { queryWikipedia } from './wikipedia';
import { getWeatherInfo } from './weather';
import { getLocationInfo } from './location';
import { getBrowserDeviceInfo } from './deviceInfo';
import { executeHumanizerPipeline } from '../lib/humanizerEngine';

/** Active document and chat context available to tools when invoked */
let activeChatContext: {
  text?: string;
  attachedDocumentText?: string;
  modelId?: string;
} = {};

export function setActiveChatContext(ctx: {
  text?: string;
  attachedDocumentText?: string;
  modelId?: string;
}) {
  activeChatContext = { ...activeChatContext, ...ctx };
}

export function getActiveChatContext() {
  return activeChatContext;
}

export const BUILTIN_TOOLS: ToolDefinition[] = [
  {
    name: 'ai_humanizer',
    description: 'Inspects text or attached documents for AI generation markers (Turnitin/GPTZero style detection) and humanizes it using linguistic entropy, perplexity variance, burstiness injection, and cadence humanization algorithms to reduce AI detection to 0% and produce natural, authentic human writing.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text or document content to analyze, check for AI detection, or humanize. If omitted, automatically utilizes the attached document or current message text.',
        },
      },
    },
  },
  {
    name: 'web_search',
    description: 'Searches the web for recent articles, real-time facts, documentation, or news. Use this when the user asks about current events, external links, or topics outside your memory.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query string to look up on the web.',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of search results to return (default: 5).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'wikipedia',
    description: 'Looks up encyclopedic overviews, historical context, definitions, and summaries directly from Wikipedia.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The topic, person, place, or concept to look up on Wikipedia.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'weather_info',
    description: 'Gets current real-time weather conditions, temperatures, humidity, wind, and multi-day forecasts for any city or coordinates.',
    parameters: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: 'Name of the city (e.g. "Tokyo", "London", "New York", "Paris").',
        },
        latitude: {
          type: 'number',
          description: 'Optional latitude coordinate.',
        },
        longitude: {
          type: 'number',
          description: 'Optional longitude coordinate.',
        },
      },
      required: ['city'],
    },
  },
  {
    name: 'location_info',
    description: 'Detects the current user device geographic location (city, region, country, timezone, and GPS/IP coordinates).',
    parameters: {
      type: 'object',
      properties: {
        high_accuracy: {
          type: 'boolean',
          description: 'Whether to request high precision GPS if supported by the browser.',
        },
      },
    },
  },
  {
    name: 'device_info',
    description: 'Inspects client system hardware, CPU logical cores, RAM memory in GB, battery status, screen dimensions, WebGPU/WebGL capabilities, and browser environment.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
];

/**
 * Execute any registered tool by name with arguments
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<ToolExecutionResult> {
  const normalizedName = (toolName || '').toLowerCase().trim();

  try {
    switch (normalizedName) {
      case 'ai_humanizer':
      case 'humanizer':
      case 'ai_detector':
      case 'detect_ai':
      case 'humanize':
      case 'turnitin': {
        const textInput =
          String(args.text || args.content || args.query || '').trim() ||
          activeChatContext.attachedDocumentText ||
          activeChatContext.text ||
          '';

        if (!textInput) {
          return {
            toolName: 'ai_humanizer',
            success: false,
            result: null,
            error: 'No text or attached document provided for AI detection and humanization.',
            renderedSummary: 'Please provide text or attach a document for the humanizer engine to analyze.',
          };
        }

        const modelId = String(args.model || activeChatContext.modelId || 'algorithm');
        const res = await executeHumanizerPipeline(textInput, modelId);
        const origAi = res.originalDetection.aiPercentage;
        const newAi = res.humanizedText.aiPercentage;

        const summary =
          `### AI Detector & Humanizer Results\n` +
          `- **Original AI Detection:** ${origAi}% AI (${res.originalDetection.verdict})\n` +
          `- **Humanized AI Score:** ${newAi}% AI\n` +
          `- **Burstiness:** ${res.humanizedText.burstinessScore}/100 (+${res.humanizedText.burstinessScore - res.originalDetection.burstinessScore})\n` +
          `- **Engine:** ${res.methodUsed}\n\n` +
          `#### Humanized Text:\n${res.rawHumanizedText}`;

        return {
          toolName: 'ai_humanizer',
          success: true,
          result: res,
          renderedSummary: summary,
        };
      }

      case 'web_search': {
        const query = String(args.query || args.q || '').trim();
        const maxResults = typeof args.max_results === 'number' ? args.max_results : 5;
        const res = await searchWeb(query, maxResults);
        const summary = res.results.length > 0
          ? `Found ${res.results.length} search results for "${query}":\n` +
            res.results.map((r, i) => `${i + 1}. [${r.title}](${r.url}) - ${r.snippet}`).join('\n')
          : `No search results found for "${query}".`;
        return {
          toolName: 'web_search',
          success: true,
          result: res,
          renderedSummary: summary,
        };
      }

      case 'wikipedia': {
        const query = String(args.query || args.title || '').trim();
        const res = await queryWikipedia(query);
        const summary = res.found
          ? `**${res.title}**\n${res.extract}\nSource: [Wikipedia](${res.url})`
          : res.extract;
        return {
          toolName: 'wikipedia',
          success: res.found,
          result: res,
          renderedSummary: summary,
        };
      }

      case 'weather_info':
      case 'weather': {
        const city = args.city ? String(args.city) : undefined;
        const latitude = typeof args.latitude === 'number' ? args.latitude : undefined;
        const longitude = typeof args.longitude === 'number' ? args.longitude : undefined;
        const res = await getWeatherInfo({ city, latitude, longitude });
        const summary = `Weather for **${res.location}**: ${res.condition}\n` +
          `- Temperature: ${res.temperatureC}°C (${res.temperatureF}°F), feels like ${res.feelsLikeC}°C\n` +
          `- Humidity: ${res.relativeHumidity}%, Wind: ${res.windSpeedKmh} km/h\n` +
          (res.forecastDaily.length > 0
            ? `- Forecast: ` + res.forecastDaily.map((d) => `${d.date}: ${d.condition} (${d.maxC}°C / ${d.minC}°C)`).join(', ')
            : '');
        return {
          toolName: 'weather_info',
          success: true,
          result: res,
          renderedSummary: summary,
        };
      }

      case 'location_info':
      case 'location': {
        const highAccuracy = Boolean(args.high_accuracy);
        const res = await getLocationInfo(highAccuracy);
        const summary = `Current Location: **${res.city || 'Unknown'}${res.region ? ', ' + res.region : ''}${res.country ? ', ' + res.country : ''}**\n` +
          `- Coordinates: ${res.latitude ?? 'N/A'}, ${res.longitude ?? 'N/A'}\n` +
          `- Timezone: ${res.timezone || 'Local'}\n` +
          `- Source: ${res.source.toUpperCase()}`;
        return {
          toolName: 'location_info',
          success: true,
          result: res,
          renderedSummary: summary,
        };
      }

      case 'device_info':
      case 'system_info': {
        const res = await getBrowserDeviceInfo();
        const summary = `Device & Client Info:\n` +
          `- Platform: ${res.platform} (${res.language})\n` +
          `- CPU Logical Cores: ${res.hardwareConcurrency}\n` +
          `- Memory: ${res.deviceMemoryGb}\n` +
          `- Display: ${res.screen.width}x${res.screen.height} (ratio: ${res.screen.pixelRatio})\n` +
          `- WebGPU: ${res.capabilities.webGpuSupported ? 'Supported' : 'Unavailable'}, WebGL: ${res.capabilities.webGlSupported ? 'Supported' : 'Unavailable'}\n` +
          (res.battery ? `- Battery: ${res.battery.levelPercent}% (${res.battery.charging ? 'Charging' : 'Discharging'})\n` : '') +
          `- Online: ${res.online ? 'Yes' : 'No'}`;
        return {
          toolName: 'device_info',
          success: true,
          result: res,
          renderedSummary: summary,
        };
      }

      default:
        throw new Error(`Tool "${toolName}" is not recognized.`);
    }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      toolName,
      success: false,
      result: null,
      error: errorMsg,
      renderedSummary: `Failed to execute tool "${toolName}": ${errorMsg}`,
    };
  }
}

/**
 * Format tools for OpenAI and Groq APIs
 */
export function toOpenAiTools(): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> {
  return BUILTIN_TOOLS.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: tool.parameters.properties,
        required: tool.parameters.required || [],
      },
    },
  }));
}

/**
 * Format tools for Google Gemini SDK (@google/genai)
 */
export function toGeminiTools(): Array<{
  functionDeclarations: Array<{
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
  }>;
}> {
  return [
    {
      functionDeclarations: BUILTIN_TOOLS.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'OBJECT',
          properties: tool.parameters.properties,
          required: tool.parameters.required,
        },
      })),
    },
  ];
}

/**
 * Pattern to detect tool call requests inside model responses
 * (Supports: <tool_call>{"name":"...","arguments":{...}}</tool_call>, ```tool_call, and function_call: { name, arguments })
 */
export function extractToolCalls(
  text: string
): Array<{ toolName: string; args: Record<string, unknown>; rawMatch: string }> {
  const calls: Array<{ toolName: string; args: Record<string, unknown>; rawMatch: string }> = [];

  // 1. Check <tool_call>...</tool_call> XML tag
  const xmlRegex = /<tool_call>([\s\S]*?)<\/tool_call>/gi;
  let xmlMatch: RegExpExecArray | null;
  while ((xmlMatch = xmlRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(xmlMatch[1].trim());
      if (parsed.name) {
        calls.push({
          toolName: parsed.name,
          args: parsed.arguments || parsed.args || {},
          rawMatch: xmlMatch[0],
        });
      }
    } catch {}
  }

  // 2. Check ```tool_call ... ``` markdown block
  const mdRegex = /```(?:tool_call|function_call)\s*([\s\S]*?)\s*```/gi;
  let mdMatch: RegExpExecArray | null;
  while ((mdMatch = mdRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(mdMatch[1].trim());
      if (parsed.name) {
        calls.push({
          toolName: parsed.name,
          args: parsed.arguments || parsed.args || {},
          rawMatch: mdMatch[0],
        });
      }
    } catch {}
  }

  return calls;
}

/**
 * System instruction prompt segment explaining available built-in tools
 */
export function getToolCallingSystemPrompt(): string {
  const toolsSummary = BUILTIN_TOOLS.map((t) => {
    const params = Object.keys(t.parameters.properties).join(', ');
    return `- ${t.name}(${params}): ${t.description}`;
  }).join('\n');

  return (
    `\n\n[BUILT-IN TOOLS AVAILABLE]\n` +
    `You have access to the following built-in real-time tools:\n` +
    `${toolsSummary}\n\n` +
    `When you need live facts, weather, web search, location, or system info, invoke a tool by wrapping the JSON call in XML tags:\n` +
    `<tool_call>{"name": "tool_name", "arguments": {"arg1": "value"}}</tool_call>\n` +
    `The system will execute the tool and return the output for you to answer accurately.`
  );
}
