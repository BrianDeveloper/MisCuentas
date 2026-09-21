import { useCachedData } from './useCachedData';
import { api, type Rate } from './api';
import { cacheSet } from './cache';
import { RATE_TTL_MS } from './cache';

export type { Rate };

export function useRate(): {
  rate: Rate | null;
  refresh: () => Promise<Rate | null>;
  setRate: (r: Rate | null) => Promise<void>;
} {
  const { data, refresh } = useCachedData<{ rate: Rate | null }>(
    'rate',
    () => api<{ rate: Rate | null }>('rates', { query: { action: 'latest' } }),
    { ttlMs: RATE_TTL_MS },
  );

  const setRate = async (r: Rate | null) => {
    cacheSet('rate', { rate: r });
  };

  return {
    rate: data?.rate ?? null,
    setRate,
    refresh: async () => {
      const d = await refresh();
      return d?.rate ?? null;
    },
  };
}