import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type Currency, type Movement, type MovementType, type RecentMovement } from '../api';
import { queryClient } from './client';
import { keys } from './keys';
import { invalidarAgregados } from './invalidations';
import { queuedApi } from '../offline';
import type { ClientsList, ClienteDetail } from './clients';
import type { HomeData } from './home';

export interface MovimientoInput {
  clientId: number;
  type: MovementType;
  currency: Currency;
  amount: number;
  date: string;
  concept: string;
}

interface Balance {
  saldo_usd: number;
  saldo_bs: number;
}

type Prev = { detail: ClienteDetail | undefined; tempId: number };

/** Calcula un movimiento optimista (aproximado) con la tasa vigente. */
function buildOptimisticMovement(input: MovimientoInput, rateUsd: number): Movement {
  const rate_bs = rateUsd > 0 ? rateUsd : 0;
  const amount_usd =
    input.currency === 'USD' ? input.amount : rateUsd > 0 ? input.amount / rateUsd : 0;
  const amount_bs =
    input.currency === 'Bs' ? input.amount : rateUsd > 0 ? input.amount * rateUsd : 0;
  return {
    id: -Date.now(),
    client_id: input.clientId,
    type: input.type,
    currency: input.currency,
    amount: input.amount,
    rate_bs,
    amount_usd,
    amount_bs,
    concept: input.concept,
    date: input.date,
    created_at: new Date().toISOString(),
    saldo_usd: 0,
    saldo_bs: 0,
  };
}

/** Ordena como el servidor (getClientDetail): fecha y id ascendentes. */
function sortChronological(movements: Movement[]): Movement[] {
  return [...movements].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id - b.id,
  );
}

/** Recalcula el saldo corrido (aproximado) tras aplicar un cambio. */
function recomputeSaldos(movements: Movement[]): Movement[] {
  let bs = 0;
  let usd = 0;
  return movements.map((m) => {
    bs += m.type === 'deuda' ? m.amount_bs : -m.amount_bs;
    usd += m.type === 'deuda' ? m.amount_usd : -m.amount_usd;
    return { ...m, saldo_bs: bs, saldo_usd: usd };
  });
}

/** Actualiza la ficha resumen del cliente en el listado y en Home (si están cacheados). */
function patchClienteResumen(
  clientId: number,
  patch: { saldo_usd?: number; saldo_bs?: number; last_activity?: string | null },
): void {
  const apply = <T extends { saldo_usd: number; saldo_bs: number; last_activity: string | null }>(
    entry: T,
  ): T => ({
    ...entry,
    ...(patch.saldo_usd !== undefined ? { saldo_usd: patch.saldo_usd } : {}),
    ...(patch.saldo_bs !== undefined ? { saldo_bs: patch.saldo_bs } : {}),
    ...(patch.last_activity !== undefined
      ? { last_activity: patch.last_activity }
      : {}),
  });

  const list = queryClient.getQueryData<ClientsList>([keys.clients]);
  if (list) {
    queryClient.setQueryData<ClientsList>([keys.clients], {
      ...list,
      clients: list.clients.map((c) =>
        c.client.id === clientId ? apply(c) : c,
      ),
    });
  }

  const home = queryClient.getQueryData<HomeData>([keys.home]);
  if (home) {
    queryClient.setQueryData<HomeData>([keys.home], {
      ...home,
      clients: home.clients.map((c) => (c.client.id === clientId ? apply(c) : c)),
    });
  }
}

/** Antepone el movimiento al feed de Home (últimos movimientos). */
function prependHomeMovement(movement: Movement, clientName: string, clientPhone: string): void {
  const home = queryClient.getQueryData<HomeData>([keys.home]);
  if (!home) return;
  const recent: RecentMovement = {
    ...movement,
    client_name: clientName,
    client_phone: clientPhone,
  };
  queryClient.setQueryData<HomeData>([keys.home], {
    ...home,
    movements: [recent, ...home.movements].slice(0, 10),
  });
}

