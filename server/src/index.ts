import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import cron from 'node-cron';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { authRouter } from './routes/auth.js';
import { clientsRouter } from './routes/clients.js';
import { ratesRouter } from './routes/rates.js';
import { exportRouter } from './routes/export.js';
import { movementsRouter } from './routes/movements.js';
import { settingsRouter } from './routes/settings.js';
import { upsertRate, getLatestRate, dataDir } from './db.js';
import { fetchBcvToday } from './bcv.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3001);
const uploadsDir = path.join(dataDir, 'uploads');

async function refreshBcvRate(): Promise<void> {
  try {
    const bcv = await fetchBcvToday();
    if (bcv) {
      upsertRate(bcv.date, bcv.usd_ves);
      console.log(
        `[BCV] Tasa actualizada ${bcv.date}: ${bcv.usd_ves.toFixed(4)} Bs/USD`,
      );
    } else {
      console.warn('[BCV] No se pudo obtener la tasa del BCV ahora.');
    }
  } catch (err) {
    console.error('[BCV] Error al actualizar tasa:', err);
  }
}

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '3mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});
app.use('/api/auth', authRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/movements', movementsRouter);
app.use('/api/rates', ratesRouter);
app.use('/api/export', exportRouter);
app.use('/api/settings', settingsRouter);
fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/api/pago', express.static(uploadsDir));

const clientDist = path.resolve(here, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      next();
      return;
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  },
);

app.listen(port, () => {
  console.log(`[server] Escuchando en http://localhost:${port}`);
  console.log(
    `[server] Tasa actual almacenada: ${getLatestRate()?.usd_ves ?? 'ninguna'} `,
  );
});

cron.schedule(
  '30 8 * * *',
  () => {
    void refreshBcvRate();
  },
  { timezone: 'America/Caracas' },
);

void refreshBcvRate();