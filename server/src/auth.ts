import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db, getSetting, setSetting } from './db.js';

const SESSION_DAYS = 30;

function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pin, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPin(pin: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const hash = crypto.scryptSync(pin, parts[0], 64);
  return crypto.timingSafeEqual(hash, Buffer.from(parts[1], 'hex'));
}

export function isConfigured(): boolean {
  return Boolean(getSetting('pin_hash'));
}

export function configurePin(pin: string): void {
  setSetting('pin_hash', hashPin(pin));
}

export function checkPin(pin: string): boolean {
  const stored = getSetting('pin_hash');
  if (!stored) return false;
  return verifyPin(pin, stored);
}

function createSession(): { token: string; expiresAt: string } {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  db.prepare(
    'INSERT INTO sessions (token, created_at, expires_at) VALUES (?, ?, ?)',
  ).run(token, now.toISOString(), expiresAt);
  return { token, expiresAt };
}

export function destroySession(token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function isSecureRequest(req: Request): boolean {
  return req.secure || req.get('x-forwarded-proto') === 'https';
}

export function setSessionCookie(res: Response, req: Request): void {
  const { token } = createSession();
  res.cookie('session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie('session', { httpOnly: true, sameSite: 'lax' });
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = (req.cookies as Record<string, string> | undefined)?.session;
  if (!token) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }
  const row = db
    .prepare('SELECT expires_at FROM sessions WHERE token = ?')
    .get(token) as { expires_at: string } | undefined;
  if (!row) {
    res.status(401).json({ error: 'Sesión inválida' });
    return;
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    destroySession(token);
    res.status(401).json({ error: 'Sesión expirada' });
    return;
  }
  next();
}