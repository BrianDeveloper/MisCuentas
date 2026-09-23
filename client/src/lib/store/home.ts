import { api, type ClientSummary, type Rate, type RecentMovement } from '../api';
import { useCachedData } from './useCachedData';
import { keys, TTL } from './keys';

export interface HomeData {
  clients: ClientSummary[];
  rate: Rate | null;
  movements: RecentMovement[];
}

/** Slice Home: resumen + últimos movimientos. */
export function useHomeStore(onError?: (err: unknown) => void) {
  return useCachedData<HomeData>(
    keys.home,
    () => api<HomeData>('clients', { query: { action: 'home', limit: 10 } }),
    { ttlMs: TTL.home, onError },
  );
}