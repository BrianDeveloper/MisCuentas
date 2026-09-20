import { json } from '../_shared/cors.ts';
import { handleOptions } from '../_shared/db.ts';
import { requireAuth } from '../_shared/auth.ts';
import {
  fmtNum,
  getClientDetail,
  getLatestRate,
  listClients,
  sendCsv,
} from '../_shared/helpers.ts';

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  try {
    if (!(await requireAuth(req))) {
      return json({ error: 'No autenticado' }, 401);
    }

    if (action === 'summary') {
      const summaries = await listClients();
      const latest = await getLatestRate();
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
      return sendCsv('resumen-cuentas.csv', headers, rows);
    }

    if (action === 'client') {
      const id = Number(url.searchParams.get('id'));
      const { client, movements } = await getClientDetail(id);
      if (!client) {
        return json({ error: 'Cliente no encontrado' }, 404);
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
      return sendCsv(
        `estado-cuenta-${client.name.replace(/[^\w\u00e0-\u00ff-]/gi, '_')}.csv`,
        headers,
        rows,
      );
    }

    return json({ error: 'Acción inválida' }, 400);
  } catch (err) {
    console.error('[export]', err);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});