/** Mutación optimista: registrar un movimiento (deuda/abono) con patch por respuesta del servidor. */
export function useCreateMovimiento() {
  const queryClient = useQueryClient();

  return useMutation<
    { queued: boolean; movement?: Movement; balance?: Balance },
    Error,
    MovimientoInput,
    Prev
  >({
    mutationFn: async (input) => {
      const { queued, result } = await queuedApi<{
        movement: Movement;
        balance: Balance;
      }>(
        'clients',
        {
          method: 'POST',
          query: { action: 'movement-create' },
          body: {
            client_id: input.clientId,
            type: input.type,
            currency: input.currency,
            amount: input.amount,
            date: input.date,
            concept: input.concept,
          },
        },
        'movement-create',
      );
      return { queued, movement: result?.movement, balance: result?.balance };
    },
    onMutate: async (input) => {
      const key = [keys.client(input.clientId)];
      await queryClient.cancelQueries({ queryKey: key });
      const detail = queryClient.getQueryData<ClienteDetail>(key);
      if (!detail) return { detail: undefined, tempId: -Date.now() };
      const optimistic = buildOptimisticMovement(input, detail.rate?.usd_ves ?? 0);
      const tempId = optimistic.id;
      const pending = recomputeSaldos(
        sortChronological([...detail.movements, optimistic]),
      );
      queryClient.setQueryData<ClienteDetail>(key, (old) =>
        old ? { ...old, movements: pending } : old,
      );
      return { detail, tempId };
    },
    onSuccess: (data, input, ctx) => {
      if (data.queued || !data.movement || !ctx.detail) return;
      const key = [keys.client(input.clientId)];
      const current = queryClient.getQueryData<ClienteDetail>(key);
      if (!current) return;
      const movements = recomputeSaldos(
        sortChronological(
          current.movements.map((m) => (m.id === ctx.tempId ? data.movement! : m)),
        ),
      );
      queryClient.setQueryData<ClienteDetail>(key, { ...current, movements });
      if (data.balance) {
        patchClienteResumen(input.clientId, {
          saldo_usd: data.balance.saldo_usd,
          saldo_bs: data.balance.saldo_bs,
          last_activity: data.movement.date,
        });
      }
      prependHomeMovement(
        data.movement,
        ctx.detail.client.name,
        ctx.detail.client.phone,
      );
      invalidarAgregados();
    },
    onError: (_err, input, ctx) => {
      if (ctx?.detail) {
        queryClient.setQueryData([keys.client(input.clientId)], ctx.detail);
      }
    },
  });
}

/** Mutación optimista: eliminar un movimiento con patch del saldo por respuesta del servidor. */
export function useDeleteMovimiento() {
  const queryClient = useQueryClient();

  return useMutation<
    { queued: boolean; balance?: Balance },
    Error,
    { clientId: number; id: number },
    Prev
  >({
    mutationFn: async ({ id }) => {
      const { queued, result } = await queuedApi<{ ok: boolean; balance?: Balance }>(
        'clients',
        { method: 'DELETE', query: { action: 'movement-delete', id } },
        'movement-delete',
        { id },
      );
      return { queued, balance: result?.balance };
    },
    onMutate: async ({ clientId, id }) => {
      const key = [keys.client(clientId)];
      await queryClient.cancelQueries({ queryKey: key });
      const detail = queryClient.getQueryData<ClienteDetail>(key);
      if (!detail) return { detail: undefined, tempId: -Date.now() };
      const pending = recomputeSaldos(
        sortChronological(detail.movements.filter((m) => m.id !== id)),
      );
      queryClient.setQueryData<ClienteDetail>(key, (old) =>
        old ? { ...old, movements: pending } : old,
      );
      return { detail, tempId: -Date.now() };
    },
    onSuccess: (data, { clientId }) => {
      if (data.queued) return;
      const key = [keys.client(clientId)];
      const current = queryClient.getQueryData<ClienteDetail>(key);
      if (data.balance) {
        const last = current?.movements.length
          ? current.movements[current.movements.length - 1].date
          : null;
        patchClienteResumen(clientId, {
          saldo_usd: data.balance.saldo_usd,
          saldo_bs: data.balance.saldo_bs,
          last_activity: last,
        });
      }
      invalidarAgregados();
    },
    onError: (_err, input, ctx) => {
      if (ctx?.detail) {
        queryClient.setQueryData([keys.client(input.clientId)], ctx.detail);
      }
    },
  });
}