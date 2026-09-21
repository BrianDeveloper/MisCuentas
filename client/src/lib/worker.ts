export class WorkerSendError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'WorkerSendError';
    this.status = status;
  }
}

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

export function warmWorker(base: string): void {
  const url = base.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(url)) return;
  fetch(`${url}/status`, { signal: timeoutSignal(15_000) }).catch(() => {});
}

const ATTEMPTS = 3;
const TIMEOUT_MS = 20_000;
const BACKOFF_MS = [1_500, 3_000];

export async function sendViaWorker(opts: {
  base: string;
  token: string;
  to: string;
  text: string;
  imageUrl?: string;
}): Promise<void> {
  const base = opts.base.trim().replace(/\/+$/, '');
  let lastError = new Error('No se pudo contactar el worker.');

  for (let i = 0; i < ATTEMPTS; i++) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS[i - 1] ?? 3_000));
    }
    try {
      const res = await fetch(`${base}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        },
        body: JSON.stringify({
          to: opts.to,
          text: opts.text,
          imageUrl: opts.imageUrl ?? '',
        }),
        signal: timeoutSignal(TIMEOUT_MS),
      });
      if (res.ok) return;
      const msg = await res
        .text()
        .then((t) => {
          try {
            return String((JSON.parse(t) as { error?: unknown }).error ?? '');
          } catch {
            return '';
          }
        })
        .catch(() => '');
      const err = new WorkerSendError(
        msg || `Fallo del worker (${res.status}).`,
        res.status,
      );
      if (res.status >= 400 && res.status < 500) throw err;
      lastError = err;
    } catch (err) {
      if (err instanceof WorkerSendError) throw err;
      const name = err instanceof DOMException ? err.name : (err as Error).name;
      if (name === 'AbortError') {
        lastError = new Error('El worker está tardando (arranque en frío). Reintentando…');
      } else {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
  }
  throw lastError;
}