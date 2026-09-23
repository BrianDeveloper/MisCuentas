/** Fábrica central de claves del store (TanStack Query). Claves planas por entidad. */
export const keys = {
  home: 'home',
  clients: 'clients',
  metrics: 'metrics',
  rate: 'rate',
  settings: 'settings',
  rateHistory: 'rate-history',
  client: (id: number) => `client:${id}`,
} as const;

/** TTL por entidad (policy stale-while-revalidate). */
export const TTL = {
  home: 60_000,
  clients: 60_000,
  metrics: 60_000,
  client: 60_000,
  rate: 300_000,
  settings: 30_000,
  rateHistory: 30_000,
} as const;