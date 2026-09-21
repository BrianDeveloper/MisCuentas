import fs from 'node:fs';
import path from 'node:path';
import { unzipSync, zipSync } from 'fflate';

const URL_BASE = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const SVC = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
const BUCKET = (process.env.WA_SESSION_BUCKET ?? 'wa').trim();
const PREFIX = 'state-';
const KEEP = 3;

export const storageEnabled = Boolean(URL_BASE && SVC);

function headers(): Record<string, string> {
  return { apikey: SVC, Authorization: `Bearer ${SVC}` };
}

async function ensureBucket(): Promise<void> {
  if (!URL_BASE || !SVC) return;
  await fetch(`${URL_BASE}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  });
}

async function listObjects(): Promise<Array<{ name: string; updated_at: string; id: string }>> {
  if (!URL_BASE || !SVC) return [];
  const res = await fetch(`${URL_BASE}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prefix: '',
      limit: 100,
      offset: 0,
      search: PREFIX,
      sortBy: { column: 'name', order: 'asc' },
    }),
  });
  if (!res.ok) return [];
  const arr = (await res.json()) as Array<{ name: string; updated_at: string; id: string }>;
  return (arr || []).filter((o) => o.name.startsWith(PREFIX));
}

function walk(dir: string): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const read = (d: string, base: string): void => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, entry.name);
      const rel = path.join(base, entry.name);
      if (entry.isDirectory()) read(abs, rel);
      else out.set(rel.replace(/\\/g, '/'), fs.readFileSync(abs));
    }
  };
  read(dir, '');
  return out;
}

export async function restoreSession(dir: string): Promise<number> {
  if (!storageEnabled) return 0;
  await ensureBucket();
  const list = (await listObjects()).sort(
    (a, b) => a.updated_at.localeCompare(b.updated_at),
  );
  const newest = list[list.length - 1];
  if (!newest) return 0;
  const res = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${newest.name}`, {
    headers: headers(),
  });
  if (!res.ok) return 0;
  const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, data] of Object.entries(files)) {
    const target = path.join(dir, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(data));
  }
  return Object.keys(files).length;
}

export async function backupSession(dir: string): Promise<void> {
  if (!storageEnabled) return;
  try {
    await ensureBucket();
    if (!fs.existsSync(dir)) return;
    const files = walk(dir);
    if (files.size === 0) return;
    const entries: Record<string, Uint8Array> = {};
    for (const [name, buf] of files) entries[name] = new Uint8Array(buf);
    const zipped = zipSync(entries);
    const name = `${PREFIX}${Date.now()}.zip`;
    await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${name}`, {
      method: 'POST',
      headers: {
        ...headers(),
        'Content-Type': 'application/octet-stream',
      },
      body: new Uint8Array(zipped),
    });
    void prune();
  } catch (err) {
    console.warn('[wa-storage] no se pudo respaldar la sesión:', err);
  }
}

async function prune(): Promise<void> {
  try {
    const list = (await listObjects()).sort(
      (a, b) => a.updated_at.localeCompare(b.updated_at),
    );
    const toDelete = list.slice(0, Math.max(0, list.length - KEEP));
    for (const obj of toDelete) {
      await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${obj.name}`, {
        method: 'DELETE',
        headers: headers(),
      });
    }
  } catch (err) {
    console.warn('[wa-storage] no se pudo limpiar respaldos viejos:', err);
  }
}

export async function clearSession(): Promise<void> {
  if (!storageEnabled) return;
  try {
    for (const obj of await listObjects()) {
      await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${obj.name}`, {
        method: 'DELETE',
        headers: headers(),
      });
    }
  } catch (err) {
    console.warn('[wa-storage] no se pudo borrar la sesión remota:', err);
  }
}