import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import authRoutes from './routes/auth';
import planningRoutes from './routes/planning';
import { initWss } from './ws/wsServer';
import { prisma } from './db';

dotenv.config();

const DEFAULT_LINE_CONFIGS = [
  { id: 'xray', name: 'X-ray', cycleTimeSeconds: 20 },
  { id: 'qlab', name: 'QLab', cycleTimeSeconds: 45 },
  { id: 'smt4', name: 'SMT4', cycleTimeSeconds: 30 },
];

async function seedLineConfigs() {
  for (const lc of DEFAULT_LINE_CONFIGS) {
    await prisma.lineConfig.upsert({
      where: { id: lc.id },
      update: {},
      create: lc,
    });
  }
}

const app = express();
const PORT = parseInt(process.env.PORT || '3002', 10);

const allowedOrigins = [
  'http://localhost:5174',
  'http://localhost:4174',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/planning', planningRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Maršrutas nerastas' });
});

const server = http.createServer(app);
initWss(server);

seedLineConfigs()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`🚀 Planningas API veikia: http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('DB seed failed', err);
    process.exit(1);
  });

export default app;
