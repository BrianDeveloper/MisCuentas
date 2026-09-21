import { supabase } from './db.ts';
import { fetchBcvHistorical } from './bcv.ts';

export interface Rate {
  date: string;
  usd_ves: number;
  eur_ves: number;
}

export type MovementType = 'deuda' | 'abono';
export type Currency = 'USD' | 'Bs';

export interface ClientMovement {
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
  [key: string]: unknown;
}

export interface Client {
  id: number;
  name: string;
  phone: string;
  notes: string;
  created_at: string;
  [key: string]: unknown;
}

export function todayLocal(): string {
  return new Date()
    .toLocaleDateString('en-CA', { timeZone: 'America/Caracas' })
    .split(',')[0];
}

export async function getLatestRate(): Promise<Rate | null> {
  const { data } = await supabase
    .from('rates')
    .select('date, usd_ves, eur_ves')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Rate) ?? null;
}

export async function getRateFor(date: string): Promise<Rate | null> {
  const { data: exact } = await supabase
    .from('rates')
    .select('date, usd_ves, eur_ves')
    .eq('date', date)
    .maybeSingle();
  if (exact) return exact as Rate;
  const { data: byDate } = await supabase
    .from('rates')
    .select('date, usd_ves, eur_ves')
    .lte('date', date)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (byDate) return byDate as Rate;
  return getLatestRate();
}

export async function upsertRate(date: string, usd_ves: number, eur_ves = 0): Promise<void> {
  const { data: existing } = await supabase
    .from('rates')
    .select('eur_ves')
    .eq('date', date)
    .maybeSingle();
  await supabase.from('rates').upsert(
    {
      date,
      usd_ves,
      eur_ves:
        Number.isFinite(eur_ves) && eur_ves > 0
          ? eur_ves
          : (existing?.eur_ves as number) ?? 0,
    },
    { onConflict: 'date' },
  );
}

export async function ensureMovementRate(date: string): Promise<Rate | null> {
  const existing = await getRateFor(date);
  if (existing && existing.date <= date) return existing;
  const fetched = await fetchBcvHistorical(date);
  if (fetched) {
    await upsertRate(fetched.date, fetched.usd_ves);
    return getRateFor(date);
  }
  return null;
}

export function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * f) / f;
}

export function round2(n: number): number {
  return roundTo(n, 2);
}

export interface ComputedMovement {
  rate_bs: number;
  amount_usd: number;
  amount_bs: number;
}

export function computeMovement(
  type: MovementType,
  currency: Currency,
  amount: number,
  rate: Rate,
): ComputedMovement {
  const rate_bs = rate.usd_ves;
  if (currency === 'USD') {
    return {
      rate_bs,
      amount_usd: roundTo(amount, 2),
      amount_bs: roundTo(amount * rate_bs, 2),
    };
  }
  return {
    rate_bs,
    amount_usd: roundTo(amount / rate_bs, 6),
    amount_bs: roundTo(amount, 2),
  };
}

export function runBalance(
  movements: Array<{ type: MovementType; amount_usd: number; amount_bs: number }>,
): { usd: number; bs: number } {
  let usd = 0;
  let bs = 0;
  for (const m of movements) {
    const sign = m.type === 'deuda' ? 1 : -1;
    usd += sign * m.amount_usd;
    bs += sign * m.amount_bs;
  }
  return { usd: round2(usd), bs: round2(bs) };
}

export async function listClients(): Promise<Array<{
  client: Client;
  saldo_usd: number;
  saldo_bs: number;
  last_activity: string | null;
}>> {
  const [{ data: clients }, { data: movs }] = await Promise.all([
    supabase.from('clients').select('*').order('name'),
    supabase
      .from('movements')
      .select('client_id, type, amount_usd, amount_bs, date')
      .order('date', { ascending: true }),
  ]);
  const clientList = (clients ?? []) as Client[];
  const movList = (movs ?? []) as Array<{ client_id: number; type: MovementType; amount_usd: number; amount_bs: number; date: string }>;

  const map = new Map<number, { usd: number; bs: number; last: string | null }>();
  for (const c of clientList) map.set(c.id, { usd: 0, bs: 0, last: null });
  for (const m of movList) {
    const acc = map.get(m.client_id);
    if (!acc) continue;
    const sign = m.type === 'deuda' ? 1 : -1;
    acc.usd += sign * m.amount_usd;
    acc.bs += sign * m.amount_bs;
    if (!acc.last || m.date > acc.last) acc.last = m.date;
  }
  return clientList.map((client) => {
    const acc = map.get(client.id)!;
    return {
      client,
      saldo_usd: round2(acc.usd),
      saldo_bs: round2(acc.bs),
      last_activity: acc.last,
    };
  });
}

export async function recentMovements(limit: number): Promise<Array<ClientMovement & {
  client_name: string;
  client_phone: string;
}>> {
  const { data } = await supabase
    .from('movements')
    .select(
      'id, client_id, type, currency, amount, rate_bs, amount_usd, amount_bs, concept, date, created_at, clients(name, phone)',
    )
    .order('date', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  return ((data ?? []) as ClientMovement[]).map((m) => {
    const c = m.clients as unknown as { name: string; phone: string } | null;
    return {
      id: m.id,
      client_id: m.client_id,
      type: m.type,
      currency: m.currency,
      amount: m.amount,
      rate_bs: m.rate_bs,
      amount_usd: m.amount_usd,
      amount_bs: m.amount_bs,
      concept: m.concept,
      date: m.date,
      created_at: m.created_at,
      client_name: c?.name ?? '',
      client_phone: c?.phone ?? '',
    };
  });
}

export async function getClientDetail(clientId: number): Promise<{
  client: Client | null;
  movements: Array<ClientMovement & { saldo_usd: number; saldo_bs: number }>;
}> {
  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .maybeSingle();
  if (!client) return { client: null, movements: [] };
  const { data: rowsArr } = await supabase
    .from('movements')
    .select('*')
    .eq('client_id', clientId)
    .order('date', { ascending: true })
    .order('id', { ascending: true });
  let runUsd = 0;
  let runBs = 0;
  const movements = ((rowsArr ?? []) as ClientMovement[]).map((m) => {
    const sign = m.type === 'deuda' ? 1 : -1;
    runUsd += sign * m.amount_usd;
    runBs += sign * m.amount_bs;
    return { ...m, saldo_usd: round2(runUsd), saldo_bs: round2(runBs) };
  });
  return { client: client as Client, movements };
}

export function csvEscape(value: unknown): string {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function fmtNum(n: number): string {
  return n.toLocaleString('es-VE', { maximumFractionDigits: 2 });
}

export function sendCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
): Response {
  const lines = [headers.join(';')];
  for (const row of rows) lines.push(row.map(csvEscape).join(';'));
  return new Response('\uFEFF' + lines.join('\r\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Access-Control-Allow-Origin': '*',
    },
  });
}