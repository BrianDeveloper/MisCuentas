import { json } from '../_shared/cors.ts';
import { handleOptions, supabase } from '../_shared/db.ts';
import { requireAuth } from '../_shared/auth.ts';
import {
  getLatestRate,
  todayLocal,
  upsertRate,
  type Rate,
} from '../_shared/helpers.ts';
import { fetchBcvToday } from '../_shared/bcv.ts';

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
      if (action === 'latest') {
        return json({ rate: await getLatestRate() });
      }
      if (action === 'history') {
        const limit = Math.min(Number(url.searchParams.get('limit') ?? 15) || 15, 60);
        const { data } = await supabase
          .from('rates')
          .select('date, usd_ves')
          .order('date', { ascending: false })
          .limit(limit);
        return json({ history: data ?? [] });
      }
      return json({ error: 'Acción inválida' }, 400);
    }

    if (req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

      if (action === 'refresh') {
        const bcv = await fetchBcvToday(todayLocal);
        if (!bcv) {
          return json(
            {
              error:
                'No se pudo obtener la tasa del BCV. Revisa tu conexión o ingrésala manualmente.',
            },
            502,
          );
        }
        await upsertRate(bcv.date, bcv.usd_ves, bcv.eur_ves);
        return json({ ok: true, rate: await getLatestRate() });
      }

      if (action === 'manual') {
        const date = String(body.date ?? '');
        const usd_ves = Number(body.usd_ves);
        const eur_ves = Number(body.eur_ves);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return json({ error: 'Fecha inválida (use YYYY-MM-DD)' }, 400);
        }
        if (!Number.isFinite(usd_ves) || usd_ves <= 0) {
          return json({ error: 'Tasa inválida, debe ser mayor a 0' }, 400);
        }
        const { count } = await supabase
          .from('movements')
          .select('id', { count: 'exact', head: true })
          .eq('date', date);
        if ((count ?? 0) > 0 && body.force !== true) {
          return json(
            {
              error:
                'Esta fecha ya tiene movimientos registrados. Cambiar la tasa no alterará su historial, pero la dejaría inconsistente con él. Envía force=true para continuar.',
              needsForce: true,
            },
            409,
          );
        }
        await upsertRate(
          date,
          usd_ves,
          Number.isFinite(eur_ves) && eur_ves > 0 ? eur_ves : 0,
        );
        const latest = await getLatestRate();
        return json({ ok: true, rate: latest, date, usd_ves, eur_ves });
      }

      return json({ error: 'Acción inválida' }, 400);
    }

    return json({ error: 'Método no permitido' }, 405);
  } catch (err) {
    console.error('[rates]', err);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});