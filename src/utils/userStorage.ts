import { AppUser } from '../types';
import { safeSetItem } from './safeStorage';
import { stripSensitiveUserData, verifyPassword } from './security';

export const USERS_STORAGE_KEY = 'bingo_master_admin_users';
export const CURRENT_USER_STORAGE_KEY = 'bingo_current_user_session';

export const DEFAULT_USERS: AppUser[] = [];

export function getStoredUsers(): AppUser[] {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (raw) {
      const parsed: AppUser[] = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Error reading users from storage:', err);
  }
  return [];
}

export function saveStoredUsers(users: AppUser[]): void {
  try {
    safeSetItem(USERS_STORAGE_KEY, JSON.stringify(users));
  } catch (err) {
    console.error('Error saving users to storage:', err);
  }
}

export function getCurrentUser(): AppUser | null {
  try {
    const raw = localStorage.getItem(CURRENT_USER_STORAGE_KEY);
    if (raw) {
      const parsed: AppUser = JSON.parse(raw);
      if (parsed && parsed.id) {
        const allUsers = getStoredUsers();
        const found = allUsers.find((u) => u.id === parsed.id);
        const resolved = found || parsed;
        return stripSensitiveUserData(resolved) as AppUser;
      }
    }
  } catch (err) {
    console.error('Error reading current user:', err);
  }
  return null;
}

export function setCurrentUser(user: AppUser | null): void {
  try {
    if (user) {
      const sanitized = stripSensitiveUserData(user);
      safeSetItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(sanitized));
    } else {
      localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
    }
  } catch (err) {
    console.error('Error saving current user:', err);
  }
}

export async function authenticateUser(
  emailOrName: string,
  passwordInput: string
): Promise<{ success: boolean; user?: AppUser; error?: string }> {
  const users = getStoredUsers();
  const search = emailOrName.trim().toLowerCase();

  const user = users.find(
    (u) =>
      u.email.toLowerCase() === search ||
      u.name.toLowerCase() === search
  );

  if (!user) {
    return { success: false, error: 'Usuario o correo electrónico no encontrado.' };
  }

  if (user.status === 'suspended') {
    return {
      success: false,
      error: 'Esta cuenta ha sido suspendida. Contacte al administrador.',
    };
  }

  const storedPassOrHash = user.passwordHash || user.password;
  const isMatch = await verifyPassword(passwordInput.trim(), storedPassOrHash);
  if (!isMatch) {
    return { success: false, error: 'Contraseña incorrecta. Inténtalo nuevamente.' };
  }

  const cleanUser = stripSensitiveUserData({
    ...user,
    lastActive: 'Hoy, hace un momento',
  }) as AppUser;

  const updatedList = users.map((u) => (u.id === user.id ? cleanUser : u));
  saveStoredUsers(updatedList);
  setCurrentUser(cleanUser);

  return { success: true, user: cleanUser };
}

