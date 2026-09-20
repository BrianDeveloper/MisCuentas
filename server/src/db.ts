import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const dataDir =
  process.env.DATA_DIR || path.resolve(here, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, 'cuentas.db'));

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('deuda', 'abono')),
  currency TEXT NOT NULL CHECK (currency IN ('USD', 'Bs')),
  amount REAL NOT NULL,
  rate_bs REAL NOT NULL,
  amount_usd REAL NOT NULL,
  amount_bs REAL NOT NULL,
  concept TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_movements_client ON movements(client_id);

CREATE TABLE IF NOT EXISTS rates (
  date TEXT PRIMARY KEY,
  usd_ves REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

const rateCols = rows<{ name: string }>('PRAGMA table_info(rates)');
if (!rateCols.some((c) => c.name === 'eur_ves')) {
  db.exec('ALTER TABLE rates ADD COLUMN eur_ves REAL NOT NULL DEFAULT 0');
}

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
}

export interface Client {
  id: number;
  name: string;
  phone: string;
  notes: string;
  created_at: string;
}

export function row<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
  return db.prepare(sql).get(...params) as unknown as T | undefined;
}

export function rows<T>(sql: string, ...params: SQLInputValue[]): T[] {
  return db.prepare(sql).all(...params) as unknown as T[];
}

export function getSetting(key: string): string | null {
  const setting = row<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key,
  );
  return setting ? setting.value : null;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value);
}

export function todayLocal(): string {
  return new Date()
    .toLocaleDateString('en-CA', { timeZone: 'America/Caracas' })
    .split(',')[0];
}

export function getRateFor(date: string): Rate | null {
  const exact = row<Rate>(
    'SELECT date, usd_ves, eur_ves FROM rates WHERE date = ?',
    date,
  );
  if (exact) return exact;
  const byDate = row<Rate>(
    'SELECT date, usd_ves, eur_ves FROM rates WHERE date <= ? ORDER BY date DESC LIMIT 1',
    date,
  );
  if (byDate) return byDate;
  return getLatestRate();
}

export function getLatestRate(): Rate | null {
  return (
    row<Rate>('SELECT date, usd_ves, eur_ves FROM rates ORDER BY date DESC LIMIT 1') ??
    null
  );
}

export function upsertRate(date: string, usd_ves: number, eur_ves = 0): void {
  db.prepare(
    `INSERT INTO rates (date, usd_ves, eur_ves) VALUES (?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       usd_ves = excluded.usd_ves,
       eur_ves = CASE WHEN excluded.eur_ves > 0 THEN excluded.eur_ves ELSE rates.eur_ves END`,
  ).run(date, usd_ves, eur_ves);
}

export interface MovementInput {
  type: MovementType;
  currency: Currency;
  amount: number;
  date: string;
  concept?: string;
}

export interface ComputedMovement {
  rate_bs: number;
  amount_usd: number;
  amount_bs: number;
}

export function computeMovement(input: MovementInput): ComputedMovement {
  const rate = getRateFor(input.date);
  if (!rate) {
    throw new Error(
      'No hay una tasa BCV registrada para esta fecha. Actualiza la tasa en Ajustes antes de registrar el movimiento.',
    );
  }
  const rate_bs = rate.usd_ves;
  if (input.currency === 'USD') {
    return {
      rate_bs,
      amount_usd: roundTo(input.amount, 2),
      amount_bs: roundTo(input.amount * rate_bs, 2),
    };
  }
  return {
    rate_bs,
    amount_usd: roundTo(input.amount / rate_bs, 6),
    amount_bs: roundTo(input.amount, 2),
  };
}

export interface ClientSummary {
  client: Client;
  saldo_usd: number;
  saldo_bs: number;
  last_activity: string | null;
}

export function getAllSummaries(): ClientSummary[] {
  const clients = rows<Client>('SELECT * FROM clients ORDER BY name COLLATE NOCASE');
  const movs = rows<Pick<ClientMovement, 'client_id' | 'type' | 'amount_usd' | 'amount_bs' | 'date'>>(
    'SELECT client_id, type, amount_usd, amount_bs, date FROM movements ORDER BY date, id',
  );

  const map = new Map<number, { usd: number; bs: number; last: string | null }>();
  for (const c of clients) {
    map.set(c.id, { usd: 0, bs: 0, last: null });
  }
  for (const m of movs) {
    const acc = map.get(m.client_id);
    if (!acc) continue;
    const sign = m.type === 'deuda' ? 1 : -1;
    acc.usd += sign * m.amount_usd;
    acc.bs += sign * m.amount_bs;
    if (!acc.last || m.date > acc.last) acc.last = m.date;
  }
  return clients.map((client) => {
    const acc = map.get(client.id)!;
    return {
      client,
      saldo_usd: round2(acc.usd),
      saldo_bs: round2(acc.bs),
      last_activity: acc.last,
    };
  });
}

export function getClientDetail(clientId: number): {
  client: Client | null;
  movements: Array<ClientMovement & { saldo_usd: number; saldo_bs: number }>;
} {
  const client = row<Client>('SELECT * FROM clients WHERE id = ?', clientId);
  if (!client) return { client: null, movements: [] };
  const rowsArr = rows<ClientMovement>(
    'SELECT * FROM movements WHERE client_id = ? ORDER BY date, id',
    clientId,
  );
  let runUsd = 0;
  let runBs = 0;
  const movements = rowsArr.map((m) => {
    const sign = m.type === 'deuda' ? 1 : -1;
    runUsd += sign * m.amount_usd;
    runBs += sign * m.amount_bs;
    return {
      ...m,
      saldo_usd: round2(runUsd),
      saldo_bs: round2(runBs),
    };
  });
  return { client, movements };
}

export interface RecentMovement extends ClientMovement {
  client_name: string;
  client_phone: string;
}

export function getRecentMovements(limit: number): RecentMovement[] {
  return rows<RecentMovement>(
    `SELECT m.id, m.client_id, m.type, m.currency, m.amount, m.rate_bs,
            m.amount_usd, m.amount_bs, m.concept, m.date, m.created_at,
            c.name AS client_name, c.phone AS client_phone
       FROM movements m
       JOIN clients c ON c.id = m.client_id
      ORDER BY m.date DESC, m.id DESC
      LIMIT ?`,
    limit,
  );
}

export function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * f) / f;
}

export function round2(n: number): number {
  return roundTo(n, 2);
}