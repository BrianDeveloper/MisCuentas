import { Router } from 'express';
import {
  computeMovement,
  db,
  getAllSummaries,
  getClientDetail,
  row,
  todayLocal,
  type Client,
  type Currency,
  type MovementType,
} from '../db.js';
import { requireAuth } from '../auth.js';
import { ensureRate } from '../bcv.js';

export const clientsRouter = Router();
clientsRouter.use(requireAuth);

function parseAmount(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

clientsRouter.get('/', (_req, res) => {
  res.json({ clients: getAllSummaries() });
});

clientsRouter.post('/', (req, res) => {
  const name = (req.body?.name ?? '').toString().trim();
  if (!name) {
    res.status(400).json({ error: 'El nombre es obligatorio' });
    return;
  }
  const phone = (req.body?.phone ?? '').toString().trim();
  const notes = (req.body?.notes ?? '').toString().trim();
  const result = db
    .prepare(
      'INSERT INTO clients (name, phone, notes, created_at) VALUES (?, ?, ?, ?)',
    )
    .run(name, phone, notes, new Date().toISOString());
  const id = Number(result.lastInsertRowid);
  const client = row<Client>('SELECT * FROM clients WHERE id = ?', id);
  res.status(201).json({ client });
});

clientsRouter.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const { client, movements } = getClientDetail(id);
  if (!client) {
    res.status(404).json({ error: 'Cliente no encontrado' });
    return;
  }
  res.json({ client, movements });
});

clientsRouter.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db
    .prepare('SELECT id FROM clients WHERE id = ?')
    .get(id);
  if (!existing) {
    res.status(404).json({ error: 'Cliente no encontrado' });
    return;
  }
  const name = (req.body?.name ?? '').toString().trim();
  if (!name) {
    res.status(400).json({ error: 'El nombre es obligatorio' });
    return;
  }
  const phone = (req.body?.phone ?? '').toString().trim();
  const notes = (req.body?.notes ?? '').toString().trim();
  db.prepare(
    'UPDATE clients SET name = ?, phone = ?, notes = ? WHERE id = ?',
  ).run(name, phone, notes, id);
  const client = row<Client>('SELECT * FROM clients WHERE id = ?', id);
  res.json({ client });
});

clientsRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db
    .prepare('SELECT id FROM clients WHERE id = ?')
    .get(id);
  if (!existing) {
    res.status(404).json({ error: 'Cliente no encontrado' });
    return;
  }
  db.prepare('DELETE FROM movements WHERE client_id = ?').run(id);
  db.prepare('DELETE FROM clients WHERE id = ?').run(id);
  res.json({ ok: true });
});

clientsRouter.post('/:id/movements', async (req, res) => {
  const clientId = Number(req.params.id);
  const existing = db
    .prepare('SELECT id FROM clients WHERE id = ?')
    .get(clientId);
  if (!existing) {
    res.status(404).json({ error: 'Cliente no encontrado' });
    return;
  }

  const type = req.body?.type as MovementType;
  const currency = req.body?.currency as Currency;
  const amount = parseAmount(req.body?.amount);
  if (type !== 'deuda' && type !== 'abono') {
    res.status(400).json({ error: 'Tipo inválido. Use "deuda" o "abono"' });
    return;
  }
  if (currency !== 'USD' && currency !== 'Bs') {
    res.status(400).json({ error: 'Moneda inválida. Use "USD" o "Bs"' });
    return;
  }
  if (amount === null) {
    res.status(400).json({ error: 'El monto debe ser un número mayor a 0' });
    return;
  }

  const rawDate = req.body?.date;
  let date: string;
  if (!rawDate) {
    date = todayLocal();
  } else {
    date = String(rawDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'Fecha inválida (use YYYY-MM-DD)' });
      return;
    }
  }

  const rate = await ensureRate(date);
  if (!rate) {
    res.status(400).json({
      error: `No hay tasa del BCV para el día ${date}. Ingresa la tasa manualmente en Ajustes o elige otra fecha.`,
    });
    return;
  }

  let computed;
  try {
    computed = computeMovement({
      type,
      currency,
      amount,
      date,
      concept: (req.body?.concept ?? '').toString(),
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Error al calcular montos',
    });
    return;
  }

  const result = db
    .prepare(
      `INSERT INTO movements
        (client_id, type, currency, amount, rate_bs, amount_usd, amount_bs, concept, date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      clientId,
      type,
      currency,
      amount,
      computed.rate_bs,
      computed.amount_usd,
      computed.amount_bs,
      (req.body?.concept ?? '').toString().trim(),
      date,
      new Date().toISOString(),
    );

  const movement = db
    .prepare('SELECT * FROM movements WHERE id = ?')
    .get(Number(result.lastInsertRowid));

  const movs = db
    .prepare('SELECT type, amount_usd, amount_bs FROM movements WHERE client_id = ?')
    .all(clientId) as unknown as Array<{ type: MovementType; amount_usd: number; amount_bs: number }>;
  let saldo_usd = 0;
  let saldo_bs = 0;
  for (const m of movs) {
    const sign = m.type === 'deuda' ? 1 : -1;
    saldo_usd += sign * m.amount_usd;
    saldo_bs += sign * m.amount_bs;
  }
  res.status(201).json({ movement, balance: { saldo_usd, saldo_bs } });
});

clientsRouter.delete('/movements/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db
    .prepare('SELECT id FROM movements WHERE id = ?')
    .get(id);
  if (!existing) {
    res.status(404).json({ error: 'Movimiento no encontrado' });
    return;
  }
  db.prepare('DELETE FROM movements WHERE id = ?').run(id);
  res.json({ ok: true });
});