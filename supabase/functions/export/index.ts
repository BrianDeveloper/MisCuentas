import { json } from '../_shared/cors.ts';
import { handleOptions, supabase } from '../_shared/db.ts';
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

    if (action === 'backup') {
      const [clients, movements, rates, settings] = await Promise.all([
        supabase.from('clients').select('*').order('id', { ascending: true }),
        supabase.from('movements').select('*').order('id', { ascending: true }),
        supabase.from('rates').select('*').order('date', { ascending: true }),
        supabase.from('app_settings').select('key, value'),
      ]);
      return json({
        version: 1,
        app: 'Mis Cuentas',
        exported_at: new Date().toISOString(),
        clients: clients.data ?? [],
        movements: movements.data ?? [],
        rates: rates.data ?? [],
        settings: (settings.data ?? []).filter((s) => s.key !== 'pin_hash'),
      });
    }

    if (action === 'restore' && req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const data = body.data as Record<string, unknown> | undefined;
      const version = Number(data?.version);
      if (body.confirm !== true || !data || version !== 1) {
        return json({ error: 'Respaldo inválido o no confirmado' }, 400);
      }
      const required = ['clients', 'movements', 'rates'];
      if (!required.every((k) => Array.isArray(data[k]))) {
        return json({ error: 'El respaldo no contiene los datos esperados' }, 400);
      }
      const arrays = {
        clients: (data.clients as unknown[]) ?? [],
        movements: (data.movements as unknown[]) ?? [],
        rates: (data.rates as unknown[]) ?? [],
        settings: (data.settings as unknown[]) ?? [],
      };
      const { error } = await supabase.rpc('restore_backup', arrays);
      if (error) {
        console.error('[export][restore]', error);
        return json({ error: 'Error al restaurar el respaldo' }, 500);
      }
      return json({ ok: true, restored: (data.clients as unknown[])?.length ?? 0 });
    }

    return json({ error: 'Acción inválida' }, 400);
  } catch (err) {
    console.error('[export]', err);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});