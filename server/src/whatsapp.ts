import fs from 'node:fs';
import path from 'node:path';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  type WASocket,
} from '@whiskeysockets/baileys';
import { dataDir } from './db.js';

const sessionDir = path.join(dataDir, 'wa');

let sock: WASocket | null = null;
let status: 'closed' | 'connecting' | 'open' = 'closed';
let latestQr: string | null = null;
let ownNumber: string | null = null;
let starting = false;

export function isConnected(): boolean {
  return status === 'open' && sock != null;
}

export function getStatus(): { connected: boolean; phone: string | null } {
  return { connected: isConnected(), phone: ownNumber };
}

export function getQr(): string | null {
  return latestQr;
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
    const authPath = path.join(sessionDir, 'creds.json');
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

    let wasOpen = false;

  socket.ev.on('creds.update', saveCreds);

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
      const code = (update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
        ?.output?.statusCode;
      // Si no hay sesión registrada: seguimos en modo pareo y se reinicia el
      // QR mientras el usuario no escanee. Si hay sesión registrada que ya
      // estuvo abierta: reconexión posterior a un corte normal.
      const shouldRetry =
        !registered || (wasOpen && code !== DisconnectReason.loggedOut && code !== DisconnectReason.badSession);
      status = 'closed';
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
    // disables peppered cursors, reconnects silently until open/close
    void socket.ev.flush?.();
  }
  } catch (err) {
    console.error('[whatsapp] error al iniciar socket:', err);
    sock = null;
    status = 'closed';
  } finally {
    starting = false;
  }
}

export async function linkWhatsApp(): Promise<string | null> {
  if (sock && status === 'open') {
    return null;
  }
  if (sock) {
    sock.end(undefined);
    sock = null;
    status = 'closed';
    latestQr = null;
    ownNumber = null;
  }
  // Solo parea limpio si no hay una sesión registrada. Si ya existe una
  // sesión válida, simplemente se reconecta con ella.
  const registered = isRegisteredSession();
  if (!registered) {
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    } catch (err) {
      console.warn('[whatsapp] no se pudo limpiar la sesión:', err);
    }
  }
  await startSocket();
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return latestQr;
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

export async function sendText(toDigits: string, text: string): Promise<void> {
  const s = ensureConnected();
  await s.sendMessage(jidFor(toDigits), { text, linkPreview: null });
}

export async function sendImage(
  toDigits: string,
  caption: string,
  imagePath: string,
): Promise<void> {
  const s = ensureConnected();
  const buf = await fs.promises.readFile(imagePath);
  const ext = path.extname(imagePath).toLowerCase().replace('.', '') || 'png';
  const mimetype = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  await s.sendMessage(jidFor(toDigits), {
    image: buf,
    mimetype,
    caption,
    linkPreview: null,
  });
}

export async function initWhatsApp(): Promise<void> {
  const hasCreds = fs.existsSync(path.join(sessionDir, 'creds.json'));
  if (!hasCreds) return;
  await startSocket();
}