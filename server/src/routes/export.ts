import { Router, type Response } from 'express';
import {
  getAllSummaries,
  getClientDetail,
  getLatestRate,
} from '../db.js';
import { requireAuth } from '../auth.js';

export const exportRouter = Router();
exportRouter.use(requireAuth);

function csvEscape(value: unknown): string {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function sendCsv(res: Response, filename: string, headers: string[], rows: (string | number)[][]): void {
  const lines = [headers.join(';')];
  for (const row of rows) lines.push(row.map(csvEscape).join(';'));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename}"`,
  );
  res.send('\uFEFF' + lines.join('\r\n'));
}

function fmtNum(n: number): string {
  return n.toLocaleString('es-VE', { maximumFractionDigits: 2 });
}

exportRouter.get('/csv', (_req, res) => {
  const summaries = getAllSummaries();
  const latest = getLatestRate();
  const today = latest ? latest.usd_ves : 0;
  const headers = [
    'Cliente',
    'Teléfono',
    'Saldo Bs',
    'Equivalente USD (histórico)',
    'Equivalente USD (hoy)',
    'Última actividad',
  ];
  const rows = summaries.map(({ client, saldo_usd, saldo_bs, last_activity }) => [
    client.name,
    client.phone,
    fmtNum(saldo_bs),
    fmtNum(saldo_usd),
    fmtNum(today > 0 ? saldo_bs / today : 0),
    last_activity ?? '',
  ]);
  sendCsv(res, 'resumen-cuentas.csv', headers, rows);
});

exportRouter.get('/csv/:id', (req, res) => {
  const id = Number(req.params.id);
  const { client, movements } = getClientDetail(id);
  if (!client) {
    res.status(404).json({ error: 'Cliente no encontrado' });
    return;
  }
  const headers = [
    'Fecha',
    'Tipo',
    'Concepto',
    'Moneda',
    'Monto',
    'Tasa Bs',
    'Bs',
    'USD',
    'Saldo Bs',
  ];
  const rows = movements.map((m) => [
    m.date,
    m.type === 'deuda' ? 'Deuda' : 'Abono',
    m.concept,
    m.currency,
    fmtNum(m.amount),
    fmtNum(m.rate_bs),
    fmtNum(m.amount_bs),
    fmtNum(m.amount_usd),
    fmtNum(m.saldo_bs),
  ]);
  sendCsv(
    res,
    `estado-cuenta-${client.name.replace(/[^\w\u00e0-\u00ff-]/gi, '_')}.csv`,
    headers,
    rows,
  );
});