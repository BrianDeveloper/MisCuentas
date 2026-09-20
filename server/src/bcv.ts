import https from 'node:https';
import zlib from 'node:zlib';
import { load } from 'cheerio';
import { getRateFor, todayLocal, upsertRate } from './db.js';

export interface BcvRate {
  usd_ves: number;
  eur_ves: number;
  date: string; // YYYY-MM-DD
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

export function parseBcvHtml(html: string): BcvRate | null {
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

  return { usd_ves, eur_ves, date: date ?? todayLocal() };
}

async function fetchPageNoTls(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9',
          'Accept-Encoding': 'gzip',
        },
        rejectUnauthorized: false,
        timeout: 25000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c as Buffer));
        res.on('error', () => resolve(null));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            resolve(null);
            return;
          }
          const buf = Buffer.concat(chunks);
          const compressed =
            (res.headers['content-encoding'] || '').toLowerCase() === 'gzip'
              ? zlib.gunzipSync(buf)
              : buf;
          resolve(compressed.toString('utf8'));
        });
      },
    );
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', () => resolve(null));
  });
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9',
      },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    console.warn(
      `[BCV] fetch estándar falló (${
        (err as { cause?: { code?: string } }).cause?.code ?? (err as Error).message
      }); reintentando sin verificación de certificado`,
    );
    return fetchPageNoTls(url);
  }
}

export async function fetchBcvToday(): Promise<BcvRate | null> {
  const home = await fetchPage(HOME_URL);
  if (home) {
    const parsed = parseBcvHtml(home);
    if (parsed && parsed.date) return parsed;
  }
  const cotizacion = await fetchPage(COTIZACION_URL);
  if (cotizacion) {
    const parsed = parseBcvHtml(cotizacion);
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

export async function fetchBcvHistorical(date: string): Promise<BcvRate | null> {
  if (!DATE_RE.test(date)) return null;
  const [y, m, d] = date.split('-').map(Number);
  const month = MONTHS_ES[m - 1];
  if (!month || y < 2010 || y > 2100) return null;

  const slug = `tasa-de-cambio-bcv-${String(d).padStart(2, '0')}-${month}-${y}`;
  const html = await fetchPage(`https://finanzasdigital.com/${slug}/`);
  if (!html) return null;

  const text = load(html).root().text();

  const sentenceMatch = text.match(SENTENCE_RE);
  const titleMatch = (html.match(/<title>(.*?)<\/title>/is) || [])[1] ?? '';
  const titleRate = titleMatch.match(RATE_RE);
  const rateMatch = sentenceMatch ?? titleRate;
  if (!rateMatch?.[1]) return null;
  const usd_ves = parseBcvNumber(rateMatch[1]);
  if (!usd_ves) return null;

  const found = [...text.matchAll(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/g)].some(
    (mm) =>
      MONTHS_ES.indexOf(mm[2].toLowerCase()) === m - 1 &&
      Number(mm[1]) === d &&
      Number(mm[3]) === y,
  );
  if (!found) return null;

  return { usd_ves, eur_ves: 0, date };
}

export async function ensureRate(date: string): Promise<BcvRate | null> {
  const existing = getRateFor(date);
  if (existing && existing.date <= date) return existing;
  const fetched = await fetchBcvHistorical(date);
  if (fetched) {
    upsertRate(fetched.date, fetched.usd_ves);
    return getRateFor(date);
  }
  return null;
}