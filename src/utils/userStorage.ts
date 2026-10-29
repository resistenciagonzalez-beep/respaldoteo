import { AppUser } from '../types';
import { safeSetItem } from './safeStorage';

export const USERS_STORAGE_KEY = 'bingo_master_admin_users';

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


