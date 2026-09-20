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

export async function api<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, (data as { error?: string }).error || 'Error inesperado');
  }
  return data as T;
}