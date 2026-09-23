import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Client, type ClientSummary, type Movement, type Rate } from '../api';
import { useCachedData } from './useCachedData';
import { queryClient } from './client';
import { keys, TTL } from './keys';
import { invalidarAgregados } from './invalidations';
import { queuedApi } from '../offline';
import type { HomeData } from './home';

export interface ClientsList {
  clients: ClientSummary[];
  rate: Rate | null;
}

export interface ClienteDetail {
  client: Client;
  movements: Movement[];
  rate: Rate | null;
}

export interface ClienteInput {
  name: string;
  phone: string;
  notes: string;
  tempId?: number;
}

export type { HomeData };

/** Slice Clientes: lista. */
export function useClientesStore(onError?: (err: unknown) => void) {
  return useCachedData<ClientsList>(
    keys.clients,
    () => api<ClientsList>('clients', { query: { action: 'list' } }),
    { ttlMs: TTL.clients, onError },
  );
}

/** Slice Clientes: detalle (ficha + movimientos + tasa). */
export function useClienteStore(
  id: number,
  onError?: (err: unknown) => void,
) {
  return useCachedData<ClienteDetail>(
    keys.client(id),
    () =>
      api<ClienteDetail>('clients', {
        query: { action: 'get', id },
      }),
    { ttlMs: TTL.client, onError },
  );
}

/** Inserta o reemplaza el resumen de un cliente en la lista y en Home (si está cacheado). */
function upsertClienteResumen(entry: ClientSummary): void {
  const apply = (list: ClientSummary[]): ClientSummary[] => {
    const idx = list.findIndex((c) => c.client.id === entry.client.id);
    if (idx === -1) return [entry, ...list];
    return list.map((c) => (c.client.id === entry.client.id ? entry : c));
  };

  const list = queryClient.getQueryData<ClientsList>([keys.clients]);
  if (list) {
    queryClient.setQueryData<ClientsList>([keys.clients], {
      ...list,
      clients: apply(list.clients),
    });
  }

  const home = queryClient.getQueryData<HomeData>([keys.home]);
  if (home) {
    queryClient.setQueryData<HomeData>([keys.home], {
      ...home,
      clients: apply(home.clients),
    });
  }
}

/** Mutación optimista: crear cliente. Reemplaza el temp por el real devuelto por el .select(). */
export function useCreateCliente() {
  const queryClient = useQueryClient();

  return useMutation<
    { queued: boolean; client?: Client },
    Error,
    ClienteInput,
    { prev: ClientsList | undefined; home: HomeData | undefined; tempId: number }
  >({
    mutationFn: async (input) => {
      const tempId = input.tempId ?? new Date().getTime() * -1;
      const { queued, result } = await queuedApi<{ client: Client }>(
        'clients',
        {
          method: 'POST',
          query: { action: 'create' },
          body: {
            name: input.name,
            phone: input.phone,
            notes: input.notes,
            temp_id: tempId,
          },
        },
        'client-create',
        { ...input, temp_id: tempId },
      );
      return { queued, client: result?.client };
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: [keys.clients] });
      const prev = queryClient.getQueryData<ClientsList>([keys.clients]);
      const home = queryClient.getQueryData<HomeData>([keys.home]);
      const tempId = input.tempId ?? new Date().getTime() * -1;
      const optimistic: ClientSummary = {
        client: {
          id: tempId,
          name: input.name,
          phone: input.phone,
          notes: input.notes,
          created_at: new Date().toISOString(),
        },
        saldo_usd: 0,
        saldo_bs: 0,
        last_activity: null,
      };
      upsertClienteResumen(optimistic);
      return { prev, home, tempId };
    },
    onSuccess: (_data, _input, ctx) => {
      if (_data.queued || !_data.client || !ctx) return;
      const real: ClientSummary = {
        client: _data.client,
        saldo_usd: 0,
        saldo_bs: 0,
        last_activity: null,
      };
      upsertClienteResumen(real);
      removeTempEntry(ctx.tempId);
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) queryClient.setQueryData([keys.clients], ctx.prev);
      if (ctx?.home) queryClient.setQueryData([keys.home], ctx.home);
    },
  });
}

/** Quita la entrada con id temporal (negativo) de lista y Home. */
function removeTempEntry(tempId: number): void {
  const prune = <T extends { client: { id: number } }>(list: T[]): T[] =>
    list.filter((c) => c.client.id !== tempId);

  const list = queryClient.getQueryData<ClientsList>([keys.clients]);
  if (list) {
    queryClient.setQueryData<ClientsList>([keys.clients], {
      ...list,
      clients: prune(list.clients),
    });
  }
  const home = queryClient.getQueryData<HomeData>([keys.home]);
  if (home) {
    queryClient.setQueryData<HomeData>([keys.home], {
      ...home,
      clients: prune(home.clients),
    });
  }
}

/** Mutación optimista: eliminar cliente. */
export function useDeleteCliente() {
  const queryClient = useQueryClient();

  return useMutation<
    { queued: boolean },
    Error,
    { id: number },
    { prev: ClientsList | undefined; home: HomeData | undefined }
  >({
    mutationFn: async ({ id }) => {
      const { queued } = await queuedApi<{ ok: boolean }>(
        'clients',
        { method: 'DELETE', query: { action: 'delete', id } },
        'client-delete',
        { id },
      );
      return { queued };
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: [keys.clients] });
      const prev = queryClient.getQueryData<ClientsList>([keys.clients]);
      const home = queryClient.getQueryData<HomeData>([keys.home]);
      const prune = (list: ClientSummary[] | undefined) =>
        (list ?? []).filter((c) => c.client.id !== id);
      if (prev) {
        queryClient.setQueryData<ClientsList>([keys.clients], {
          ...prev,
          clients: prune(prev.clients),
        });
      }
      if (home) {
        queryClient.setQueryData<HomeData>([keys.home], {
          ...home,
          clients: prune(home.clients),
        });
      }
      return { prev, home };
    },
    onSuccess: () => {
      invalidarAgregados();
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) queryClient.setQueryData([keys.clients], ctx.prev);
      if (ctx?.home) queryClient.setQueryData([keys.home], ctx.home);
    },
  });
}