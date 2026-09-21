import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  type WASocket,
} from '@whiskeysockets/baileys';
import { backupSession, clearSession, restoreSession, storageEnabled } from './storage.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const dataDir =
  process.env.WA_DATA_DIR || path.resolve(here, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const sessionDir = process.env.WA_SESSION_DIR || path.join(dataDir, 'wa');

let sock: WASocket | null = null;
let status: 'closed' | 'connecting' | 'open' = 'closed';
let latestQr: string | null = null;
let ownNumber: string | null = null;
let starting = false;
let lastBackup = 0;
let backupTimer: NodeJS.Timeout | null = null;

async function backupNow(): Promise<void> {
  const now = Date.now();
  if (now - lastBackup < 15000) return;
  lastBackup = now;
  await backupSession(sessionDir);
}

export function isConnected(): boolean {
  return status === 'open' && sock != null;
}

export function getStatus(): { connected: boolean; phone: string | null } {
  return { connected: isConnected(), phone: ownNumber };
}

export function getQr(): string | null {
  return latestQr;
}

function hasCreds(): boolean {
  try {
    return fs.existsSync(path.join(sessionDir, 'creds.json'));
  } catch {
    return false;
  }
}

function isRegisteredSession(): boolean {
  try {
    return (
      JSON.parse(
        fs.readFileSync(path.join(sessionDir, 'creds.json'), 'utf8'),
      ).registered === true
    );
  } catch {
    return false;
  }
}

async function startSocket(): Promise<void> {
  if (sock || starting) return;
  starting = true;
  try {
    const registered = isRegisteredSession();

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: ['Mis Cuentas', 'Chrome', '120.0'],
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });
    sock = socket;
    status = 'connecting';

    if (backupTimer) clearInterval(backupTimer);
    backupTimer = setInterval(() => {
      void backupNow();
    }, 5 * 60 * 1000);
    backupTimer.unref();

    let wasOpen = false;

    socket.ev.on('creds.update', () => {
      void saveCreds();
      void backupNow();
    });

    socket.ev.on('connection.update', (update) => {
      if (update.qr) latestQr = update.qr;
      if (update.connection === 'open') {
        wasOpen = true;
        status = 'open';
        latestQr = null;
        ownNumber = socket.user?.id?.split(':')[0] ?? null;
        return;
      }
      if (update.connection === 'close') {
        const code = (
          update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
        )?.output?.statusCode;
        // Si no hay sesión registrada seguimos en modo pareo (se regenera el QR).
        // Si hay sesión registrada que ya estuvo abierta: reconexión tras un corte.
        const shouldRetry =
          !registered || (wasOpen && code !== DisconnectReason.loggedOut && code !== DisconnectReason.badSession);
        status = 'closed';
        if (backupTimer) {
          clearInterval(backupTimer);
          backupTimer = null;
        }
        sock = null;
        latestQr = null;
        ownNumber = null;
        if (shouldRetry) {
          setTimeout(() => {
            void startSocket();
          }, registered ? 5000 : 3000);
        }
      }
    });

    if (registered) {
      void socket.ev.flush?.();
    }
  } catch (err) {
    console.error('[wa] error al iniciar socket:', err);
    if (backupTimer) {
      clearInterval(backupTimer);
      backupTimer = null;
    }
    sock = null;
    status = 'closed';
  } finally {
    starting = false;
  }
}

export async function linkWhatsApp(): Promise<string | null> {
  if (sock && status === 'open') return null;
  if (sock) {
    sock.end(undefined);
    sock = null;
    status = 'closed';
    latestQr = null;
    ownNumber = null;
  }
  const registered = isRegisteredSession();
  if (!registered) {
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    } catch (err) {
      console.warn('[wa] no se pudo limpiar la sesión:', err);
    }
  }
  await startSocket();
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return latestQr;
}

export async function unlinkWhatsApp(): Promise<void> {
  if (sock) {
    try {
      await sock.logout();
    } catch (err) {
      console.warn('[wa] error al cerrar sesión:', err);
    }
    sock = null;
  }
  status = 'closed';
  latestQr = null;
  ownNumber = null;
  if (backupTimer) {
    clearInterval(backupTimer);
    backupTimer = null;
  }
  try {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  } catch (err) {
    console.warn('[wa] no se pudo eliminar la sesión:', err);
  }
  await clearSession();
}

function ensureConnected(): WASocket {
  if (!sock || status !== 'open') {
    throw new Error('WhatsApp no está vinculado.');
  }
  return sock;
}

function jidFor(toDigits: string): string {
  const digits = (toDigits || '').replace(/\D/g, '');
  if (!digits) throw new Error('Teléfono inválido.');
  return `${digits}@s.whatsapp.net`;
}

export async function sendMessage(
  toDigits: string,
  text: string,
  imageUrl: string | null,
): Promise<void> {
  const s = ensureConnected();
  const jid = jidFor(toDigits);
  if (imageUrl) {
    const res = await fetch(imageUrl);
    if (!res.ok) {
      throw new Error('No se pudo descargar la imagen adjunta.');
    }
    const buf = await res.arrayBuffer();
    const ext = path.extname(new URL(imageUrl).pathname).toLowerCase();
    const mimetype = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    await s.sendMessage(jid, {
      image: Buffer.from(buf),
      mimetype,
      caption: text,
      linkPreview: null,
    });
    return;
  }
  await s.sendMessage(jid, { text, linkPreview: null });
}

export async function initWhatsApp(): Promise<void> {
  if (storageEnabled) {
    const restored = await restoreSession(sessionDir);
    if (restored > 0) console.log(`[wa] sesión restaurada de Storage (${restored} archivos)`);
  }
  if (!hasCreds()) return;
  await startSocket();
}