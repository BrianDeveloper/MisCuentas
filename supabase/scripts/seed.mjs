// Migración de Mis Cuentas: SQLite local -> Supabase.
//
// Uso:
//   SUPABASE_URL=https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=eyJ...        (service_role, key secreta del panel)
//   node supabase/scripts/seed.mjs [--dry-run]
//
// Requiere: node >= 22 (fetch nativo).
// Pasos:
//   1) Lee server/data/cuentas.db (SQLite) con node:sqlite.
//   2) Crea el bucket 'qr' público.
//   3) Inserta clients, movements (remepeando client_id), rates y app_settings
//      (incluye pin_hash para conservar el PIN).
//   4) Sube server/data/uploads/qr.png a Storage public/qr/qr.png si existe.
//   5) Sin --dry-run, borra antes las tablas destino para ser idempotente.

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const PAGO_QRFILE = process.env.PAGO_QRFILE ?? 'qr.png';
const DRY_RUN = process.argv.includes('--dry-run');

if (['', 'xxx', 'publishable-key', 'secret-key'].includes(SERVICE_KEY)) {
  throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY.');
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

function rest(pathname, { method = 'GET', body } = {}) {
  const prefer = method === 'POST' ? { Prefer: 'return=representation' } : {};
  return fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    method,
    headers: { ...headers, ...prefer },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function jsonOrThrow(pathname, opts) {
  const res = await rest(pathname, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${opts?.method ?? 'GET'} ${pathname} -> ${res.status}: ${text.slice(0, 400)}`);
  }
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') ?? '';
  return ct.includes('json') ? await res.json() : null;
}

const DB_PATH = path.join(root, 'server', 'data', 'cuentas.db');
const QR_PATH = path.join(root, 'server', 'data', 'uploads', PAGO_QRFILE);

const db = new DatabaseSync(DB_PATH, { readOnly: true });

function loadAll(table) {
  return db.prepare(`SELECT * FROM ${table}`).all();
}

async function main() {
  if (DRY_RUN) {
    console.log('>>> DRY-RUN: no se escribe nada en Supabase.\n');
  }

  const clients = loadAll('clients');
  const movements = loadAll('movements');
  const rates = loadAll('rates');
  const settings = loadAll('settings');

  console.log(`Cargados: ${clients.length} clientes, ${movements.length} movimientos, ${rates.length} tasas, ${settings.length} settings.\n`);

  if (!DRY_RUN) {
    // 1) bucket público qr
    const bucketRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: 'qr', name: 'qr', public: true }),
    });
    if (!bucketRes.ok && bucketRes.status !== 400) {
      throw new Error(`Crear bucket -> ${bucketRes.status}`);
    }
    console.log('Bucket "qr" listo (público).');
    console.log('   (Ignora el error si el bucket ya existía.)');

    // 2) limpiar destino (orden seguro por FKs)
    await jsonOrThrow('movements?id=gte.0', { method: 'DELETE' });
    await jsonOrThrow('clients?id=gte.0', { method: 'DELETE' });
    await jsonOrThrow('rates?date=not.is.null', { method: 'DELETE' });
    await jsonOrThrow('app_settings?key=not.is.null', { method: 'DELETE' });
    await jsonOrThrow('app_sessions?token=not.is.null', { method: 'DELETE' });

    // 3) clients (los ids los genera el SERIAL; remapeo)
    const idMap = new Map();
    for (const c of clients) {
      const created = await jsonOrThrow('clients', {
        method: 'POST',
        body: {
          name: c.name,
          phone: c.phone,
          notes: c.notes,
          created_at: c.created_at,
        },
      });
      const row = Array.isArray(created) ? created[0] : created;
      if (!row?.id) throw new Error(`No se pudo crear el cliente ${c.name}: ${JSON.stringify(created)}`);
      idMap.set(Number(c.id), Number(row.id));
      console.log(`  cliente ${c.id} -> ${row.id} (${c.name})`);
    }

    // 4) movements
    for (const m of movements) {
      await jsonOrThrow('movements', {
        method: 'POST',
        body: {
          client_id: idMap.get(Number(m.client_id)),
          type: m.type,
          currency: m.currency,
          amount: m.amount,
          rate_bs: m.rate_bs,
          amount_usd: m.amount_usd,
          amount_bs: m.amount_bs,
          concept: m.concept,
          date: m.date,
          created_at: m.created_at,
        },
      });
    }
    console.log(`Movimientos insertados: ${movements.length}.`);

    // 5) rates
    for (const r of rates) {
      await jsonOrThrow('rates', {
        method: 'POST',
        body: { date: r.date, usd_ves: r.usd_ves, eur_ves: r.eur_ves ?? 0 },
      });
    }
    console.log(`Tasas insertadas: ${rates.length}.`);

    // 6) settings (pin_hash se conserva -> mismo PIN)
    const keep = new Set(['pin_hash', 'pagoMovil', 'pagoMovilQrFile']);
    for (const s of settings) {
      if (!keep.has(s.key)) continue;
      await jsonOrThrow('app_settings', {
        method: 'POST',
        body: { key: s.key, value: s.value },
      });
      console.log(`  setting ${s.key}: ${s.key === 'pin_hash' ? '(secreto)' : s.value}`);
    }

    // 7) QR a Storage
    if (fs.existsSync(QR_PATH)) {
      const file = fs.readFileSync(QR_PATH);
      const mime = PAGO_QRFILE.endsWith('.jpg') || PAGO_QRFILE.endsWith('.jpeg')
        ? 'image/jpeg'
        : PAGO_QRFILE.endsWith('.webp')
        ? 'image/webp'
        : 'image/png';
      const up = await fetch(`${SUPABASE_URL}/storage/v1/object/qr/${PAGO_QRFILE}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': mime, 'x-upsert': 'true' },
        body: file,
      });
      if (!up.ok) {
        const text = await up.text().catch(() => '');
        console.warn(`  QR no se subió (${up.status}): ${text.slice(0, 300)}`);
      } else {
        console.log(`  QR subido: ${SUPABASE_URL}/storage/v1/object/public/qr/${PAGO_QRFILE} (${file.length} bytes)`);
      }
    }

    console.log('\nMigración completada.');
  } else {
    console.log('(dry-run) NO se ejecutó nada contra Supabase.');
  }

  console.log('\nReferencia de URLs de función:');
  console.log(`  ${SUPABASE_URL}/functions/v1/auth`);
  console.log(`  ${SUPABASE_URL}/functions/v1/clients`);
  console.log(`  ${SUPABASE_URL}/functions/v1/rates`);
  console.log(`  ${SUPABASE_URL}/functions/v1/settings`);
  console.log(`  ${SUPABASE_URL}/functions/v1/qr`);
  console.log(`  ${SUPABASE_URL}/functions/v1/export`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});