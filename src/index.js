import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { optionalAuth } from './middleware/auth.js';
import { requestLogger } from './middleware/requestLogger.js';
import { initStore } from './data/store.js';
import authRoutes from './routes/auth.js';
import gamesRoutes from './routes/games.js';
import usersRoutes from './routes/users.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Real-money features are OFF. The app is a scorekeeper / settle-up tracker;
// friends settle off-app. This flag only affects what /health reports.
const MONEY_ENABLED = process.env.MONEY_ENABLED === 'true';

app.use(cors());
app.use(requestLogger);
app.use(express.json());

// Root: so frontend can hit base URL and get a 200
app.get('/', (req, res) => {
  res.json({ service: 'golf-app-api', docs: 'See API.md', health: '/health' });
});

// Health check for free hosts (Render, Railway, etc.)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'golf-app-api', moneyEnabled: MONEY_ENABLED });
});

// Auth (no token required)
app.use('/auth', authRoutes);

// API: parse JWT if present; protected routes enforce via requireAuth
app.use('/api', optionalAuth);
app.use('/api/games', gamesRoutes);
app.use('/api/users', usersRoutes);

async function start() {
  await initStore();
  app.listen(PORT, () => {
    console.log(`Golf app API running on port ${PORT}`);
  });
}
start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// Graceful shutdown (Render sends SIGTERM on redeploy).
import { prisma } from './lib/prisma.js';
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  });
}
