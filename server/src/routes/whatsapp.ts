import { Router } from 'express';
import QRCode from 'qrcode';
import path from 'node:path';
import fs from 'node:fs';
import { dataDir } from '../db.js';
import { requireAuth } from '../auth.js';
import {
  getStatus,
  getQr,
  linkWhatsApp,
  sendImage,
  sendText,
} from '../whatsapp.js';

export const whatsappRouter = Router();
whatsappRouter.use(requireAuth);

whatsappRouter.get('/status', (_req, res) => {
  res.json(getStatus());
});

whatsappRouter.post('/link', async (_req, res) => {
  try {
    const qr = await linkWhatsApp();
    res.json({ connected: getStatus().connected, qr });
  } catch (err) {
    console.error('[whatsapp] error al vincular:', err);
    res.status(500).json({ error: 'No se pudo iniciar la vinculación.' });
  }
});

whatsappRouter.get('/qr.png', async (_req, res) => {
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
    console.error('[whatsapp] error QR:', err);
    res.status(500).json({ error: 'No se pudo generar el QR.' });
  }
});

whatsappRouter.post('/send', async (req, res) => {
  const to = (req.body?.to ?? '').toString().trim();
  const text = (req.body?.text ?? '').toString();
  const attach = req.body?.attach === true;
  if (!to || !text) {
    res.status(400).json({ error: 'Faltan el teléfono o el mensaje.' });
    return;
  }
  if (!getStatus().connected) {
    res.status(409).json({ error: 'WhatsApp no está vinculado.' });
    return;
  }
  try {
    let attachPath: string | null = null;
    if (attach) {
      const qrFile = (req.body?.qrFile ?? '').toString();
      const candidate = path.isAbsolute(qrFile)
        ? qrFile
        : path.join(dataDir, 'uploads', path.basename(qrFile));
      if (qrFile && fs.existsSync(candidate)) attachPath = candidate;
    }
    if (attachPath) {
      await sendImage(to, text, attachPath);
    } else {
      await sendText(to, text);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[whatsapp] error al enviar:', err);
    res.status(500).json({ error: 'No se pudo enviar el mensaje.' });
  }
});