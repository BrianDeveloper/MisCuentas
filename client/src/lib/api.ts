import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNative } from './links';

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

export interface MetricsDay {
  date: string;
  cobrado: number;
  deudas: number;
}

export interface MetricsTopDebtor {
  id: number;
  name: string;
  saldo_bs: number;
  saldo_usd: number;
}

export interface Metrics {
  mes: string;
  hoy: string;
  total: {
    cobrado_bs: number;
    cobrado_usd: number;
    deudas_bs: number;
    deudas_usd: number;
  };
  serie_diaria: MetricsDay[];
  top_deudores: MetricsTopDebtor[];
  dias_promedio_cobro: number;
  tasa_hoy: number;
  rate_evolution: Array<{ date: string; usd_ves: number }>;
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
  let res: Response;
  try {
    res = await fetch(`${FUNCTIONS}/${fn}${qs ? `?${qs}` : ''}`, {
      method: opts.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch (err) {
    throw new ApiError(
      0,
      err instanceof TypeError
        ? 'Sin conexión a internet.'
        : 'No se pudo conectar con el servidor.',
    );
  }
  return res;
}

export function isNetworkError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 0;
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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('No se pudo leer el archivo.'));
        return;
      }
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(blob);
  });
}

export async function downloadExport(
  query: Record<string, string | number | undefined>,
  filename: string,
): Promise<void> {
  const blob = await apiBlob('export', { query });
  if (!isNative()) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return;
  }
  const base64 = await blobToBase64(blob);
  const saved = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
    recursive: true,
  });
  await Share.share({
    title: filename,
    files: [saved.uri],
    dialogTitle: 'Exportar resumen',
  });
}

export interface BackupData {
  version: number;
  app: string;
  exported_at: string;
  clients: unknown[];
  movements: unknown[];
  rates: unknown[];
  settings: Array<{ key: string; value: string }>;
}

export async function fetchBackup(): Promise<BackupData> {
  return api<BackupData>('export', { query: { action: 'backup' } });
}

export async function restoreBackup(data: BackupData): Promise<number> {
  const r = await api<{ ok: boolean; restored: number }>('export', {
    method: 'POST',
    query: { action: 'restore' },
    body: { confirm: true, data },
  });
  return r.restored;
}