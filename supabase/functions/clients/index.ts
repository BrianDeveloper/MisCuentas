import { json } from '../_shared/cors.ts';
import { handleOptions, supabase } from '../_shared/db.ts';
import { requireAuth } from '../_shared/auth.ts';
import {
  computeMovement,
  ensureMovementRate,
  getClientDetail,
  getLatestRate,
  listClients,
  recentMovements,
  roundTo,
  runBalance,
  todayLocal,
  type ClientMovement,
  type Currency,
  type MovementType,
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

    if (req.method === 'GET') {
      if (action === 'list') {
        const [clients, rate] = await Promise.all([listClients(), getLatestRate()]);
        return json({ clients, rate });
      }
      if (action === 'get') {
        const id = Number(url.searchParams.get('id'));
        const [detail, rate] = await Promise.all([
          getClientDetail(id),
          getLatestRate(),
        ]);
        if (!detail.client) {
          return json({ error: 'Cliente no encontrado' }, 404);
        }
        return json({
          client: detail.client,
          movements: detail.movements,
          rate,
        });
      }
      if (action === 'recent') {
        const raw = Number(url.searchParams.get('limit') ?? 10);
        const limit = Number.isFinite(raw)
          ? Math.min(Math.max(Math.floor(raw), 1), 50)
          : 10;
        return json({ movements: await recentMovements(limit) });
      }
      if (action === 'home') {
        const raw = Number(url.searchParams.get('limit') ?? 10);
        const limit = Number.isFinite(raw)
          ? Math.min(Math.max(Math.floor(raw), 1), 50)
          : 10;
        const [clients, rate, movements] = await Promise.all([
          listClients(),
          getLatestRate(),
          recentMovements(limit),
        ]);
        return json({ clients, rate, movements });
      }
      if (action === 'metrics') {
        return json(await computeMetrics());
      }
      return json({ error: 'Acción inválida' }, 400);
    }

    if (req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

      if (action === 'create') {
        const name = String(body.name ?? '').trim();
        if (!name) {
          return json({ error: 'El nombre es obligatorio' }, 400);
        }
        const phone = String(body.phone ?? '').trim();
        const notes = String(body.notes ?? '').trim();
        const { data, error } = await supabase
          .from('clients')
          .insert({ name, phone, notes })
          .select()
          .single();
        if (error) return json({ error: error.message }, 400);
        return json({ client: data }, 201);
      }

      // POST /clients/:id/movements → action=movement-create
      if (action === 'movement-create') {
        const clientId = Number(body.client_id);
        const type = body.type as MovementType;
        const currency = body.currency as Currency;
        const amount = parseAmount(body.amount);

        const { data: existing } = await supabase
          .from('clients')
          .select('id')
          .eq('id', clientId)
          .maybeSingle();
        if (!existing) {
          return json({ error: 'Cliente no encontrado' }, 404);
        }
        if (type !== 'deuda' && type !== 'abono') {
          return json({ error: 'Tipo inválido. Use "deuda" o "abono"' }, 400);
        }
        if (currency !== 'USD' && currency !== 'Bs') {
          return json({ error: 'Moneda inválida. Use "USD" o "Bs"' }, 400);
        }
        if (amount === null) {
          return json({ error: 'El monto debe ser un número mayor a 0' }, 400);
        }

        let date: string;
        if (!body.date) {
          date = todayLocal();
        } else {
          date = String(body.date);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return json({ error: 'Fecha inválida (use YYYY-MM-DD)' }, 400);
          }
        }

        const rate = await ensureMovementRate(date);
        if (!rate) {
          return json(
            {
              error: `No hay tasa del BCV para el día ${date}. Ingresa la tasa manualmente en Ajustes o elige otra fecha.`,
            },
            400,
          );
        }

        const concept = String(body.concept ?? '').trim();
        const computed = computeMovement(type, currency, amount, rate);

        const { data: movement, error } = await supabase
          .from('movements')
          .insert({
            client_id: clientId,
            type,
            currency,
            amount,
            rate_bs: computed.rate_bs,
            amount_usd: computed.amount_usd,
            amount_bs: computed.amount_bs,
            concept,
            date,
          })
          .select()
          .single();
        if (error) return json({ error: error.message }, 400);

        const balance = await clientBalance(clientId);
        return json({ movement, balance: balance }, 201);
      }

      return json({ error: 'Acción inválida' }, 400);
    }

    if (req.method === 'PUT') {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      if (action !== 'update') return json({ error: 'Acción inválida' }, 400);

      const id = Number(url.searchParams.get('id') ?? body.id);
      const { data: existing } = await supabase
        .from('clients')
        .select('id')
        .eq('id', id)
        .maybeSingle();
      if (!existing) {
        return json({ error: 'Cliente no encontrado' }, 404);
      }
      const name = String(body.name ?? '').trim();
      if (!name) {
        return json({ error: 'El nombre es obligatorio' }, 400);
      }
      const phone = String(body.phone ?? '').trim();
      const notes = String(body.notes ?? '').trim();
      const { data: client, error } = await supabase
        .from('clients')
        .update({ name, phone, notes })
        .eq('id', id)
        .select()
        .single();
      if (error) return json({ error: error.message }, 400);
      return json({ client });
    }

    if (req.method === 'DELETE') {
      if (action === 'delete') {
        const id = Number(url.searchParams.get('id'));
        const { data: existing } = await supabase
          .from('clients')
          .select('id')
          .eq('id', id)
          .maybeSingle();
        if (!existing) {
          return json({ error: 'Cliente no encontrado' }, 404);
        }
        await supabase.from('clients').delete().eq('id', id);
        return json({ ok: true });
      }
      if (action === 'movement-delete') {
        const id = Number(url.searchParams.get('id'));
        const { data: existing } = await supabase
          .from('movements')
          .select('id, client_id')
          .eq('id', id)
          .maybeSingle();
        if (!existing) {
          return json({ error: 'Movimiento no encontrado' }, 404);
        }
        const clientId = Number(existing.client_id);
        await supabase.from('movements').delete().eq('id', id);
        const balance = await clientBalance(clientId);
        return json({ ok: true, balance });
      }
      return json({ error: 'Acción inválida' }, 400);
    }

    return json({ error: 'Método no permitido' }, 405);
  } catch (err) {
    console.error('[clients]', err);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});

