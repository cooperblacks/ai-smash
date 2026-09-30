import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { SYSTEM_PROMPTS, APP_INFO } from './src/constants';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '10mb' }));

const SERAFINA_SYSTEM_PROMPT = SYSTEM_PROMPTS.full;

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    persona: APP_INFO.name,
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
  });
});

// Cloud streaming endpoint for Gemini 3.8 Flash
app.post('/api/chat', async (req: Request, res: Response) => {
  try {
    const { messages, systemPrompt, maxTokens } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Format chat history for GoogleGenAI
    // systemInstruction is passed separately in config
    const formattedContents = (messages || []).map((msg: { role: string; content: string }) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const outputTokens = Math.min(Math.max(Number(maxTokens) || 512, 64), 4096);

    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-3.8-flash',
      contents: formattedContents,
      config: {
        systemInstruction: systemPrompt || SERAFINA_SYSTEM_PROMPT,
        temperature: 0.85,
        maxOutputTokens: outputTokens,
      },
    });

    for await (const chunk of responseStream) {
      const text = chunk.text;
      if (text) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown streaming error';
    console.error('Gemini chat error:', errorMessage);
    if (!res.headersSent) {
      res.status(500).json({ error: errorMessage });
    } else {
      res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
      res.end();
    }
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Serafina server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
