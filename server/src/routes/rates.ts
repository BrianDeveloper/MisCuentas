import { Router } from 'express';
import { db, getLatestRate, rows, upsertRate, type Rate } from '../db.js';
import { requireAuth } from '../auth.js';
import { fetchBcvToday } from '../bcv.js';

export const ratesRouter = Router();
ratesRouter.use(requireAuth);

ratesRouter.get('/latest', (_req, res) => {
  const latest = getLatestRate();
  res.json({ rate: latest });
});

ratesRouter.get('/history', (req, res) => {
  const limit = Math.min(
    Number(req.query.limit ?? 15),
    60,
  );
  const rowsArr = rows<Rate>(
    'SELECT date, usd_ves FROM rates ORDER BY date DESC LIMIT ?',
    limit,
  );
  res.json({ history: rowsArr });
});

ratesRouter.post('/refresh', async (_req, res) => {
  try {
    const bcv = await fetchBcvToday();
    if (!bcv) {
      res
        .status(502)
        .json({
          error:
            'No se pudo obtener la tasa del BCV. Revisa tu conexión o ingrésala manualmente.',
        });
      return;
    }
    upsertRate(bcv.date, bcv.usd_ves, bcv.eur_ves);
    const latest = getLatestRate();
    res.json({ ok: true, rate: latest });
  } catch {
    res
      .status(502)
      .json({ error: 'Error al consultar el BCV. Intenta nuevamente.' });
  }
});

ratesRouter.post('/', (req, res) => {
  const date = (req.body?.date ?? '').toString();
  const usd_ves = Number(req.body?.usd_ves);
  const eur_ves = Number(req.body?.eur_ves);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'Fecha inválida (use YYYY-MM-DD)' });
    return;
  }
  if (!Number.isFinite(usd_ves) || usd_ves <= 0) {
    res.status(400).json({ error: 'Tasa inválida, debe ser mayor a 0' });
    return;
  }
  upsertRate(date, usd_ves, Number.isFinite(eur_ves) && eur_ves > 0 ? eur_ves : 0);
  const latest = getLatestRate();
  res.json({ ok: true, rate: latest, date, usd_ves, eur_ves });
});