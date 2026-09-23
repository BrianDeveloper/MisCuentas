import { api, type Rate } from '../api';
import { queryClient } from './client';
import { keys, TTL } from './keys';
import { useCachedData } from './useCachedData';
import type { PagoMovilConfig } from '../whatsapp';

export interface SettingsResp {
  pago: PagoMovilConfig | null;
  msgReminder: string;
  msgPago: string;
}

async function loadSettings(): Promise<SettingsResp> {
  return api<SettingsResp>('settings');
}

async function loadRateHistory(): Promise<Rate[]> {
  const r = await api<{ history: Rate[] }>('rates', {
    query: { action: 'history', limit: 15 },
  });
  return r.history;
}

/** Slice Ajustes (config + mensajes + pago móvil). */
export function useAjustesStore(onError?: (err: unknown) => void) {
  return useCachedData<SettingsResp>(keys.settings, loadSettings, {
    ttlMs: TTL.settings,
    onError,
  });
}

/** Slice historial de tasas (Ajustes). */
export function useRateHistoryStore(onError?: (err: unknown) => void) {
  return useCachedData<Rate[]>(keys.rateHistory, loadRateHistory, {
    ttlMs: TTL.rateHistory,
    onError,
  });
}

/**
 * Acceso no-hook a los ajustes con caché-first (para componentes sin lecturas reactivas).
 * `force` salta la caché (usado tras mutaciones).
 */
export async function getSettings(
  force = false,
): Promise<SettingsResp | null | undefined> {
  if (!force) {
    const cached = queryClient.getQueryData<SettingsResp>([keys.settings]);
    if (cached !== undefined) return cached;
  }
  const fresh = await queryClient.fetchQuery({
    queryKey: [keys.settings],
    queryFn: loadSettings,
    staleTime: TTL.settings,
  });
  return fresh;
}

/** Acceso no-hook al historial de tasas con caché-first. */
export async function getRateHistory(force = false): Promise<Rate[]> {
  if (!force) {
    const cached = queryClient.getQueryData<Rate[]>([keys.rateHistory]);
    if (cached !== undefined) return cached;
  }
  return queryClient.fetchQuery({
    queryKey: [keys.rateHistory],
    queryFn: loadRateHistory,
    staleTime: TTL.rateHistory,
  });
}