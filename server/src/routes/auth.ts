import { Router } from 'express';
import {
  checkPin,
  clearSessionCookie,
  configurePin,
  destroySession,
  isConfigured,
  requireAuth,
  setSessionCookie,
} from '../auth.js';

export const authRouter = Router();

authRouter.get('/status', (_req, res) => {
  res.json({ configured: isConfigured() });
});

authRouter.get('/me', requireAuth, (_req, res) => {
  res.json({ ok: true });
});

authRouter.post('/setup', (req, res) => {
  if (isConfigured()) {
    res.status(400).json({ error: 'El PIN ya está configurado' });
    return;
  }
  const pin = (req.body?.pin ?? '').toString();
  if (!/^\d{4,6}$/.test(pin)) {
    res
      .status(400)
      .json({ error: 'El PIN debe tener entre 4 y 6 dígitos' });
    return;
  }
  configurePin(pin);
  setSessionCookie(res, req);
  res.json({ ok: true });
});

authRouter.post('/login', (req, res) => {
  const pin = (req.body?.pin ?? '').toString();
  if (!isConfigured() || !checkPin(pin)) {
    res.status(401).json({ error: 'PIN incorrecto' });
    return;
  }
  setSessionCookie(res, req);
  res.json({ ok: true });
});

authRouter.post('/logout', (req, res) => {
  const token = (req.cookies as Record<string, string> | undefined)?.session;
  if (token) destroySession(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.post('/change-pin', requireAuth, (req, res) => {
  const current = (req.body?.current ?? '').toString();
  const next = (req.body?.next ?? '').toString();
  if (!checkPin(current)) {
    res.status(401).json({ error: 'PIN actual incorrecto' });
    return;
  }
  if (!/^\d{4,6}$/.test(next)) {
    res
      .status(400)
      .json({ error: 'El nuevo PIN debe tener entre 4 y 6 dígitos' });
    return;
  }
  configurePin(next);
  res.json({ ok: true });
});