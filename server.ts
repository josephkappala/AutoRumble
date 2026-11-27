import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  generateBargainReply,
  generateRideEnd,
  generateRideReaction,
  generateRideStart,
  generateTurnDirection,
} from './server/rideDirector.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      model: 'gemini-3.1-flash-lite',
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    });
  });

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

  const isProd = process.env.NODE_ENV === 'production';
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Rickshaw Rumble server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server startup failed:', err);
  process.exit(1);
});
