import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { attachGeminiLiveServer } from './server/liveBridge.ts';
import {
  generateBargainReply,
  generatePassengerSpeech,
  generateRideEnd,
  generateRideReaction,
  generateRideStart,
  generateTurnDirection,
  generateVoiceBargainReply,
  resetCachedClient,
} from './server/rideDirector.ts';

const isProd = process.env.NODE_ENV === 'production';

if (!isProd) {
  await import('dotenv/config');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || (isProd ? 8080 : 3000));

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      model: 'gemini-3.1-flash-lite',
      hasApiKey: Boolean(process.env.GEMINI_API_KEY?.trim()),
      canConfigureApiKey: !isProd,
    });
  });

  if (!isProd) {
    app.post('/api/settings/api-key', (req, res) => {
      const remoteIp = req.ip || req.socket.remoteAddress || '';
      const isLoopback =
        remoteIp === '127.0.0.1' ||
        remoteIp === '::1' ||
        remoteIp === '::ffff:127.0.0.1';
      if (!isLoopback) {
        res.status(403).json({ error: 'API key can only be updated from localhost.' });
        return;
      }

      const rawKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';
      if (!rawKey || /[\r\n"]/.test(rawKey)) {
        res.status(400).json({ error: 'Please enter a valid Gemini API key.' });
        return;
      }

      const envPath = path.join(__dirname, '.env');
      const escapedLine = `GEMINI_API_KEY="${rawKey}"`;
      let nextContent = '';
      if (fs.existsSync(envPath)) {
        const existing = fs.readFileSync(envPath, 'utf8');
        if (/^GEMINI_API_KEY=.*$/m.test(existing)) {
          nextContent = existing.replace(/^GEMINI_API_KEY=.*$/m, escapedLine);
        } else {
          nextContent = `${existing.trimEnd()}\n${escapedLine}\n`;
        }
      } else {
        nextContent = `${escapedLine}\nAPP_URL="http://localhost:${PORT}"\n`;
      }

      fs.writeFileSync(envPath, nextContent, 'utf8');
      process.env.GEMINI_API_KEY = rawKey;
      resetCachedClient();

      res.json({ ok: true, hasApiKey: true });
    });
  }

  app.post('/api/ride-director/start', async (req, res) => {
    const t0 = Date.now();
    try {
      const data = await generateRideStart(req.body);
      res.json({ data, latencyMs: Date.now() - t0 });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to generate ride start';
      res.status(502).json({ error: message, latencyMs: Date.now() - t0 });
    }
  });

  app.post('/api/ride-director/bargain', async (req, res) => {
    const t0 = Date.now();
    try {
      const data = await generateBargainReply(req.body);
      res.json({ data, latencyMs: Date.now() - t0 });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to negotiate fare';
      res.status(502).json({ error: message, latencyMs: Date.now() - t0 });
    }
  });

  app.post('/api/ride-director/voice-bargain', async (req, res) => {
    const t0 = Date.now();
    try {
      const data = await generateVoiceBargainReply(req.body);
      res.json({ data, latencyMs: Date.now() - t0 });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to process voice bargain';
      res.status(502).json({ error: message, latencyMs: Date.now() - t0 });
    }
  });

  app.post('/api/ride-director/tts', async (req, res) => {
    const t0 = Date.now();
    try {
      const data = await generatePassengerSpeech(req.body);
      res.json({ data, latencyMs: Date.now() - t0 });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to generate passenger voice';
      res.status(502).json({ error: message, latencyMs: Date.now() - t0 });
    }
  });

  app.post('/api/ride-director/turn', async (req, res) => {
    const t0 = Date.now();
    try {
      const data = await generateTurnDirection(req.body);
      res.json({ data, latencyMs: Date.now() - t0 });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to generate turn direction';
      res.status(502).json({ error: message, latencyMs: Date.now() - t0 });
    }
  });

  app.post('/api/ride-director/reaction', async (req, res) => {
    const t0 = Date.now();
    try {
      const data = await generateRideReaction(req.body);
      res.json({ data, latencyMs: Date.now() - t0 });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to generate reaction';
      res.status(502).json({ error: message, latencyMs: Date.now() - t0 });
    }
  });

  app.post('/api/ride-director/end', async (req, res) => {
    const t0 = Date.now();
    try {
      const data = await generateRideEnd(req.body);
      res.json({ data, latencyMs: Date.now() - t0 });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to generate ride summary';
      res.status(502).json({ error: message, latencyMs: Date.now() - t0 });
    }
  });

  // Return JSON 404 for unknown/disabled API routes (e.g. /api/settings/api-key in production)
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  attachGeminiLiveServer(httpServer);

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Rickshaw Rumble server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server startup failed:', err);
  process.exit(1);
});
