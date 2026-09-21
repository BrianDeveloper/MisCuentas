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
          .select('id')
          .eq('id', id)
          .maybeSingle();
        if (!existing) {
          return json({ error: 'Movimiento no encontrado' }, 404);
        }
        await supabase.from('movements').delete().eq('id', id);
        return json({ ok: true });
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