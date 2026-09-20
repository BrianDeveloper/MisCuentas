import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir, getSetting, setSetting } from '../db.js';
import { requireAuth } from '../auth.js';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

const uploadsDir = path.join(dataDir, 'uploads');

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

function readPagoConfig(): Record<string, string> {
  const raw = getSetting('pagoMovil');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

settingsRouter.get('/pago-movil', (_req, res) => {
  const config = readPagoConfig();
  const qrFile = getSetting('pagoMovilQrFile');
  const hasQr = qrFile != null && fs.existsSync(path.join(uploadsDir, qrFile));
  res.json({
    pago: {
      banco: config.banco ?? '',
      tipoDoc: config.tipoDoc ?? 'V',
      documento: config.documento ?? '',
      telefono: config.telefono ?? '',
      hasQr,
      qrFile: qrFile || '' ,
    },
    qrBase: getSetting('pagoQrBase') ?? '',
  });
});

settingsRouter.put('/pago-movil', (req, res) => {
  const banco = (req.body?.banco ?? '').toString().trim();
  const documento = (req.body?.documento ?? '').toString().trim();
  const telefono = (req.body?.telefono ?? '').toString().trim();
  const tipoDoc = ['V', 'J', 'E', 'P'].includes(req.body?.tipoDoc)
    ? (req.body?.tipoDoc as string)
    : 'V';
  if (!banco && !documento && !telefono) {
    res.status(400).json({ error: 'Completa los datos del pago móvil.' });
    return;
  }
  setSetting(
    'pagoMovil',
    JSON.stringify({ banco, tipoDoc, documento, telefono }),
  );
  let baseUrl = (req.body?.baseUrl ?? '').toString().trim().replace(/\/+$/, '');
  if (baseUrl && !/^https?:\/\//i.test(baseUrl)) {
    res.status(400).json({ error: 'La URL del servidor debe empezar con http:// o https://' });
    return;
  }
  setSetting('pagoQrBase', baseUrl);
  const qrFile = getSetting('pagoMovilQrFile');
  const hasQr = qrFile != null && fs.existsSync(path.join(uploadsDir, qrFile));
  res.json({
    ok: true,
    pago: { banco, tipoDoc, documento, telefono, hasQr, qrFile: qrFile || ''  },
    qrBase: baseUrl,
  });
});

settingsRouter.post('/pago-movil/qr', (req, res) => {
  fs.mkdirSync(uploadsDir, { recursive: true });

  const remove = req.body?.remove === true;
  if (remove) {
    const oldFile = getSetting('pagoMovilQrFile');
    if (oldFile) {
      try {
        fs.rmSync(path.join(uploadsDir, oldFile), { force: true });
      } catch {}
    }
    setSetting('pagoMovilQrFile', '');
    res.json({ ok: true, hasQr: false, qrFile: '' });
    return;
  }

  const mime = (req.body?.mime ?? '').toString();
  const ext = MIME_EXT[mime];
  if (!ext) {
    res.status(400).json({ error: 'Formato no soportado (use PNG, JPG o WEBP).' });
    return;
  }
  const b64 = (req.body?.dataBase64 ?? '').toString().replace(/^data:.*?;base64,/, '');
  let buf: Buffer;
  try {
    buf = Buffer.from(b64, 'base64');
  } catch {
    res.status(400).json({ error: 'Imagen inválida.' });
    return;
  }
  if (buf.length < 16 || buf.length > 5 * 1024 * 1024) {
    res.status(400).json({ error: 'Imagen inválida o demasiado grande.' });
    return;
  }

  const oldFile = getSetting('pagoMovilQrFile');
  if (oldFile) {
    try {
      fs.rmSync(path.join(uploadsDir, oldFile), { force: true });
    } catch {}
  }
  const newFile = `qr.${ext}`;
  fs.writeFileSync(path.join(uploadsDir, newFile), buf);
  setSetting('pagoMovilQrFile', newFile);
  res.json({ ok: true, hasQr: true, qrFile: newFile });
});
