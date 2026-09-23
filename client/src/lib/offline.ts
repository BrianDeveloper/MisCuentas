import { useEffect, useState } from 'react';
import { del, get, set } from 'idb-keyval';
import { api, isNetworkError, type ApiOptions } from './api';
import { invalidarClientes, invalidarTasa, invalidarAjustes } from './store/invalidations';

const QUEUE_KEY = 'mc-pending-ops';
const LAST_SYNC_KEY = 'mc-last-sync';

export type PendingKind =
  | 'client-create'
  | 'client-delete'
  | 'movement-create'
  | 'movement-delete'
  | 'rate-manual';

export interface PendingOp {
  uid: string;
  kind: PendingKind;
  at: number;
  body: Record<string, unknown>;
}

let changeListeners = new Set<() => void>();

function emitChange(): void {
  for (const fn of changeListeners) fn();
}

export function subscribePending(fn: () => void): () => void {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(isOnline());
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function usePendingCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const list = await readQueue();
      if (alive) setCount(list.length);
    };
    void refresh();
    const unsub = subscribePending(() => void refresh());
    return () => {
      alive = false;
      unsub();
    };
  }, []);
  return count;
}

async function readQueue(): Promise<PendingOp[]> {
  return (await get<PendingOp[]>(QUEUE_KEY)) ?? [];
}

async function writeQueue(ops: PendingOp[]): Promise<void> {
  if (ops.length === 0) await del(QUEUE_KEY);
  else await set(QUEUE_KEY, ops);
  emitChange();
}

export function clearQueueForTest(): Promise<void> {
  return writeQueue([]);
}

function uidFor(kind: PendingKind): string {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getPendingCount(): Promise<number> {
  return (await readQueue()).length;
}

/** Ejecuta una mutación en línea; si no hay red, la encola y devuelve { queued: true }. */
export async function queueOrRun<T>(
  kind: PendingKind,
  run: () => Promise<T>,
  body?: Record<string, unknown>,
): Promise<{ queued: boolean; result?: T }> {
  if (!isOnline()) {
    await enqueueOp({ kind, body: body ?? {} });
    return { queued: true };
  }
  try {
    const result = await run();
    return { queued: false, result };
  } catch (err) {
    if (isNetworkError(err)) {
      await enqueueOp({ kind, body: body ?? {} });
      return { queued: true };
    }
    throw err;
  }
}

/**
 * Ayudante para las mutaciones de escritura con cola offline:
 * si estás sin conexión, el write se encola y retorna { queued: true }.
 * `enqueueBody` es lo que se persiste en la cola (por defecto opts.body).
 */
export async function queuedApi<T>(
  fn: 'clients' | 'rates',
  opts: ApiOptions,
  kind: PendingKind,
  enqueueBody?: Record<string, unknown>,
): Promise<{ queued: boolean; result?: T }> {
  return queueOrRun<T>(
    kind,
    () => api<T>(fn, opts),
    enqueueBody ?? (opts.body as Record<string, unknown> | undefined),
  );
}

export async function enqueueOp(op: Omit<PendingOp, 'uid' | 'at'>): Promise<void> {
  const ops = await readQueue();
  ops.push({ ...op, uid: uidFor(op.kind), at: Date.now() });
  await writeQueue(ops);
}

/** Resuelve un id de cliente posiblemente negativo (creado offline) a su id real. */
function resolveClientId(value: unknown, map: Map<number, number>): number {
  const n = Number(value);
  if (Number.isInteger(n) && n < 0 && map.has(n)) return map.get(n)!;
  return n;
}

async function execOp(op: PendingOp, map: Map<number, number>): Promise<void> {
  const body = { ...op.body };
  switch (op.kind) {
    case 'client-create': {
      const res = await api<{ client: { id: number } }>('clients', {
        method: 'POST',
        query: { action: 'create' },
        body,
      });
      const tempId = Number(body.temp_id);
      if (Number.isInteger(tempId) && tempId < 0) map.set(tempId, res.client.id);
      return;
    }
    case 'client-delete': {
      const id = resolveClientId(body.id, map);
      await api('clients', { method: 'DELETE', query: { action: 'delete', id } });
      return;
    }
    case 'movement-create': {
      body.client_id = resolveClientId(body.client_id, map);
      await api('clients', {
        method: 'POST',
        query: { action: 'movement-create' },
        body,
      });
      return;
    }
    case 'movement-delete': {
      const id = Number(body.id);
      await api('clients', {
        method: 'DELETE',
        query: { action: 'movement-delete', id },
      });
      return;
    }
    case 'rate-manual': {
      await api('rates', { method: 'POST', query: { action: 'manual' }, body });
      return;
    }
  }
}

/**
 * Procesa la cola en orden FIFO.
 * - Errores de red: se detiene y las operaciones restantes quedan para reintentar.
 * - Errores de servidor: se descartan y se sigue (lastError los reporta).
 * Devuelve cuántas se aplicaron, cuántas quedan y el último error no-red.
 */
export async function flushPendingOps(): Promise<{
  applied: number;
  remaining: number;
  discarded: number;
  lastError: string | null;
}> {
  const ops = await readQueue();
  if (ops.length === 0) return { applied: 0, remaining: 0, discarded: 0, lastError: null };

  const map = new Map<number, number>();
  const remaining: PendingOp[] = [];
  let applied = 0;
  let discarded = 0;
  let lastError: string | null = null;

  for (const op of ops) {
    try {
      await execOp(op, map);
      applied++;
    } catch (err) {
      if (isNetworkError(err)) {
        remaining.push(op, ...ops.slice(ops.indexOf(op) + 1));
        break;
      }
      discarded++;
      lastError = err instanceof Error ? err.message : 'Error desconocido';
    }
  }

  await writeQueue(remaining);
  if (remaining.length === 0) {
    await set(LAST_SYNC_KEY, new Date().toISOString());
  }
  return { applied, remaining: remaining.length, discarded, lastError };
}

/** Reintenta las pendientes y refresca toda la caché en caso de éxito parcial. */
export async function syncPending(): Promise<{
  applied: number;
  remaining: number;
  discarded: number;
  lastError: string | null;
}> {
  const result = await flushPendingOps();
  invalidarClientes();
  invalidarTasa();
  invalidarAjustes();
  return result;
}