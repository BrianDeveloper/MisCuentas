import { api, type Metrics } from '../api';
import { useCachedData } from './useCachedData';
import { keys, TTL } from './keys';

/** Slice Estadísticas / métricas. */
export function useMetricasStore(onError?: (err: unknown) => void) {
  return useCachedData<Metrics>(
    keys.metrics,
    () => api<Metrics>('clients', { query: { action: 'metrics' } }),
    { ttlMs: TTL.metrics, onError },
  );
}