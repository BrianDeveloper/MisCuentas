import { json } from '../_shared/cors.ts';
import { handleOptions, supabase } from '../_shared/db.ts';
import { requireAuth } from '../_shared/auth.ts';

const BUCKET = 'qr';
const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const PUBLIC_BASE = () =>
  `${(Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}`;

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    if (!(await requireAuth(req))) {
      return json({ error: 'No autenticado' }, 401);
    }
    if (req.method !== 'POST') {
      return json({ error: 'Método no permitido' }, 405);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // Asegurar bucket público (idempotente)
    try {
      await supabase.storage.createBucket(BUCKET, { public: true });
    } catch { /* ya existe */ }

    const getQrFile = async (): Promise<string | null> => {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'pagoMovilQrFile')
        .maybeSingle();
      return data ? String(data.value) : null;
    };
    const setQrFile = async (value: string): Promise<void> => {
      await supabase.from('app_settings').upsert({ key: 'pagoMovilQrFile', value });
    };

    if (body.remove === true) {
      const old = await getQrFile();
      if (old) {
        try { await supabase.storage.from(BUCKET).remove([old]); } catch { /* noop */ }
      }
      await setQrFile('');
      return json({ ok: true, hasQr: false, qrFile: '' });
    }

    const mime = String(body.mime ?? '');
    const ext = MIME_EXT[mime];
    if (!ext) {
      return json({ error: 'Formato no soportado (use PNG, JPG o WEBP).' }, 400);
    }

    const b64 = String(body.dataBase64 ?? '')
      .replace(/^data:.*?;base64,/, '')
      .trim();
    let bytes: Uint8Array;
    try {
      const bin = atob(b64);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } catch {
      return json({ error: 'Imagen inválida.' }, 400);
    }
    if (bytes.length < 16 || bytes.length > 5 * 1024 * 1024) {
      return json({ error: 'Imagen inválida o demasiado grande.' }, 400);
    }

    const newFile = `qr.${ext}`;
    const old = await getQrFile();

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(newFile, bytes, { contentType: mime, upsert: true });
    if (error) {
      return json({ error: error.message || 'No se pudo subir la imagen.' }, 500);
    }
    if (old && old !== newFile) {
      try { await supabase.storage.from(BUCKET).remove([old]); } catch { /* noop */ }
    }
    await setQrFile(newFile);

    return json({
      ok: true,
      hasQr: true,
      qrFile: newFile,
      qrUrl: `${PUBLIC_BASE()}/${newFile}`,
    });
  } catch (err) {
    console.error('[qr]', err);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});