import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import QRCode from 'qrcode';
import {
  getQr,
  getStatus,
  initWhatsApp,
  linkWhatsApp,
  sendMessage,
  unlinkWhatsApp,
} from './whatsapp.js';

const port = Number(process.env.PORT || 3100);
const WA_SECRET = (process.env.WA_SECRET ?? '').trim();

function corsMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (_req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
}

function requireSecret(req: Request, res: Response): boolean {
  if (WA_SECRET) {
    if (req.headers.authorization !== `Bearer ${WA_SECRET}`) {
      res.status(401).json({ error: 'No autorizado.' });
      return false;
    }
  }
  return true;
}

const app = express();
app.use(corsMiddleware);
app.use(express.json({ limit: '2mb' }));

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'mis-cuentas-wa-worker', ...getStatus() });
});

app.get('/status', (_req, res) => {
  res.json(getStatus());
});

app.post('/link', async (_req, res) => {
  try {
    const qr = await linkWhatsApp();
    const connected = getStatus().connected;
    res.json({ connected, hasQr: Boolean(qr) && !connected });
  } catch (err) {
    console.error('[wa] error al vincular:', err);
    res.status(500).json({ error: 'No se pudo iniciar la vinculación.' });
  }
});

app.get('/qr.png', async (req, res) => {
  const qr = getQr();
  if (!qr) {
    res.status(404).json({ error: 'Sin QR disponible.' });
    return;
  }
  try {
    const png = await QRCode.toBuffer(qr, { width: 320, margin: 2 });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.send(png);
  } catch (err) {
    console.error('[wa] error QR:', err);
    res.status(500).json({ error: 'No se pudo generar el QR.' });
  }
});

app.post('/send', async (req, res) => {
  if (!requireSecret(req, res)) return;
  const to = (req.body?.to ?? '').toString().trim();
  const text = (req.body?.text ?? '').toString();
  const imageUrlRaw = (req.body?.imageUrl ?? '').toString().trim();
  const imageUrl = /^https?:\/\//i.test(imageUrlRaw) ? imageUrlRaw : '';
  if (!to || !text) {
    res.status(400).json({ error: 'Faltan el teléfono o el mensaje.' });
    return;
  }
  if (!getStatus().connected) {
    res.status(409).json({ error: 'WhatsApp no está vinculado.' });
    return;
  }
  try {
    await sendMessage(to, text, imageUrl);
    res.json({ ok: true });
  } catch (err) {
    console.error('[wa] error al enviar:', err);
    res.status(500).json({ error: (err as Error).message || 'No se pudo enviar el mensaje.' });
  }
});

app.post('/unlink', async (_req, res) => {
  if (!requireSecret(_req, res)) return;
  try {
    await unlinkWhatsApp();
    res.json({ ok: true });
  } catch (err) {
    console.error('[wa] error al desvincular:', err);
    res.status(500).json({ error: 'No se pudo desvincular.' });
  }
});

app.listen(port, () => {
  console.log(`[wa] Worker WhatsApp escuchando en el puerto ${port}`);
  console.log(`[wa] Sesión local en: ./data/wa`);
  console.log(
    `[wa] Respaldo de sesión en Supabase Storage: ${process.env.SUPABASE_URL ? 'activado (bucket "wa")' : 'desactivado (suponer la app en local)'}`,
  );
  void initWhatsApp();
});