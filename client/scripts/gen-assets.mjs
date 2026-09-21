import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIZE = 1024;
const outDir = resolve(__dirname, '..', 'assets');
mkdirSync(outDir, { recursive: true });

const SLATE_BG = [15, 23, 42]; // #0f172a
const EMERALD = [16, 185, 129]; // #10b981
const WHITE = [248, 250, 252]; // #f8fafc

const CX = SIZE / 2;
const ROUND_RADIUS = 176;
const CIRCLE_R = 216;
const T = 44; // grosor de trazos de la M
const STEM_L = 387;
const STEM_R = 637;
const TOP_Y = 352;
const VAULT_Y = 610;
const BOT_Y = 682;

const segments = [
  [STEM_L, TOP_Y, STEM_L, BOT_Y],
  [STEM_R, TOP_Y, STEM_R, BOT_Y],
  [STEM_L, TOP_Y, CX, VAULT_Y],
  [STEM_R, TOP_Y, CX, VAULT_Y],
];

function distToSeg(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((x - x1) * dx + (y - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  return Math.hypot(x - px, y - py);
}

function inRoundedRect(x, y) {
  const half = SIZE / 2 - ROUND_RADIUS;
  const cx = Math.min(Math.max(x, -half), half);
  const cy = Math.min(Math.max(y, -half), half);
  return Math.hypot(x - cx, y - cy) <= ROUND_RADIUS;
}

function onM(x, y) {
  return segments.some(([x1, y1, x2, y2]) => distToSeg(x, y, x1, y1, x2, y2) <= T);
}

// paint(sx, sy) -> [r,g,b,a]
function paintLogo(sx, sy) {
  if (!inRoundedRect(sx - CX, sy - CX)) return [0, 0, 0, 0];
  const dCircle = Math.hypot(sx - CX, sy - CX);
  let col = SLATE_BG;
  if (dCircle <= CIRCLE_R) col = EMERALD;
  if (dCircle <= CIRCLE_R && onM(sx, sy)) col = WHITE;
  return [...col, 255];
}

function paintForeground(sx, sy) {
  if (onM(sx, sy)) return [...WHITE, 255];
  return [0, 0, 0, 0];
}

function render(paint) {
  const size = SIZE * SIZE * 4;
  const data = Buffer.alloc(size);
  const offsets = [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75],
  ];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (const [ox, oy] of offsets) {
        const [pr, pg, pb, pa] = paint(x + ox, y + oy);
        r += pr; g += pg; b += pb; a += pa;
      }
      const idx = (y * SIZE + x) * 4;
      data[idx] = Math.round(r / 4);
      data[idx + 1] = Math.round(g / 4);
      data[idx + 2] = Math.round(b / 4);
      data[idx + 3] = Math.round(a / 4);
    }
  }

  const crcTable = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c;
  }
  function crc32(buf) {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function chunk(type, payload) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(payload.length);
    const t = Buffer.from(type, 'ascii');
    const body = Buffer.concat([t, payload]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // compression 0, filter 0, interlace 0

  const stride = SIZE * 4;
  const raw = Buffer.alloc((stride + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) {
    raw[y * (stride + 1)] = 0; // filter none
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync(resolve(outDir, 'logo.png'), render(paintLogo));
writeFileSync(resolve(outDir, 'logo-foreground.png'), render(paintForeground));
console.log(`iconos generados en ${outDir}`);