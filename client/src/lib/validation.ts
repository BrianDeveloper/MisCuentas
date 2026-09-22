/**
 * Utilidades de validación y sanitización compartidas (cliente + servidor).
 * Sin dependencias externas, solo regex y lógica pura.
 */

// Teléfono VZLA: solo móvil (0412/0414/0424/0416/0426 + 7 dígitos)
const VZLA_MOBILE_REGEX = /^0?4(1[246]|2[46])\d{7}$/;

/**
 * Normaliza un teléfono VZLA a formato internacional: 58412XXXXXXX
 * Quita 0 inicial, agrega 58, solo dígitos.
 */
export function normalizeVzlaPhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `58${digits.slice(1)}`;
  if (digits.startsWith('4') && digits.length === 10) return `58${digits}`;
  if (digits.startsWith('1') && digits.length === 11) return digits;
  return digits;
}

/**
 * Valida formato móvil VZLA (acepta con o sin 0 inicial).
 * Ejemplos válidos: 04121234567, 4121234567, 584121234567
 */
export function isValidVzlaPhone(phone: string): boolean {
  const normalized = normalizeVzlaPhone(phone);
  return VZLA_MOBILE_REGEX.test(normalized.replace(/^58/, ''));
}

/**
 * Formatea teléfono para mostrar: +58 412 123 4567
 */
export function formatVzlaPhone(phone: string): string {
  const normalized = normalizeVzlaPhone(phone);
  if (normalized.length === 12 && normalized.startsWith('58')) {
    const rest = normalized.slice(2);
    return `+58 ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}`;
  }
  return phone;
}

// Documento VZLA: Cédula (V/E) o RIF (J/P/G)
// Formatos: V-12345678, V12345678, J-12345678-9, J123456789, E-12345678, P-123456789
const DOCUMENT_REGEX = /^(V|E|J|P|G)-?\d{7,9}-?\d?$/i;

/**
 * Normaliza documento: quita guiones, mayúsculas.
 * Ej: v-12345678 -> V12345678
 */
export function normalizeDocument(doc: string): string {
  return (doc || '').replace(/-/g, '').toUpperCase();
}

/**
 * Valida formato de documento VZLA (solo regex, sin dígito verificador).
 * Acepta: V/E/J/P/G seguido de 7-9 dígitos, opcionalmente con dígito final y guiones.
 */
export function isValidDocument(doc: string): boolean {
  const normalized = normalizeDocument(doc);
  return DOCUMENT_REGEX.test(normalized);
}

/**
 * Formatea documento para mostrar: V-12345678, J-12345678-9
 */
export function formatDocument(doc: string): string {
  const normalized = normalizeDocument(doc);
  const type = normalized[0];
  const rest = normalized.slice(1);
  if (rest.length <= 8) {
    return `${type}-${rest}`;
  }
  return `${type}-${rest.slice(0, -1)}-${rest.slice(-1)}`;
}

/**
 * Normaliza monto: acepta punto o coma, devuelve string con punto y máx 2 decimales.
 * Ej: "100,50" -> "100.50", "100.5" -> "100.50", "100" -> "100"
 */
export function normalizeAmount(value: string): string {
  const normalized = (value || '').replace(',', '.').trim();
  const num = parseFloat(normalized);
  if (isNaN(num)) return '';
  if (num < 0) return '';
  // Redondear a 2 decimales
  return Math.round(num * 100) / 100 === Math.floor(num)
    ? String(num)
    : num.toFixed(2);
}

/**
 * Valida que el monto sea > 0 y tenga máx 2 decimales.
 */
export function isValidAmount(value: string): boolean {
  const normalized = normalizeAmount(value);
  if (!normalized) return false;
  const num = parseFloat(normalized);
  return num > 0;
}

/**
 * Escapa HTML básico para prevenir XSS en URLs/texto renderizado.
 * No es DOMPurify completo, pero cubre casos básicos de inyección en plantillas.
 */
export function sanitizeForUrl(text: string): string {
  return (text || '')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#039;');
}

/**
 * Escapa HTML para renderizado seguro en innerHTML (básico).
 */
export function escapeHtml(text: string): string {
  return (text || '')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#039;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitiza notas: permite saltos de línea, escapa HTML.
 */
export function sanitizeNotes(text: string): string {
  return escapeHtml(text || '');
}

/**
 * Sanitiza texto simple (una línea): recorta, escapa HTML.
 */
export function sanitizeText(text: string): string {
  return escapeHtml((text || '').trim());
}