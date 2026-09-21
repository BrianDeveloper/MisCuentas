import { json } from '../_shared/cors.ts';
import { handleOptions, supabase } from '../_shared/db.ts';
import { requireAuth } from '../_shared/auth.ts';

const BUCKET = 'qr';

const STORAGE_PUBLIC_BASE = () =>
  `${(Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}`;

interface PagoConfig {
  banco: string;
  tipoDoc: 'V' | 'J' | 'E' | 'P';
  documento: string;
  telefono: string;
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  try {
    if (!(await requireAuth(req))) {
      return json({ error: 'No autenticado' }, 401);
    }

    const getSetting = async (key: string): Promise<string | null> => {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', key)
        .maybeSingle();
      return data ? String(data.value) : null;
    };
    const setSetting = async (key: string, value: string): Promise<void> => {
      await supabase.from('app_settings').upsert({ key, value });
    };

    if (req.method === 'GET') {
      const raw = await getSetting('pagoMovil');
      let config: PagoConfig = { banco: '', tipoDoc: 'V', documento: '', telefono: '' };
      try {
        config = { ...config, ...JSON.parse(raw ?? '{}') };
      } catch { /* config por defecto */ }

      const qrFile = await getSetting('pagoMovilQrFile');
      const baseUrl = STORAGE_PUBLIC_BASE();
      const hasQr = Boolean(qrFile);

      return json({
        pago: {
          banco: config.banco,
          tipoDoc: config.tipoDoc,
          documento: config.documento,
          telefono: config.telefono,
          baseUrl,
          hasQr,
          qrFile: qrFile ?? '',
          qrUrl: hasQr ? `${baseUrl}/${qrFile}` : '',
          whatsappBaseUrl: (await getSetting('whatsappBaseUrl')) ?? '',
          whatsappToken: (await getSetting('whatsappToken')) ?? '',
        },
        qrBase: baseUrl,
      });
    }

    if (req.method === 'PUT') {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      if (action !== 'update') return json({ error: 'Acción inválida' }, 400);

      const banco = String(body.banco ?? '').trim();
      const documento = String(body.documento ?? '').trim();
      const telefono = String(body.telefono ?? '').trim();
      const tipoDoc = ['V', 'J', 'E', 'P'].includes(body.tipoDoc as string)
        ? (body.tipoDoc as PagoConfig['tipoDoc'])
        : 'V';
      if (!banco && !documento && !telefono) {
        return json({ error: 'Completa los datos del pago móvil.' }, 400);
      }

      await setSetting('pagoMovil', JSON.stringify({ banco, tipoDoc, documento, telefono }));

      const whatsappBaseUrl = String(body.whatsappBaseUrl ?? '').trim().replace(/\/+$/, '');
      if (whatsappBaseUrl && !/^https?:\/\//i.test(whatsappBaseUrl)) {
        return json({ error: 'La URL del worker debe empezar con http:// o https://' }, 400);
      }
      await setSetting('whatsappBaseUrl', whatsappBaseUrl);

      await setSetting('whatsappToken', String(body.whatsappToken ?? '').trim());

      const qrFile = await getSetting('pagoMovilQrFile');
      const baseUrl = STORAGE_PUBLIC_BASE();
      const hasQr = Boolean(qrFile);

      return json({
        ok: true,
        pago: {
          banco,
          tipoDoc,
          documento,
          telefono,
          baseUrl,
          hasQr,
          qrFile: qrFile ?? '',
          qrUrl: hasQr ? `${baseUrl}/${qrFile}` : '',
          whatsappBaseUrl,
          whatsappToken: String(body.whatsappToken ?? '').trim(),
        },
        qrBase: baseUrl,
      });
    }

    return json({ error: 'Método no permitido' }, 405);
  } catch (err) {
    console.error('[settings]', err);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});