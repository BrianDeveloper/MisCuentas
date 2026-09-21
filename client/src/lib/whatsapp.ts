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

const PLACEHOLDER_RE = /\{([a-zA-Z]+)\}/g;

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

function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  const lines = template.split('\n');
  const rendered: string[] = [];
  for (const raw of lines) {
    let empty = false;
    const line = raw.replace(PLACEHOLDER_RE, (_m, key: string) => {
      const value = vars[key] ?? '';
      if (value === '') empty = true;
      return value;
    });
    if (empty) continue;
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

export function buildWhatsAppUrl(number: string, message: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
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
  whatsappBaseUrl?: string;
  whatsappToken?: string;
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

export function buildPagoMovilUrl(opts: {
  number: string;
  balanceBs: number;
  usdHoy: number;
  pago: PagoMovilConfig;
  qrUrl: string | null;
}): string {
  return buildWhatsAppUrl(
    opts.number,
    buildPagoMovilMessage({
      balanceBs: opts.balanceBs,
      usdHoy: opts.usdHoy,
      pago: opts.pago,
      qrUrl: opts.qrUrl,
    }),
  );
}