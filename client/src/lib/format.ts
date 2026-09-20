const usdFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const bsFmt = new Intl.NumberFormat('es-VE', {
  style: 'currency',
  currency: 'VES',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numFmt = new Intl.NumberFormat('es-VE', {
  maximumFractionDigits: 2,
});

export function fmtUsd(n: number): string {
  return usdFmt.format(n);
}

export function fmtBs(n: number): string {
  return bsFmt.format(n);
}

export function fmtNum(n: number): string {
  return numFmt.format(n);
}

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function todayInput(): string {
  const now = new Date();
  const tz = now.toLocaleDateString('en-CA', {
    timeZone: 'America/Caracas',
  });
  return tz.split(',')[0];
}