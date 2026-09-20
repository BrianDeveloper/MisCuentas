// Herramienta CLI para gestionar la base SQLite de la app.
// Uso:
//   npm run db -- tables                  ver tablas
//   npm run db -- query "SELECT * FROM clients"
//   npm run db -- backup                  crear copia en server/data/backups/
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.resolve(here, '..', 'data');
const dbPath = path.join(dataDir, 'cuentas.db');

if (!fs.existsSync(dbPath)) {
  console.error(`No existe la base en: ${dbPath}\nInicia la app una vez para crearla.`);
  process.exit(1);
}

const db = new DatabaseSync(dbPath, { readOnly: false });

function printRows(rows) {
  if (rows.length === 0) {
    console.log('(sin resultados)');
    return;
  }
  const cols = Object.keys(rows[0]);
  console.log(cols.join('\t'));
  for (const r of rows) {
    console.log(cols.map((c) => String(r[c] ?? '')).join('\t'));
  }
}

function doBackup() {
  db.exec('PRAGMA wal_checkpoint(FULL)');
  const backupsDir = path.join(dataDir, 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(backupsDir, `cuentas-${stamp}.db`);
  fs.copyFileSync(dbPath, dest);
  console.log(`Backup creado: ${dest}`);
}

const [, , command, arg] = process.argv;

if (command === 'tables') {
  printRows(db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all());
} else if (command === 'query') {
  if (!arg) {
    console.log('Uso: npm run db -- query "SELECT ..."');
    process.exit(1);
  }
  const isRead = /^\s*(select|pragma|with|explain)/i.test(arg);
  const stmt = db.prepare(arg);
  if (isRead) {
    printRows(stmt.all());
  } else {
    const res = stmt.run();
    console.log(`OK: ${res.changes} fila(s) modificada(s)`);
  }
} else if (command === 'backup') {
  doBackup();
} else if (command === 'resetpin') {
  db.prepare("DELETE FROM settings WHERE key = 'pin_hash'").run();
  db.prepare('DELETE FROM sessions').run();
  console.log(
    'PIN eliminado y sesiones cerradas. La app te pedirá crear un PIN nuevo al entrar.',
  );
} else {
  console.log(`Uso:
  npm run db -- tables
  npm run db -- query "SELECT ..."
  npm run db -- backup
  npm run db -- resetpin`);
  process.exit(1);
}