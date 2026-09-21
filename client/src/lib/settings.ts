import { api } from './api';
import type { PagoMovilConfig } from './whatsapp';

export interface SettingsResp {
  pago: PagoMovilConfig | null;
  whatsappBaseUrl: string;
  whatsappToken: string;
}

let cached: SettingsResp | null | undefined;
let cachedAt = 0;
const TTL_MS = 30_000;

export async function getSettings(
  force = false,
): Promise<SettingsResp | null | undefined> {
  const now = Date.now();
  if (!force && cached !== undefined && now - cachedAt < TTL_MS) return cached;
  cached = await api<SettingsResp>('settings').catch(() => null);
  cachedAt = now;
  return cached;
}

export function invalidateSettings(): void {
  cached = undefined;
  cachedAt = 0;
}