function parseAmount(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function clientBalance(clientId: number): Promise<{ saldo_usd: number; saldo_bs: number }> {
  const { data } = await supabase
    .from('movements')
    .select('type, amount_usd, amount_bs')
    .eq('client_id', clientId);
  const { usd, bs } = runBalance(
    (data ?? []) as Array<{ type: MovementType; amount_usd: number; amount_bs: number }>,
  );
  return { saldo_usd: usd, saldo_bs: bs };
}

interface MetricsRow {
  type: MovementType;
  currency: Currency;
  amount_usd: number;
  amount_bs: number;
  date: string;
}

function monthDays(ym: string): string[] {
  const [y, m] = ym.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: string[] = [];
  for (let d = 1; d <= days; d++) {
    out.push(`${ym}-${String(d).padStart(2, '0')}`);
  }
  return out;
}

function timeToPay(movements: Array<{ type: MovementType; date: string }>): number {
  const queue: string[] = [];
  let total = 0;
  let count = 0;
  for (const m of movements) {
    if (m.type === 'deuda') {
      queue.push(m.date);
    } else if (queue.length > 0) {
      const start = queue.shift()!;
      const days = Math.round(
        (Date.parse(m.date + 'T00:00:00') - Date.parse(start + 'T00:00:00')) /
          (1000 * 60 * 60 * 24),
      );
      if (days >= 0) {
        total += days;
        count++;
      }
    }
  }
  return count > 0 ? roundTo(total / count, 1) : 0;
}

async function computeMetrics() {
  const today = todayLocal();
  const ym = today.slice(0, 7);
  const days = monthDays(ym);

  const [{ data: monthRows }, { data: allRows }, clients, rateHistory] =
    await Promise.all([
      supabase
        .from('movements')
        .select('type, currency, amount_usd, amount_bs, date')
        .gte('date', `${ym}-01`)
        .lte('date', today),
      supabase
        .from('movements')
        .select('type, date')
        .order('client_id', { ascending: true })
        .order('date', { ascending: true })
        .order('id', { ascending: true }),
      listClients(),
      supabase
        .from('rates')
        .select('date, usd_ves')
        .order('date', { ascending: false })
        .limit(30),
    ]);

  const rows = (monthRows ?? []) as MetricsRow[];
  const tot = rows.reduce(
    (acc, r) => {
      if (r.type === 'abono') {
        acc.cobrado_bs += r.amount_bs;
        acc.cobrado_usd += r.amount_usd;
      } else {
        acc.deudas_bs += r.amount_bs;
        acc.deudas_usd += r.amount_usd;
      }
      return acc;
    },
    { cobrado_bs: 0, cobrado_usd: 0, deudas_bs: 0, deudas_usd: 0 },
  );

  const byDay = new Map<string, { cobrado_bs: number; deudas_bs: number }>();
  for (const d of days) byDay.set(d, { cobrado_bs: 0, deudas_bs: 0 });
  for (const r of rows) {
    const acc = byDay.get(r.date);
    if (!acc) continue;
    if (r.type === 'abono') acc.cobrado_bs += r.amount_bs;
    else acc.deudas_bs += r.amount_bs;
  }
  const serie_diaria = days.map((d) => ({
    date: d,
    cobrado: roundTo(byDay.get(d)!.cobrado_bs, 2),
    deudas: roundTo(byDay.get(d)!.deudas_bs, 2),
  }));

  const top_deudores = (clients ?? [])
    .filter((c) => c.saldo_bs > 0)
    .sort((a, b) => b.saldo_bs - a.saldo_bs)
    .slice(0, 5)
    .map((c) => ({
      id: c.client.id,
      name: c.client.name,
      saldo_bs: c.saldo_bs,
      saldo_usd: c.saldo_usd,
    }));

  const rate_evolution = ((rateHistory?.data ?? []) as Array<{ date: string; usd_ves: number }>)
    .reverse()
    .map((r) => ({ date: r.date, usd_ves: r.usd_ves }));

  return {
    mes: ym,
    hoy: today,
    total: {
      cobrado_bs: roundTo(tot.cobrado_bs, 2),
      cobrado_usd: roundTo(tot.cobrado_usd, 2),
      deudas_bs: roundTo(tot.deudas_bs, 2),
      deudas_usd: roundTo(tot.deudas_usd, 2),
    },
    serie_diaria,
    top_deudores,
    dias_promedio_cobro: timeToPay((allRows ?? []) as Array<{ type: MovementType; date: string }>),
    tasa_hoy: rate_evolution[rate_evolution.length - 1]?.usd_ves ?? 0,
    rate_evolution,
  };
}