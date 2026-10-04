import React, { useState, useMemo } from 'react';
import {
  Search,
  BookOpen,
  ChevronRight,
  Copy,
  Check,
  ExternalLink,
  ArrowLeft,
  Bot,
  Workflow,
  Sparkles,
  Key,
  ShieldCheck,
  Volume2,
  Terminal,
  MessageSquare,
  Home,
  Menu,
  X,
} from 'lucide-react';
import { AI_PROFILE } from '../constants';

interface DocsPageProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  onBackToChat: () => void;
  onBackToHome: () => void;
}

interface DocArticle {
  id: string;
  path: string;
  title: string;
  category: 'Getting Started' | 'AI Model APIs' | 'Integrations';
  tagline: string;
  logoUrl?: string;
  content: {
    overview: string;
    prerequisites?: string[];
    steps?: Array<{ title: string; desc: string; code?: string; lang?: string }>;
    slashCommands?: Array<{ cmd: string; desc: string; example: string }>;
    parameters?: Array<{ name: string; type: string; required: boolean; desc: string }>;
    codeExample?: { lang: string; code: string };
    tips?: string[];
  };
}

export const DOCS_ARTICLES: DocArticle[] = [
  // 1. Getting Started Overview
  {
    id: 'overview',
    path: '/docs',
    title: 'Developer Documentation Overview',
    category: 'Getting Started',
    tagline: 'Connect external models, configure API keys, and deploy bots with AI Smash',
    content: {
      overview:
        'AI Smash provides an interactive sandbox unifying in-browser Small Language Models (SLMs) with frontier external AI APIs and multi-platform bot integrations. All API credentials and bot tokens are persisted securely in your local browser session (via localStorage) so you can test, iterate, and integrate without sending secrets to any intermediary database.',
      prerequisites: [
        'A modern desktop or mobile browser with WebGPU/WASM and IndexedDB support',
        'Valid API keys or bot tokens for whichever cloud providers you wish to integrate',
      ],
      steps: [
        {
          title: '1. Select AI Model or External Provider',
          desc: 'Click on the Model Selector in the chat input panel. Choose from instant in-browser SLMs (SmolLM2, Qwen 2.5, Llama 3.2), self-hosted Ollama servers, or external frontier APIs (OpenAI, Gemini, Anthropic, xAI, Groq, Z.ai, DeepSeek, Qwen, HuggingFace).',
        },
        {
          title: '2. Attach Files & Multi-Modal Inputs',
          desc: 'Click the "+" button vertically above the model selector to attach images, documents, audio clips, or source code. Files automatically arrange themselves in a reactive preview above the chat composer.',
        },
        {
          title: '3. Add Integrations from the Library',
          desc: 'Click the "+" button and select "Add integration" to open the integration modal. Add Discord, Slack, n8n, or Zapier connectors with one click.',
        },
      ],
      tips: [
        'API keys and integration credentials stay on your device and are never shared publicly.',
        'When using external API providers, responses stream directly with real-time token telemetry and 3D avatar lip-sync.',
      ],
    },
  },

  // 2. DISCORD INTEGRATION
  {
    id: 'discord',
    path: '/docs/integration/discord',
    title: 'Discord Bot & Voice Integration',
    category: 'Integrations',
    tagline: 'Bot mentions, direct messages, voice channel TTS, and slash commands',
    logoUrl: 'https://muxai.vercel.app/logos/discord.jpg',
    content: {
      overview:
        'The AI Smash Discord integration enables your Discord bot to listen for mentions (@bot) and Direct Messages, route the conversation to whichever AI model is currently active in AI Smash, and post formatted replies back. If joined in a voice channel, the bot will synthesize and output voice audio in real-time.',
      prerequisites: [
        'A Discord Application created in the Discord Developer Portal (https://discord.com/developers/applications)',
        'A Bot User created under the application with "Message Content Intent" enabled',
        'Bot invited to your Discord server with Send Messages and Connect/Speak voice permissions',
      ],
      steps: [
        {
          title: 'Step 1: Obtain Bot Token',
          desc: 'In Discord Developer Portal -> Your App -> Bot -> Reset Token -> Copy the token.',
        },
        {
          title: 'Step 2: Enable Gateway Privileged Intents',
          desc: 'Under the Bot tab in the Developer Portal, toggle ON "Server Members Intent" and "Message Content Intent".',
        },
        {
          title: 'Step 3: Insert Token into AI Smash',
          desc: 'Click the "+" button in the chat input panel, click "Add integration", choose Discord, and paste your Bot Token in the settings field. It saves automatically to browser persistent storage.',
        },
      ],
      slashCommands: [
        {
          cmd: '/msg <prompt>',
          desc: 'Sends a private hidden message that is not broadcast into the public Discord text channel. The bot replies privately or ephemerally.',
          example: '/msg Can you summarize the latest project roadmap?',
        },
        {
          cmd: '/joinvc',
          desc: 'Instructs the bot to join whichever voice channel the command user is currently connected to on the server.',
          example: '/joinvc',
        },
        {
          cmd: '/exitvc',
          desc: 'Instructs the bot to leave the voice channel and end any active audio stream.',
          example: '/exitvc',
        },
      ],
      parameters: [
        { name: 'botToken', type: 'string (secret)', required: true, desc: 'Your Discord application bot token.' },
        { name: 'guildId', type: 'string', required: false, desc: 'Server ID to restrict bot scope.' },
        { name: 'channelId', type: 'string', required: false, desc: 'Default text or voice channel ID.' },
        { name: 'enableVoice', type: 'boolean', required: false, desc: 'When enabled, outputs voice synthesis to Discord VC.' },
      ],
      codeExample: {
        lang: 'bash',
        code: `# Test Discord bot authentication using curl
curl -X GET "https://discord.com/api/v10/users/@me" \\
  -H "Authorization: Bot MTI3ODk0..." \\
  -H "Content-Type: application/json"`,
      },
      tips: [
        'Use /msg whenever you want to consult Hana privately without notifying server members in public channels.',
        'Voice synthesis in Discord VC automatically matches Hana\'s configured voice profile and rate.',
      ],
    },
  },

  // 3. SLACK INTEGRATION
  {
    id: 'slack',
    path: '/docs/integration/slack',
    title: 'Slack Workspace Integration',
    category: 'Integrations',
    tagline: 'Respond to team mentions and direct messages with conversational context',
    logoUrl: 'https://muxai.vercel.app/logos/slack.jpg',
    content: {
      overview:
        'Connect AI Smash to your Slack workspace. The Slack integration listens for @bot mentions or direct messages, routes prompt queries to your active model, and posts answers back into the Slack channel or thread.',
      prerequisites: [
        'A Slack App created at https://api.slack.com/apps',
        'OAuth Scopes: app_mentions:read, chat:write, im:history',
        'Installed app into your target Slack workspace',
      ],
      steps: [
        {
          title: 'Step 1: Create Slack App & Add Bot Scopes',
          desc: 'Add "app_mentions:read" and "chat:write" under OAuth & Permissions in the Slack API dashboard.',
        },
        {
          title: 'Step 2: Copy Bot User OAuth Token',
          desc: 'Install the app to your workspace and copy the token starting with "xoxb-".',
        },
        {
          title: 'Step 3: Configure in AI Smash',
          desc: 'Add Slack from the Integration Library, paste your Bot User Token, and optionally add an Incoming Webhook URL.',
        },
      ],
      parameters: [
        { name: 'botToken', type: 'string', required: true, desc: 'Slack Bot User OAuth Token (xoxb-...)' },
        { name: 'webhookUrl', type: 'string (url)', required: false, desc: 'Optional incoming webhook URL for notifications.' },
        { name: 'channelId', type: 'string', required: false, desc: 'Default channel ID for broadcasts.' },
      ],
      codeExample: {
        lang: 'bash',
        code: `# Test Slack Bot token authentication
curl -X POST "https://slack.com/api/auth.test" \\
  -H "Authorization: Bearer xoxb-your-token" \\
  -H "Content-Type: application/json"`,
      },
    },
  },

  // 4. n8n INTEGRATION
  {
    id: 'n8n',
    path: '/docs/integration/n8n',
    title: 'n8n Workflow Automation',
    category: 'Integrations',
    tagline: 'Trigger automated node flows and webhooks on chat completions',
    logoUrl: 'https://muxai.vercel.app/logos/n8n.jpg',
    content: {
      overview:
        'n8n is an open, extendable workflow automation tool. The AI Smash n8n integration pushes user queries and assistant responses to any n8n Webhook node so you can trigger email notifications, database records, Notion updates, or custom scripts.',
      prerequisites: [
        'A self-hosted or cloud n8n instance (https://n8n.io)',
        'An active n8n workflow containing a Webhook Trigger node set to POST',
      ],
      steps: [
        {
          title: 'Step 1: Create Webhook Node in n8n',
          desc: 'Add a Webhook node in your workflow, set HTTP Method to POST, and copy the Production or Test Webhook URL.',
        },
        {
          title: 'Step 2: Paste Webhook URL into AI Smash',
          desc: 'In AI Smash, add n8n from the Integration Library, paste your webhook URL, and optionally specify header authentication keys.',
        },
      ],
      parameters: [
        { name: 'webhookUrl', type: 'string (url)', required: true, desc: 'n8n Webhook URL endpoint.' },
        { name: 'apiKey', type: 'string', required: false, desc: 'Optional authentication header token.' },
      ],
      codeExample: {
        lang: 'json',
        code: `// Sample JSON payload sent to n8n webhook:
{
  "source": "AI Smash",
  "platform": "n8n",
  "prompt": "Explain quantum computing briefly",
  "response": "Quantum computing harnesses superposition and entanglement...",
  "modelUsed": "OpenAI API (gpt-4o)",
  "timestamp": 1740000000000
}`,
      },
    },
  },

  // 5. ZAPIER INTEGRATION
  {
    id: 'zapier',
    path: '/docs/integration/zapier',
    title: 'Zapier App Connector',
    category: 'Integrations',
    tagline: 'Connect AI Smash chats to 5,000+ cloud applications and Zaps',
    logoUrl: 'https://muxai.vercel.app/logos/zapier.jpg',
    content: {
      overview:
        'Connect AI Smash to Zapier using Catch Hooks. Every conversational exchange can trigger actions across Google Sheets, Airtable, Gmail, Salesforce, or Discord without writing custom backend code.',
      prerequisites: [
        'A Zapier account (https://zapier.com)',
        'A Zap configured with "Webhooks by Zapier" as the trigger, using the "Catch Hook" event',
      ],
      steps: [
        {
          title: 'Step 1: Set up Webhooks by Zapier',
          desc: 'In Zapier, create a new Zap, select "Webhooks by Zapier" -> "Catch Hook", and copy the Webhook URL.',
        },
        {
          title: 'Step 2: Add Zapier in AI Smash',
          desc: 'Open the Integration Library, add Zapier, paste the Catch Hook URL, and click "Test Connection" to send a sample event.',
        },
      ],
      parameters: [
        { name: 'webhookUrl', type: 'string (url)', required: true, desc: 'Zapier Catch Hook URL endpoint.' },
        { name: 'name', type: 'string', required: false, desc: 'Friendly name for your Zap connector.' },
      ],
      codeExample: {
        lang: 'bash',
        code: `# Test sending a payload to Zapier Catch Hook
curl -X POST "https://hooks.zapier.com/hooks/catch/123456/abcdef/" \\
  -H "Content-Type: application/json" \\
  -d '{"event":"test_ping","app":"AI Smash","timestamp":"2026-10-04T10:00:00Z"}'`,
      },
    },
  },

  // 6. OPENAI API
  {
    id: 'openai',
    path: '/docs/api/openai',
    title: 'OpenAI API Integration',
    category: 'AI Model APIs',
    tagline: 'Stream GPT-4o, GPT-4o-mini & o3-mini directly with real-time lip-sync',
    logoUrl: 'https://muxai.vercel.app/logos/openai.jpg',
    content: {
      overview:
        'The OpenAI API integration connects your AI Smash chat directly to OpenAI\'s frontier models. Supported models include GPT-4o (flagship multimodal), GPT-4o-mini (lightweight high speed), and o3-mini (reasoning model). Streaming tokens, avatar speech synthesis, and latency metrics are fully supported.',
      prerequisites: [
        'An OpenAI API Key from https://platform.openai.com/api-keys',
        'Sufficient account balance or billing enabled on your OpenAI organization',
      ],
      steps: [
        {
          title: '1. Copy API Key',
          desc: 'Generate an API key in your OpenAI developer dashboard.',
        },
        {
          title: '2. Configure in AI Smash',
          desc: 'In AI Smash, open the Model Selector, scroll down to "OpenAI API", click "Configure API Key", paste your key, and select your preferred model (gpt-4o, gpt-4o-mini, o3-mini).',
        },
      ],
      parameters: [
        { name: 'apiKey', type: 'string (sk-...)', required: true, desc: 'OpenAI secret API key.' },
        { name: 'model', type: 'string', required: true, desc: 'Target model (e.g. gpt-4o, gpt-4o-mini, o3-mini).' },
        { name: 'maxTokens', type: 'number', required: false, desc: 'Max generation token count (64 - 4096).' },
      ],
      codeExample: {
        lang: 'bash',
        code: `curl https://api.openai.com/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-..." \\
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'`,
      },
    },
  },

  // 7. GEMINI API
  {
    id: 'gemini',
    path: '/docs/api/gemini',
    title: 'Google Gemini API Integration',
    category: 'AI Model APIs',
    tagline: 'Google Gemini 2.5 Flash & 2.5 Pro with multimodal streaming',
    logoUrl: 'https://muxai.vercel.app/logos/gemini.jpg',
    content: {
      overview:
        'Google Gemini delivers fast reasoning and long-context windows. AI Smash supports Gemini 2.5 Flash, 2.5 Pro, and Gemini 3.8 Flash via the official @google/genai SDK with server-side proxy streaming.',
      prerequisites: [
        'A Google Gemini API key from Google AI Studio (https://aistudio.google.com)',
      ],
      steps: [
        {
          title: '1. Obtain Gemini API Key',
          desc: 'Create an API key in Google AI Studio.',
        },
        {
          title: '2. Select Gemini in Model Selector',
          desc: 'Select "Gemini API" in the Model Selector. You can use your custom API key or the pre-configured environment credentials.',
        },
      ],
      parameters: [
        { name: 'apiKey', type: 'string', required: false, desc: 'Custom Gemini key or server fallback.' },
        { name: 'model', type: 'string', required: true, desc: 'gemini-2.5-flash, gemini-2.5-pro, gemini-3.8-flash.' },
      ],
      codeExample: {
        lang: 'typescript',
        code: `import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const responseStream = await ai.models.generateContentStream({
  model: 'gemini-2.5-flash',
  contents: [{ role: 'user', parts: [{ text: 'Hello Hana!' }] }],
});`,
      },
    },
  },

  // 8. ANTHROPIC API
  {
    id: 'anthropic',
    path: '/docs/api/anthropic',
    title: 'Anthropic Claude API Integration',
    category: 'AI Model APIs',
    tagline: 'Claude 3.7 Sonnet & Claude 3.5 Haiku intelligent reasoning',
    logoUrl: 'https://muxai.vercel.app/logos/claude.jpg',
    content: {
      overview:
        'Anthropic Claude delivers high steerability and deep nuanced conversational responses. AI Smash interfaces directly with the Anthropic Messages API with SSE streaming for Claude 3.7 Sonnet and Claude 3.5 Haiku.',
      prerequisites: [
        'Anthropic Console API Key from https://console.anthropic.com',
      ],
      steps: [
        {
          title: '1. Create Anthropic Key',
          desc: 'Under Anthropic Console -> API Keys -> Create Key.',
        },
        {
          title: '2. Select in Model Selector',
          desc: 'Paste your key into the Anthropic API configuration card in the Model Selector.',
        },
      ],
      parameters: [
        { name: 'x-api-key', type: 'string (sk-ant-...)', required: true, desc: 'Anthropic authentication key.' },
        { name: 'model', type: 'string', required: true, desc: 'claude-3-7-sonnet-20250219 or claude-3-5-haiku-20241022.' },
      ],
      codeExample: {
        lang: 'bash',
        code: `curl https://api.anthropic.com/v1/messages \\
  -H "x-api-key: sk-ant-..." \\
  -H "anthropic-version: 2023-06-01" \\
  -H "content-type: application/json" \\
  -d '{
    "model": "claude-3-7-sonnet-20250219",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello Claude"}]
  }'`,
      },
    },
  },

  // 9. xAI API
  {
    id: 'xai',
    path: '/docs/api/xai',
    title: 'xAI Grok API Integration',
    category: 'AI Model APIs',
    tagline: 'Grok 2 and Grok Beta with frontier reasoning',
    logoUrl: 'https://muxai.vercel.app/logos/grok.jpg',
    content: {
      overview:
        'xAI\'s Grok models provide witty, real-time grounded intelligence. AI Smash communicates with xAI\'s OpenAI-compatible completions endpoint with streaming tokens.',
      prerequisites: ['xAI Console API Key from https://console.x.ai'],
      parameters: [
        { name: 'apiKey', type: 'string', required: true, desc: 'xAI API Key.' },
        { name: 'model', type: 'string', required: true, desc: 'grok-2-latest or grok-beta.' },
      ],
      codeExample: {
        lang: 'bash',
        code: `curl https://api.x.ai/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer xai-..." \\
  -d '{"model": "grok-2-latest", "messages": [{"role": "user", "content": "Hello Grok!"}], "stream": true}'`,
      },
    },
  },

  // 10. GROQ API
  {
    id: 'groq',
    path: '/docs/api/groq',
    title: 'Groq LPU Inference API',
    category: 'AI Model APIs',
    tagline: 'Ultra-fast Llama 3.3 70B & Llama 3.1 8B at hundreds of tokens per second',
    logoUrl: 'https://muxai.vercel.app/logos/groq.jpg',
    content: {
      overview:
        'Groq\'s Language Processing Unit (LPU) architecture enables blazing fast inference speeds exceeding 400+ tokens/sec on open-weights models like Llama 3.3 70B Versatile and Mixtral.',
      prerequisites: ['GroqCloud API Key from https://console.groq.com'],
      parameters: [
        { name: 'apiKey', type: 'string (gsk_...)', required: true, desc: 'Groq API Key.' },
        { name: 'model', type: 'string', required: true, desc: 'llama-3.3-70b-versatile or llama-3.1-8b-instant.' },
      ],
      codeExample: {
        lang: 'bash',
        code: `curl https://api.groq.com/openai/v1/chat/completions \\
  -H "Authorization: Bearer gsk_..." \\
  -H "Content-Type: application/json" \\
  -d '{"model": "llama-3.3-70b-versatile", "messages": [{"role": "user", "content": "Fast answer"}], "stream": true}'`,
      },
    },
  },

  // 11. Z.ai GLM API
  {
    id: 'zai',
    path: '/docs/api/zai',
    title: 'Z.ai GLM API Integration',
    category: 'AI Model APIs',
    tagline: 'Zhipu AI GLM-4 Plus & GLM-4 Flash language models',
    logoUrl: 'https://muxai.vercel.app/logos/zai.jpg',
    content: {
      overview:
        'Zhipu AI (Z.ai) GLM-4 provides advanced bilingual reasoning and high-speed chat capabilities.',
      prerequisites: ['Z.ai API Key from https://open.bigmodel.cn'],
      parameters: [
        { name: 'apiKey', type: 'string', required: true, desc: 'Z.ai API token.' },
        { name: 'model', type: 'string', required: true, desc: 'glm-4-plus or glm-4-flash.' },
      ],
    },
  },

  // 12. DEEPSEEK API
  {
    id: 'deepseek',
    path: '/docs/api/deepseek',
    title: 'DeepSeek API Integration',
    category: 'AI Model APIs',
    tagline: 'DeepSeek-V3 & DeepSeek-R1 reasoning models',
    logoUrl: 'https://muxai.vercel.app/logos/deepseek.jpg',
    content: {
      overview:
        'DeepSeek-V3 and DeepSeek-R1 deliver powerful mathematical reasoning and open-weights intelligence via standard OpenAI-compatible completions endpoints.',
      prerequisites: ['DeepSeek API Key from https://platform.deepseek.com'],
      parameters: [
        { name: 'apiKey', type: 'string', required: true, desc: 'DeepSeek API Key.' },
        { name: 'model', type: 'string', required: true, desc: 'deepseek-chat or deepseek-reasoner.' },
      ],
      codeExample: {
        lang: 'bash',
        code: `curl https://api.deepseek.com/chat/completions \\
  -H "Authorization: Bearer sk-..." \\
  -H "Content-Type: application/json" \\
  -d '{"model": "deepseek-chat", "messages": [{"role": "user", "content": "Hello DeepSeek"}], "stream": true}'`,
      },
    },
  },

  // 13. QWEN API
  {
    id: 'qwen',
    path: '/docs/api/qwen',
    title: 'Qwen Alibaba Cloud API Integration',
    category: 'AI Model APIs',
    tagline: 'Alibaba Cloud DashScope Qwen-Max & Qwen-Turbo',
    logoUrl: 'https://muxai.vercel.app/logos/qwen.jpg',
    content: {
      overview:
        'Alibaba Cloud Qwen series offers leading bilingual and multilingual benchmark performance.',
      prerequisites: ['Alibaba Cloud DashScope API Key from https://dashscope.console.aliyun.com'],
      parameters: [
        { name: 'apiKey', type: 'string', required: true, desc: 'DashScope API Key.' },
        { name: 'model', type: 'string', required: true, desc: 'qwen-max or qwen-turbo.' },
      ],
    },
  },

  // 14. HUGGING FACE API
  {
    id: 'huggingface',
    path: '/docs/api/huggingface',
    title: 'Hugging Face Inference API',
    category: 'AI Model APIs',
    tagline: 'Serverless Router & Inference endpoints across thousands of open-source models',
    logoUrl: 'https://muxai.vercel.app/logos/huggingface.jpg',
    content: {
      overview:
        'Directly stream thousands of community and foundation models deployed on Hugging Face Serverless Router endpoints using your HF User Access Token.',
      prerequisites: ['Hugging Face User Access Token (read permissions) from https://huggingface.co/settings/tokens'],
      parameters: [
        { name: 'apiKey', type: 'string (hf_...)', required: true, desc: 'Hugging Face Access Token.' },
        { name: 'model', type: 'string', required: true, desc: 'Repo ID (e.g. meta-llama/Llama-3.3-70B-Instruct).' },
      ],
      codeExample: {
        lang: 'bash',
        code: `curl https://router.huggingface.co/hf-inference/v1/chat/completions \\
  -H "Authorization: Bearer hf_..." \\
  -H "Content-Type: application/json" \\
  -d '{"model": "meta-llama/Llama-3.3-70B-Instruct", "messages": [{"role": "user", "content": "Hi"}], "stream": true}'`,
      },
    },
  },
];

