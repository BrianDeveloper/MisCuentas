import { api, type Rate } from '../api';
import { queryClient } from './client';
import { keys, TTL } from './keys';
import { useCachedData } from './useCachedData';

export type { Rate };

/** Slice Tasa del BCV: lectura cacheada (TTL 5 min) + update optimista del store. */
export function useTasaStore(): {
  rate: Rate | null;
  refresh: () => Promise<Rate | null>;
  setRate: (r: Rate | null) => Promise<void>;
} {
  const { data, refresh } = useCachedData<{ rate: Rate | null }>(
    keys.rate,
    () => api<{ rate: Rate | null }>('rates', { query: { action: 'latest' } }),
    { ttlMs: TTL.rate },
  );

  const setRate = async (r: Rate | null) => {
    queryClient.setQueryData([keys.rate], { rate: r });
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