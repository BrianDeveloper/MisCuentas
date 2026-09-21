const BASE = String(
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '',
)
  .trim()
  .replace(/\/+$/, '');
const FUNCTIONS = `${BASE || 'https://adelljptewdngtnljohu.supabase.co'}/functions/v1`;
const TOKEN_KEY = 'mc_token';

export type EdgeFn = 'auth' | 'clients' | 'rates' | 'settings' | 'qr' | 'export';

export interface Rate {
  date: string;
  usd_ves: number;
  eur_ves: number;
}

export type MovementType = 'deuda' | 'abono';
export type Currency = 'USD' | 'Bs';

export interface Movement {
  id: number;
  client_id: number;
  type: MovementType;
  currency: Currency;
  amount: number;
  rate_bs: number;
  amount_usd: number;
  amount_bs: number;
  concept: string;
  date: string;
  created_at: string;
  saldo_usd: number;
  saldo_bs: number;
}

export interface Client {
  id: number;
  name: string;
  phone: string;
  notes: string;
  created_at: string;
}

export interface ClientSummary {
  client: Client;
  saldo_usd: number;
  saldo_bs: number;
  last_activity: string | null;
}

export interface RecentMovement extends Movement {
  client_name: string;
  client_phone: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

async function doFetch(fn: EdgeFn, opts: ApiOptions): Promise<Response> {
  const params = new URLSearchParams();
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v === undefined) continue;
      params.set(k, String(v));
    }
  }
  const qs = params.toString();
  const token = getToken();
  return fetch(`${FUNCTIONS}/${fn}${qs ? `?${qs}` : ''}`, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

function throwApiError(res: Response, data: unknown): never {
  throw new ApiError(
    res.status,
    (data as { error?: string }).error || 'Error inesperado',
  );
}

export async function api<T>(fn: EdgeFn, opts: ApiOptions = {}): Promise<T> {
  const res = await doFetch(fn, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throwApiError(res, data);
  return data as T;
}

export async function apiBlob(fn: EdgeFn, opts: ApiOptions = {}): Promise<Blob> {
  const res = await doFetch(fn, opts);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throwApiError(res, data);
  }
  return res.blob();
}

export async function downloadExport(
  query: Record<string, string | number | undefined>,
  filename: string,
): Promise<void> {
  const blob = await apiBlob('export', { query });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}