import { Router } from 'express';
import { getRecentMovements } from '../db.js';
import { requireAuth } from '../auth.js';

export const movementsRouter = Router();
movementsRouter.use(requireAuth);

movementsRouter.get('/recent', (req, res) => {
  const raw = Number(req.query.limit ?? 10);
  const limit = Number.isFinite(raw)
    ? Math.min(Math.max(Math.floor(raw), 1), 50)
    : 10;
  res.json({ movements: getRecentMovements(limit) });
});