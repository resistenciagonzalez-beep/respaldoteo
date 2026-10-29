/**
 * Security & Data Sanitization Utilities
 * Protects against XSS, injection attacks, credential leaks, and privilege spoofing.
 */

const PASSWORD_SALT = 'bingo_bolillero_secure_salt_2026_';

/**
 * Computes a secure SHA-256 hash of a password with application salt.
 * Ensures plaintext passwords are NEVER stored in Firestore or localStorage.
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password) return '';
  try {
    if (typeof window !== 'undefined' && window.crypto?.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(PASSWORD_SALT + password);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {
    console.warn('Crypto subtle fallback:', e);
  }

  // Fallback simple deterministic hash if crypto.subtle is not supported
  let hash = 0;
  const str = PASSWORD_SALT + password;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `h_${Math.abs(hash).toString(16)}`;
}

/**
 * Verifies a plaintext password against a stored password hash (or legacy plaintext during migration).
 */
export async function verifyPassword(providedPass: string, storedHashOrPass?: string): Promise<boolean> {
  if (!storedHashOrPass || !providedPass) return false;
  // If stored in legacy plaintext format:
  if (storedHashOrPass === providedPass) return true;
  // If stored as hash:
  const computedHash = await hashPassword(providedPass);
  return computedHash === storedHashOrPass;
}

/**
 * Sanitizes generic user text input to prevent XSS and HTML injection.
 * Strips dangerous HTML tags, javascript URLs, and trims to specified length.
 */
export function sanitizeInput(text?: string | null, maxLength = 200): string {
  if (!text) return '';
  return text
    .replace(/[<>]/g, '') // remove HTML angle brackets
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '') // remove inline event handlers like onclick=
    .trim()
    .slice(0, maxLength);
}

/**
 * Sanitizes player names entered in sheet builder or cells.
 * Removes dangerous characters while allowing accents, spaces, and numbers.
 */
export function sanitizePlayerName(name?: string | null): string {
  if (!name) return '';
  return name
    .replace(/[<>{}\\]/g, '')
    .trim()
    .slice(0, 50);
}

/**
 * Strips password and sensitive credentials from an AppUser object
 * before exposing to other components, logs, or exports.
 */
export function stripSensitiveUserData<T extends { password?: string; passwordHash?: string }>(user: T): Omit<T, 'password' | 'passwordHash'> {
  const copy = { ...user };
  delete copy.password;
  delete copy.passwordHash;
  return copy;
}

