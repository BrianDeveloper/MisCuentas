import { supabase } from './db.ts';

const SESSION_DAYS = 30;
const scrypt = (await import('npm:scrypt-js@3.0.1')).default;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function scryptHash(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const hash = await scrypt.scrypt(
    new TextEncoder().encode(pin),
    salt,
    16384,
    8,
    1,
    64,
  );
  return hash as Uint8Array;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await scryptHash(pin, salt);
  return `${toHex(salt)}:${toHex(hash)}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = fromHex(parts[0]);
    expected = fromHex(parts[1]);
  } catch {
    return false;
  }
  const hash = await scryptHash(pin, salt);
  return constantTimeEqual(hash, expected);
}

export async function isConfigured(): Promise<boolean> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'pin_hash')
    .maybeSingle();
  return Boolean(data);
}

export async function configurePin(pin: string): Promise<void> {
  await supabase.from('app_settings').upsert({
    key: 'pin_hash',
    value: (await hashPin(pin)) as string,
  });
}

export async function checkPin(pin: string): Promise<boolean> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'pin_hash')
    .maybeSingle();
  if (!data) return false;
  return verifyPin(pin, String(data.value));
}

function randomToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function createSession(): Promise<string> {
  const token = randomToken();
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  await supabase.from('app_sessions').insert({
    token,
    created_at: now.toISOString(),
    expires_at: expiresAt,
  });
  return token;
}

export async function destroySession(token: string): Promise<void> {
  await supabase.from('app_sessions').delete().eq('token', token);
}

export function bearerOf(req: Request): string | null {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7).trim();
}

export async function requireAuth(req: Request): Promise<boolean> {
  const token = bearerOf(req);
  if (!token) return false;
  const { data } = await supabase
    .from('app_sessions')
    .select('expires_at')
    .eq('token', token)
    .maybeSingle();
  if (!data) return false;
  if (new Date(String(data.expires_at)).getTime() < Date.now()) {
    await destroySession(token);
    return false;
  }
  return true;
}

const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const BASE_LOCKOUT_MS = 5 * 60 * 1000;
const MAX_LOCKOUT_MS = 15 * 60 * 1000;

export function clientScope(req: Request): string {
  const ip =
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    null;
  return ip ? `ip:${ip}` : 'unknown';
}

interface RateStatus {
  blocked: boolean;
  retryAfterSec: number;
}

export async function authAttemptStatus(scope: string): Promise<RateStatus> {
  const { data } = await supabase
    .from('auth_attempts')
    .select('locked_until')
    .eq('scope', scope)
    .maybeSingle();
  if (!data?.locked_until) return { blocked: false, retryAfterSec: 0 };
  const lockedUntil = new Date(String(data.locked_until)).getTime();
  if (lockedUntil <= Date.now()) return { blocked: false, retryAfterSec: 0 };
  return {
    blocked: true,
    retryAfterSec: Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1000)),
  };
}

export async function recordAuthFail(scope: string): Promise<void> {
  const now = Date.now();
  const { data } = await supabase
    .from('auth_attempts')
    .select('fail_count, window_start')
    .eq('scope', scope)
    .maybeSingle();
  let failCount = 1;
  let windowStart = now;
  if (data) {
    const ws = new Date(String(data.window_start)).getTime();
    if (now - ws <= WINDOW_MS) {
      failCount = (data.fail_count ?? 0) + 1;
      windowStart = ws;
    }
  }
  let lockedUntil: number | null = null;
  if (failCount >= MAX_FAILS) {
    const level = Math.floor(failCount / MAX_FAILS);
    const lockoutMs = Math.min(BASE_LOCKOUT_MS * level, MAX_LOCKOUT_MS);
    lockedUntil = now + lockoutMs;
  }
  await supabase.from('auth_attempts').upsert({
    scope,
    fail_count: failCount,
    window_start: new Date(windowStart).toISOString(),
    locked_until: lockedUntil ? new Date(lockedUntil).toISOString() : null,
  });
}

export async function recordAuthSuccess(scope: string): Promise<void> {
  await supabase.from('auth_attempts').delete().eq('scope', scope);
}