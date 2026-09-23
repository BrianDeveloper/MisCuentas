import { queryClient } from './client';
import { keys } from './keys';

function evictClientKeys(): void {
  for (const q of queryClient.getQueryCache().getAll()) {
    const k = q.queryKey[0];
    if (typeof k === 'string' && k.startsWith('client:')) {
      queryClient.removeQueries({ queryKey: q.queryKey });
    }
  }
}

/** Invalida todas las queries de clientes (lista, home, métricas y detalles). */
export function invalidarClientes(): void {
  queryClient.removeQueries({ queryKey: [keys.clients] });
  queryClient.removeQueries({ queryKey: [keys.home] });
  queryClient.removeQueries({ queryKey: [keys.metrics] });
  evictClientKeys();
}

/** Invalida la tasa y su historial. */
export function invalidarTasa(): void {
  queryClient.removeQueries({ queryKey: [keys.rate] });
  queryClient.removeQueries({ queryKey: [keys.rateHistory] });
}

/** Invalida ajustes. */
export function invalidarAjustes(): void {
  queryClient.removeQueries({ queryKey: [keys.settings] });
}

/** Invalida solo métricas (Stats). Se usa tras writes que afectan agregados. */
export function invalidarAgregados(): void {
  queryClient.removeQueries({ queryKey: [keys.metrics] });
}

/** Invalida TODO el store (backups, sync completo). */
export function invalidarTodo(): void {
  queryClient.clear();
}