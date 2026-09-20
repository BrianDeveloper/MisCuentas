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

export function buildBalanceMessage(opts: {
  name: string;
  balanceBs: number;
  usdHoy: number;
  rate: number | null;
}): string {
  const date = fmtDate(todayInput());
  const lines = [
    `Hola ${opts.name}!`,
    '',
    'Te recuerdo que tienes un saldo pendiente conmigo:',
    '',
    `- Fecha: ${date}`,
    `- Monto adeudado: ${fmtBs(opts.balanceBs)} (aprox. ${fmtUsd(opts.usdHoy)} el día de hoy)`,
  ];
  if (opts.rate != null && opts.rate > 0) {
    lines.push(`- Tasa BCV del día: 1 USD = Bs.S ${fmtNum(opts.rate)}`);
  }
  lines.push('', 'Agradezco tu abono cuando puedas. ¡Gracias!');
  return lines.join('\n');
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
}

export function buildPagoMovilMessage(opts: {
  balanceBs: number;
  usdHoy: number;
  pago: PagoMovilConfig;
  qrUrl: string | null;
}): string {
  const lines = [
    'Para tu pago móvil:',
    '',
    `- Banco: ${opts.pago.banco}`,
    `- ${opts.pago.tipoDoc}: ${opts.pago.documento}`,
    `- Teléfono: ${opts.pago.telefono}`,
    '',
    `- Monto adeudado: ${fmtBs(opts.balanceBs)} (aprox. ${fmtUsd(opts.usdHoy)})`,
  ];
  if (opts.qrUrl) {
    lines.push('', `QR de pago: ${opts.qrUrl}`);
  }
  lines.push('', '¡Gracias!');
  return lines.join('\n');
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