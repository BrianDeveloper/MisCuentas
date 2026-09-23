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

/**
 * Valida un PIN de acceso: solo dígitos, entre 4 y 6 caracteres.
 * No acepta letras, espacios, guiones ni caracteres especiales.
 */
export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test((pin || '').trim());
}

/**
 * Normaliza un PIN según se teclea: elimina todo lo que no sea dígito
 * y recorta a un máximo de 6 caracteres. Aplica en el onChange del input.
 */
export function normalizePin(pin: string): string {
  return (pin || '').replace(/\D/g, '').slice(0, 6);
}