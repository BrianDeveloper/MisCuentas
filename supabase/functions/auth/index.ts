import { json } from '../_shared/cors.ts';
import { handleOptions } from '../_shared/db.ts';
import {
  authAttemptStatus,
  checkPin,
  clientScope,
  configurePin,
  createSession,
  destroySession,
  isConfigured,
  recordAuthFail,
  recordAuthSuccess,
  requireAuth,
  bearerOf,
} from '../_shared/auth.ts';

function lockoutBody(retryAfterSec: number): Response {
  return json(
    {
      error: `Demasiados intentos. Espera ${Math.ceil(retryAfterSec / 60)} min e intenta de nuevo.`,
      retryAfterSec,
    },
    429,
  );
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  try {
    if (req.method === 'GET') {
      if (action === 'status') {
        const configured = await isConfigured();
        const authenticated = configured ? await requireAuth(req) : false;
        return json({ configured, authenticated });
      }
      if (action === 'me') {
        const ok = await requireAuth(req);
        return ok ? json({ ok: true }) : json({ error: 'No autenticado' }, 401);
      }
      return json({ error: 'Acción inválida' }, 400);
    }

    if (req.method !== 'POST') {
      return json({ error: 'Método no permitido' }, 405);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    if (action === 'setup') {
      if (await isConfigured()) {
        return json({ error: 'El PIN ya está configurado' }, 400);
      }
      const pin = String(body.pin ?? '');
      if (!/^\d{4,6}$/.test(pin)) {
        return json({ error: 'El PIN debe tener entre 4 y 6 dígitos' }, 400);
      }
      await configurePin(pin);
      const token = await createSession();
      return json({ ok: true, token });
    }

    if (action === 'login') {
      const scope = clientScope(req);
      const status = await authAttemptStatus(scope);
      if (status.blocked) return lockoutBody(status.retryAfterSec);
      const pin = String(body.pin ?? '');
      if (!(await isConfigured()) || !(await checkPin(pin))) {
        await recordAuthFail(scope);
        return json({ error: 'PIN incorrecto' }, 401);
      }
      await recordAuthSuccess(scope);
      const token = await createSession();
      return json({ ok: true, token });
    }

    if (action === 'logout') {
      const token = bearerOf(req);
      if (token) await destroySession(token);
      return json({ ok: true });
    }

    if (action === 'change-pin') {
      const ok = await requireAuth(req);
      if (!ok) return json({ error: 'No autenticado' }, 401);
      const scope = clientScope(req);
      const status = await authAttemptStatus(scope);
      if (status.blocked) return lockoutBody(status.retryAfterSec);
      const current = String(body.current ?? '');
      const next = String(body.next ?? '');
      if (!(await checkPin(current))) {
        await recordAuthFail(scope);
        return json({ error: 'PIN actual incorrecto' }, 401);
      }
      await recordAuthSuccess(scope);
      if (!/^\d{4,6}$/.test(next)) {
        return json({ error: 'El nuevo PIN debe tener entre 4 y 6 dígitos' }, 400);
      }
      await configurePin(next);
      return json({ ok: true });
    }

    return json({ error: 'Acción inválida' }, 400);
  } catch (err) {
    console.error('[auth]', err);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});