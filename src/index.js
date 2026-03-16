import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { optionalAuth } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import gamesRoutes from './routes/games.js';
import usersRoutes from './routes/users.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check for free hosts (Render, Railway, etc.)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'golf-app-api' });
});

// Auth (no token required)
app.use('/auth', authRoutes);

// API: parse JWT if present; protected routes enforce via requireAuth
app.use('/api', optionalAuth);
app.use('/api/games', gamesRoutes);
app.use('/api/users', usersRoutes);

app.listen(PORT, () => {
  console.log(`Golf app API running on port ${PORT}`);
});
