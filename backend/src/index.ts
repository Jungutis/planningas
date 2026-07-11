import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import authRoutes from './routes/auth';
import planningRoutes from './routes/planning';
import { initWss } from './ws/wsServer';

dotenv.config();

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

server.listen(PORT, () => {
  console.log(`🚀 Planningas API veikia: http://localhost:${PORT}`);
});

export default app;