export const DocsPage: React.FC<DocsPageProps> = ({
  currentPath,
  onNavigate,
  onBackToChat,
  onBackToHome,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Normalize path to match article
  const activeArticle = useMemo(() => {
    const cleanPath = currentPath.replace(/\/+$/, '');
    const found = DOCS_ARTICLES.find(
      (a) => a.path === cleanPath || a.path === currentPath
    );
    return found || DOCS_ARTICLES[0];
  }, [currentPath]);

  // Filter sidebar articles by search query
  const filteredArticles = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return DOCS_ARTICLES;
    return DOCS_ARTICLES.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.tagline.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const categories = ['Getting Started', 'AI Model APIs', 'Integrations'] as const;

  const handleCopyCode = (code: string, index: number) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCopiedCodeIndex(index);
      setTimeout(() => setCopiedCodeIndex(null), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fc] dark:bg-[#0d0f16] text-[#1e2029] dark:text-[#f1f2f6] flex flex-col font-sans transition-colors">
      {/* Top GitBook-style Navigation Bar */}
      <header className="sticky top-0 z-40 w-full h-14 bg-white/90 dark:bg-[#11131c]/90 backdrop-blur-md border-b border-black/[0.08] dark:border-white/[0.08] px-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            className="md:hidden p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            {isMobileSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {/* Logo / Brand */}
          <button
            type="button"
            onClick={onBackToHome}
            className="flex items-center gap-2 text-left cursor-pointer group"
          >
            <div className="w-7 h-7 rounded-xl overflow-hidden ring-1 ring-black/10 dark:ring-white/10 shadow-xs bg-white p-0.5">
              <img
                src={AI_PROFILE.avatarUrl}
                alt={AI_PROFILE.name}
                className="w-full h-full object-cover rounded-lg"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm tracking-tight font-heading">
                AI Smash
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--theme-accent-soft)] text-[var(--theme-accent)] font-semibold">
                DOCS
              </span>
            </div>
          </button>

          {/* Breadcrumbs */}
          <div className="hidden sm:flex items-center gap-1 text-xs text-neutral-400 dark:text-neutral-500 ml-3 pl-3 border-l border-black/[0.08] dark:border-white/[0.08]">
            <span
              onClick={() => onNavigate('/docs')}
              className="hover:text-neutral-900 dark:hover:text-white cursor-pointer"
            >
              Docs
            </span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-neutral-600 dark:text-neutral-300 font-medium truncate max-w-[140px]">
              {activeArticle.category}
            </span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-[var(--theme-accent)] font-semibold truncate max-w-[160px]">
              {activeArticle.title}
            </span>
          </div>
        </div>

        {/* Right CTA links */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackToHome}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Home</span>
          </button>

          <button
            type="button"
            onClick={onBackToChat}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[var(--theme-accent)] hover:opacity-90 text-white shadow-xs active:scale-95 transition-all cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5 stroke-[2.2]" />
            <span>Open Chat</span>
          </button>
        </div>
      </header>

      {/* Main 2-column Layout */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        {/* Left Sidebar (GitBook style navigation) */}
        <aside
          className={`fixed inset-y-14 left-0 z-30 w-72 bg-white dark:bg-[#11131c] border-r border-black/[0.08] dark:border-white/[0.08] flex flex-col p-4 transition-transform duration-200 md:static md:translate-x-0 ${
            isMobileSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
          }`}
        >
          {/* Quick Search */}
          <div className="relative mb-4">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search docs, APIs, hooks..."
              className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-xl bg-neutral-100 dark:bg-[#1a1d2b] border border-black/[0.06] dark:border-white/[0.06] text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-[var(--theme-accent)]"
            />
          </div>

          {/* Navigation Categories */}
          <div className="flex-1 overflow-y-auto space-y-5 scrollbar-thin pr-1">
            {categories.map((cat) => {
              const catArticles = filteredArticles.filter((a) => a.category === cat);
              if (catArticles.length === 0) return null;

              return (
                <div key={cat} className="space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-semibold px-2">
                    {cat}
                  </div>
                  <div className="space-y-0.5">
                    {catArticles.map((art) => {
                      const isActive = art.id === activeArticle.id;
                      return (
                        <button
                          key={art.id}
                          type="button"
                          onClick={() => {
                            onNavigate(art.path);
                            setIsMobileSidebarOpen(false);
                          }}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-left text-xs transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-[var(--theme-accent-soft)] text-neutral-900 dark:text-white font-semibold'
                              : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800/60 font-normal'
                          }`}
                        >
                          {art.logoUrl ? (
                            <div className="w-4 h-4 rounded-md overflow-hidden shrink-0 border border-black/10 dark:border-white/10 bg-white">
                              <img
                                src={art.logoUrl}
                                alt={art.title}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            <BookOpen className="w-3.5 h-3.5 shrink-0 text-neutral-400" />
                          )}
                          <span className="truncate">{art.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Mobile backdrop */}
        {isMobileSidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/50 md:hidden"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}

        {/* Center Documentation Article Body */}
        <main className="flex-1 p-6 sm:p-10 max-w-4xl min-w-0">
          {/* Article Header */}
          <div className="pb-6 border-b border-black/[0.08] dark:border-white/[0.08] mb-8">
            <div className="flex items-center gap-3 mb-3">
              {activeArticle.logoUrl && (
                <div className="w-12 h-12 rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 shadow-sm bg-white p-0.5 shrink-0">
                  <img
                    src={activeArticle.logoUrl}
                    alt={activeArticle.title}
                    className="w-full h-full object-cover rounded-xl"
                  />
                </div>
              )}
              <div>
                <span className="text-xs font-mono text-[var(--theme-accent)] font-semibold uppercase tracking-wider">
                  {activeArticle.category}
                </span>
                <h1 className="text-2xl sm:text-3xl font-bold font-heading text-neutral-900 dark:text-white tracking-tight mt-0.5">
                  {activeArticle.title}
                </h1>
              </div>
            </div>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed max-w-2xl">
              {activeArticle.tagline}
            </p>
          </div>

          {/* Overview Section */}
          <section className="mb-8">
            <h2 className="text-lg font-bold font-heading text-neutral-900 dark:text-white mb-2">
              Overview
            </h2>
            <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
              {activeArticle.content.overview}
            </p>
          </section>

          {/* Prerequisites */}
          {activeArticle.content.prerequisites && (
            <section className="mb-8 p-4 rounded-2xl bg-neutral-100/70 dark:bg-neutral-900/60 border border-black/[0.06] dark:border-white/[0.06]">
              <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-500 mb-2">
                Prerequisites
              </h3>
              <ul className="space-y-1.5 text-xs text-neutral-700 dark:text-neutral-300">
                {activeArticle.content.prerequisites.map((req, rIdx) => (
                  <li key={rIdx} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-accent)] mt-1.5 shrink-0" />
                    <span>{req}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Setup Steps */}
          {activeArticle.content.steps && (
            <section className="mb-8 space-y-4">
              <h2 className="text-lg font-bold font-heading text-neutral-900 dark:text-white">
                Step-by-Step Configuration
              </h2>
              <div className="space-y-3">
                {activeArticle.content.steps.map((st, sIdx) => (
                  <div
                    key={sIdx}
                    className="p-4 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#141622] shadow-xs"
                  >
                    <h4 className="text-sm font-bold text-neutral-900 dark:text-white">
                      {st.title}
                    </h4>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1 leading-relaxed">
                      {st.desc}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Slash Commands Table (for Discord) */}
          {activeArticle.content.slashCommands && (
            <section className="mb-8">
              <h2 className="text-lg font-bold font-heading text-neutral-900 dark:text-white mb-3">
                Supported Slash Commands
              </h2>
              <div className="overflow-x-auto rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#141622]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 dark:bg-neutral-900/80 border-b border-black/[0.06] dark:border-white/[0.06] text-neutral-500 font-mono">
                    <tr>
                      <th className="p-3">Command</th>
                      <th className="p-3">Function</th>
                      <th className="p-3">Example</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
                    {activeArticle.content.slashCommands.map((sc, scIdx) => (
                      <tr key={scIdx}>
                        <td className="p-3 font-mono font-bold text-[var(--theme-accent)]">
                          {sc.cmd}
                        </td>
                        <td className="p-3 text-neutral-700 dark:text-neutral-300">
                          {sc.desc}
                        </td>
                        <td className="p-3 font-mono text-neutral-500">
                          {sc.example}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Parameters Table */}
          {activeArticle.content.parameters && (
            <section className="mb-8">
              <h2 className="text-lg font-bold font-heading text-neutral-900 dark:text-white mb-3">
                Configuration Fields
              </h2>
              <div className="overflow-x-auto rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#141622]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 dark:bg-neutral-900/80 border-b border-black/[0.06] dark:border-white/[0.06] text-neutral-500 font-mono">
                    <tr>
                      <th className="p-3">Field</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Required</th>
                      <th className="p-3">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
                    {activeArticle.content.parameters.map((param, pIdx) => (
                      <tr key={pIdx}>
                        <td className="p-3 font-mono font-semibold text-neutral-900 dark:text-white">
                          {param.name}
                        </td>
                        <td className="p-3 font-mono text-neutral-500">
                          {param.type}
                        </td>
                        <td className="p-3">
                          {param.required ? (
                            <span className="px-1.5 py-0.5 rounded font-mono text-[9px] bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300">
                              REQUIRED
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded font-mono text-[9px] bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                              OPTIONAL
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-neutral-700 dark:text-neutral-300">
                          {param.desc}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Code Snippet Example with Copy Button */}
          {activeArticle.content.codeExample && (
            <section className="mb-8">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5" />
                  Code / Request Example ({activeArticle.content.codeExample.lang})
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    handleCopyCode(activeArticle.content.codeExample!.code, 100)
                  }
                  className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                >
                  {copiedCodeIndex === 100 ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-500" />
                      <span className="text-emerald-500">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>

              <div className="relative rounded-2xl bg-[#090b10] border border-black/20 dark:border-white/10 p-4 font-mono text-xs text-sky-200 overflow-x-auto shadow-inner leading-relaxed">
                <pre>{activeArticle.content.codeExample.code}</pre>
              </div>
            </section>
          )}

          {/* Pro Tips Callout */}
          {activeArticle.content.tips && (
            <section className="p-4 rounded-2xl bg-[var(--theme-accent-soft)] border border-[var(--theme-border)] space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-[var(--theme-accent)] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Pro-Tips & Performance Notes
              </h4>
              <ul className="space-y-1 text-xs text-neutral-700 dark:text-neutral-300">
                {activeArticle.content.tips.map((tip, tIdx) => (
                  <li key={tIdx} className="flex items-start gap-2">
                    <span>&bull;</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Footer Navigation */}
          <div className="mt-12 pt-6 border-t border-black/[0.08] dark:border-white/[0.08] flex items-center justify-end text-xs text-neutral-500">
            <button
              type="button"
              onClick={onBackToChat}
              className="text-[var(--theme-accent)] hover:underline font-semibold cursor-pointer"
            >
              Test in Live Chat &rarr;
            </button>
          </div>
        </main>
      </div>
    </div>
  );
};
