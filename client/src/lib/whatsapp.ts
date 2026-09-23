import { fmtBs, fmtDate, fmtNum, fmtUsd, todayInput } from './format';

export function toWhatsAppNumber(phone: string): string | null {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('0')) return `58${digits.slice(1)}`;
  if (digits.startsWith('4') && digits.length === 10) return `58${digits}`;
  if (digits.startsWith('1') && digits.length === 11) return digits;
  if (digits.length < 8) return null;
  return digits;
}

const PLACEHOLDER_KEYS = ['nombre', 'fecha', 'monto', 'usd', 'tasa', 'banco', 'tipo', 'documento', 'telefono', 'qr'] as const;

export const DEFAULT_BALANCE_TEMPLATE = [
  'Hola {nombre}!',
  '',
  'Te recuerdo que tienes un saldo pendiente conmigo:',
  '',
  '- Fecha: {fecha}',
  '- Monto adeudado: {monto} (aprox. {usd} el día de hoy)',
  '- Tasa BCV del día: 1 USD = Bs.S {tasa}',
  '',
  'Agradezco tu abono cuando puedas. ¡Gracias!',
].join('\n');

export const DEFAULT_PAGO_TEMPLATE = [
  'Para tu pago móvil:',
  '',
  '- Banco: {banco}',
  '- {tipo}: {documento}',
  '- Teléfono: {telefono}',
  '',
  '- Monto adeudado: {monto} (aprox. {usd})',
  '{qr}',
  '',
  '¡Gracias!',
].join('\n');

const INVISIBLE = new Set([
  '\u00AD', '\u200B', '\u200C', '\u200D', '\u200E', '\u200F',
  '\u2028', '\u2029', '\u202A', '\u202B', '\u202C', '\u202D', '\u202E',
  '\u2060', '\u2061', '\u2062', '\u2063', '\u2064',
  '\uFEFF', '\uFFF9', '\uFFFA', '\uFFFB',
]);

function sanitize(str: string): string {
  return [...str].filter(c => !INVISIBLE.has(c) && c !== '*').join('');
}

function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  const text = sanitize(template);
  const lines = text.split('\n');
  const rendered: string[] = [];
  for (const raw of lines) {
    let skip = false;
    let line = sanitize(raw);
    for (const key of PLACEHOLDER_KEYS) {
      const value = vars[key] ?? '';
      if (line.includes(`{${key}}`) && value === '') { skip = true; break; }
      line = line.split(`{${key}}`).join(value);
    }
    if (skip) continue;
    rendered.push(line.trimEnd());
  }
  return rendered
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildBalanceMessage(
  opts: {
    name: string;
    balanceBs: number;
    usdHoy: number;
    rate: number | null;
  },
  template?: string,
): string {
  return renderTemplate(
    template && template.trim() ? template : DEFAULT_BALANCE_TEMPLATE,
    {
      nombre: opts.name,
      fecha: fmtDate(todayInput()),
      monto: fmtBs(opts.balanceBs),
      usd: fmtUsd(opts.usdHoy),
      tasa: opts.rate != null && opts.rate > 0 ? fmtNum(opts.rate) : '',
    },
  );
}

export interface PagoMovilConfig {
  banco: string;
  tipoDoc: string;
  documento: string;
  telefono: string;
  hasQr: boolean;
  qrFile: string;
  baseUrl: string;
  qrUrl: string;
}

export function buildPagoMovilMessage(
  opts: {
    balanceBs: number;
    usdHoy: number;
    pago: PagoMovilConfig;
    qrUrl: string | null;
  },
  template?: string,
): string {
  return renderTemplate(
    template && template.trim() ? template : DEFAULT_PAGO_TEMPLATE,
    {
      banco: opts.pago.banco,
      tipo: opts.pago.tipoDoc,
      documento: opts.pago.documento,
      telefono: opts.pago.telefono,
      monto: fmtBs(opts.balanceBs),
      usd: fmtUsd(opts.usdHoy),
      qr: opts.qrUrl ? `QR de pago: ${opts.qrUrl}` : '',
    },
  );
}

/**
 * Descarga la imagen del QR desde la URL y la copia al portapapeles como imagen PNG.
 * Lanza error si el navegador no soporta la Clipboard API o falla la descarga.
 */
export async function copyQrToClipboard(qrUrl: string): Promise<void> {
  const res = await fetch(qrUrl);
  if (!res.ok) throw new Error('No se pudo descargar el QR');
  const blob = await res.blob();
  const pngBlob = blob.type === 'image/png' ? blob : new Blob([blob], { type: 'image/png' });
  await navigator.clipboard.write([
    new ClipboardItem({ 'image/png': pngBlob }),
  ]);
}
