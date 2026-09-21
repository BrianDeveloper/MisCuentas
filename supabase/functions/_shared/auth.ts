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