/**
 * Security & Data Sanitization Utilities
 * Protege contra XSS, inyecciones y filtraciones de credenciales.
 *
 * IMPORTANTE: las contraseñas ya NO se guardan en Firestore ni en el navegador.
 * El inicio de sesión usa exclusivamente Firebase Authentication.
 * Las funciones de hash solo existen para migrar cuentas antiguas una única vez.
 */

const LEGACY_PASSWORD_SALT = 'bingo_bolillero_secure_salt_2026_';

async function computeLegacyHash(password: string): Promise<string> {
  if (!password) return '';
  try {
    if (typeof window !== 'undefined' && window.crypto?.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(LEGACY_PASSWORD_SALT + password);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {
    console.warn('Crypto subtle fallback:', e);
  }

  let hash = 0;
  const str = LEGACY_PASSWORD_SALT + password;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return 'h_' + Math.abs(hash).toString(16);
}

/**
 * Solo para compatibilidad con código antiguo. No se usa para guardar contraseñas nuevas.
 */
export async function hashPassword(password: string): Promise<string> {
  return computeLegacyHash(password);
}

/**
 * Verifica la contraseña de una cuenta ANTIGUA (creada antes de usar Firebase Authentication).
 * - Si la cuenta guardó un hash, SOLO se compara el hash calculado (nunca el texto escrito contra el hash).
 * - Solo si la cuenta antigua guardó la contraseña en texto plano se compara directamente.
 */
export async function verifyLegacyPassword(
  providedPass: string,
  storedHash?: string | null,
  storedPlain?: string | null
): Promise<boolean> {
  if (!providedPass) return false;
  if (typeof storedHash === 'string' && storedHash.length > 0) {
    const computed = await computeLegacyHash(providedPass);
    return computed === storedHash;
  }
  if (typeof storedPlain === 'string' && storedPlain.length > 0) {
    return storedPlain === providedPass;
  }
  return false;
}

/**
 * Compatibilidad: verifica únicamente contra un hash (ya no acepta el hash como contraseña).
 */
export async function verifyPassword(providedPass: string, storedHash?: string): Promise<boolean> {
  return verifyLegacyPassword(providedPass, storedHash, null);
}

/**
 * Sanitizes generic user text input to prevent XSS and HTML injection.
 */
export function sanitizeInput(text?: string | null, maxLength = 200): string {
  if (!text) return '';
  return text
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim()
    .slice(0, maxLength);
}

/**
 * Sanitizes player names entered in sheet builder or cells.
 */
export function sanitizePlayerName(name?: string | null): string {
  if (!name) return '';
  return name
    .replace(/[<>{}\\]/g, '')
    .trim()
    .slice(0, 50);
}

/**
 * Strips password and sensitive credentials from an AppUser object.
 */
export function stripSensitiveUserData<T extends { password?: string; passwordHash?: string }>(user: T): Omit<T, 'password' | 'passwordHash'> {
  const copy = { ...user };
  delete copy.password;
  delete copy.passwordHash;
  return copy;
}
