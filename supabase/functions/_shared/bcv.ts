import { load } from 'npm:cheerio@1.0.0';

export interface BcvRate {
  usd_ves: number;
  eur_ves: number;
  date: string;
}

const HOME_URL = 'https://www.bcv.org.ve/';
const COTIZACION_URL = 'https://www.bcv.org.ve/cotizacion';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export function parseBcvNumber(text: string): number | null {
  const cleaned = text
    .replace(/\s+/g, '')
    .replace(/\$|Bs|US/g, '')
    .trim();
  const match = cleaned.match(/(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?)/);
  if (!match) return null;
  const value = parseFloat(match[1].replace(/\./g, '').replace(/,/g, '.'));
  return Number.isFinite(value) ? value : null;
}

export function parseBcvHtml(html: string, today: () => string): BcvRate | null {
  const $ = load(html);
  const usdText = $('#dolar .strong-tb').first().text();
  const usd_ves = parseBcvNumber(usdText);
  if (!usd_ves) return null;
  const eurText = $('#euro .strong-tb').first().text();
  const eur_ves = parseBcvNumber(eurText) ?? 0;

  const iso =
    $('span.date-display-single').first().attr('content') ??
    $('meta[property="dc:date"]').first().attr('content') ??
    $('time[datetime]').first().attr('datetime') ??
    '';
  const isoMatch = iso.match(/(\d{4}-\d{2}-\d{2})/);
  const date = isoMatch ? isoMatch[1] : null;

  if (!date) {
    const text = $('#block-views-tipo-de-cambio-oficial-del-bcv').text();
    const m = text.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
    if (m) {
      const months: Record<string, number> = {
        enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
        julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
      };
      const month = months[(m[2] || '').toLowerCase()];
      if (month) {
        const y = Number(m[3]);
        const d = Number(m[1]);
        if (y >= 2000 && d >= 1 && d <= 31) {
          return {
            usd_ves,
            eur_ves,
            date: `${y}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
          };
        }
      }
    }
  }

  return { usd_ves, eur_ves, date: date ?? today() };
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9',
      },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function fetchBcvToday(today: () => string): Promise<BcvRate | null> {
  const home = await fetchPage(HOME_URL);
  if (home) {
    const parsed = parseBcvHtml(home, today);
    if (parsed && parsed.date) return parsed;
  }
  const cotizacion = await fetchPage(COTIZACION_URL);
  if (cotizacion) {
    const parsed = parseBcvHtml(cotizacion, today);
    if (parsed && parsed.date) return parsed;
  }
  return null;
}

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RATE_RE = /(\d{1,3}(?:\.\d{3})*(?:,\d+))\s*Bs\/USD/i;
const SENTENCE_RE = /se\s+fij[oó]\s+en\s+(\d{1,3}(?:\.\d{3})*(?:,\d+))\s*Bs\/USD/i;
const FECHA_RE = /(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/g;

export async function fetchBcvHistorical(date: string): Promise<BcvRate | null> {
  if (!DATE_RE.test(date)) return null;
  const [y, m, d] = date.split('-').map(Number);
  const month = MONTHS_ES[m - 1];
  if (!month || y < 2010 || y > 2100) return null;

  const slug = `tasa-de-cambio-bcv-${String(d).padStart(2, '0')}-${month}-${y}`;
  const html = await fetchPage(`https://finanzasdigital.com/${slug}/`);
  if (!html) return null;

  const $ = load(html);
  const text = $.root().text();

  const sentenceMatch = text.match(SENTENCE_RE);
  const titleMatch = (html.match(/<title>(.*?)<\/title>/is) || [])[1] ?? '';
  const titleRate = titleMatch.match(RATE_RE);
  const rateMatch = sentenceMatch ?? titleRate;
  if (!rateMatch?.[1]) return null;
  const usd_ves = parseBcvNumber(rateMatch[1]);
  if (!usd_ves) return null;

  const found = [...text.matchAll(FECHA_RE)].some(
    (mm) =>
      MONTHS_ES.indexOf(mm[2].toLowerCase()) === m - 1 &&
      Number(mm[1]) === d &&
      Number(mm[3]) === y,
  );
  if (!found) return null;

  return { usd_ves, eur_ves: 0, date };
}

export { DATE_RE };