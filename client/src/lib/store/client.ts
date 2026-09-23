import { QueryClient } from '@tanstack/react-query';
import type { PersistedClient } from '@tanstack/query-persist-client-core';
import { del, get, set } from 'idb-keyval';

const persistenceKey = 'mc-query-v1';

const persister = {
  persistClient: async (client: PersistedClient): Promise<void> => {
    await set(persistenceKey, client);
  },
  restoreClient: async (): Promise<PersistedClient | undefined> => {
    return get<PersistedClient>(persistenceKey);
  },
  removeClient: async (): Promise<void> => {
    await del(persistenceKey);
  },
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      gcTime: 1000 * 60 * 60 * 24 * 30,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export { persister };

export const PERSIST_MAX_AGE = 1000 * 60 * 60 * 24 * 30;
export const PERSIST_BUSTER = 'v1';