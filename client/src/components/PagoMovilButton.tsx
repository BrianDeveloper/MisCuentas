import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import {
  buildPagoMovilMessage,
  buildPagoMovilUrl,
  toWhatsAppNumber,
  type PagoMovilConfig,
} from '../lib/whatsapp';

export default function PagoMovilButton({
  phone,
  name,
  balanceBs,
  usdHoy,
}: {
  phone: string;
  name: string;
  balanceBs: number;
  usdHoy: number;
}) {
  const [pago, setPago] = useState<PagoMovilConfig | null | undefined>(undefined);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [errText, setErrText] = useState('');

  useEffect(() => {
    api<{ pago: PagoMovilConfig }>('settings')
      .then((r) => setPago(r.pago))
      .catch(() => setPago(null));
  }, []);

  const number = toWhatsAppNumber(phone);
  if (!number || !pago) return null;
  const hasData = Boolean(pago.banco || pago.documento || pago.telefono);
  if (!hasData) return null;

  const connected = Boolean(pago.whatsappBaseUrl);
  const qrUrl = pago.hasQr && pago.qrUrl ? pago.qrUrl : null;

  const send = async () => {
    if (sending || !pago?.whatsappBaseUrl) return;
    setSending(true);
    setSent(false);
    setErrText('');
    try {
      const caption = buildPagoMovilMessage({ balanceBs, usdHoy, pago, qrUrl: null });
      const base = pago.whatsappBaseUrl.replace(/\/+$/, '');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (pago.whatsappToken) headers.Authorization = `Bearer ${pago.whatsappToken}`;
      const res = await fetch(`${base}/send`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          to: number,
          text: caption,
          imageUrl: qrUrl ?? '',
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new ApiError(
          res.status,
          (data as { error?: string }).error || 'No se pudo enviar.',
        );
      }
      setSent(true);
      setTimeout(() => setSent(false), 5000);
    } catch (err) {
      setErrText(err instanceof ApiError ? err.message : 'No se pudo enviar.');
    } finally {
      setSending(false);
    }
  };

  const waHref = buildPagoMovilUrl({ number, balanceBs, usdHoy, pago, qrUrl });

  return connected ? (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={send}
        disabled={sending}
        aria-label={`Enviar datos de pago móvil por WhatsApp a ${name}`}
        className="flex items-center gap-1.5 rounded-lg border border-sky-600 bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
        </svg>
        {sending ? 'Enviando…' : sent ? 'Enviado ✓' : 'Pago móvil'}
      </button>
      {errText && <span className="text-xs font-medium text-red-600">{errText}</span>}
    </div>
  ) : (
    <a
      href={waHref}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Enviar datos de pago móvil por WhatsApp a ${name}`}
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-sky-600 bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-5 w-5"
        aria-hidden="true"
      >
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
      </svg>
      Pago móvil
    </a>
  );
}