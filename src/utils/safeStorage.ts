import { GameSequenceItem } from '../types';

/**
 * Strips large heavy assets like base64 images from a GameSequenceItem
 * so it can be stored cleanly in localStorage without consuming excessive quota.
 */
export function sanitizeItemForStorage(item: GameSequenceItem): GameSequenceItem {
  if (!item) return item;
  const clone = { ...item };
  // Strip base64 image from local cache to prevent QuotaExceededError
  if (clone.cageSnapshotImage) {
    delete clone.cageSnapshotImage;
  }
  return clone;
}

/**
 * Sanitizes a list of GameSequenceItem objects for lightweight local storage
 */
export function sanitizeSequenceForStorage(items: GameSequenceItem[]): GameSequenceItem[] {
  if (!Array.isArray(items)) return [];
  return items.map(sanitizeItemForStorage);
}

/**
 * Emergency quota cleaner: Cleans large base64 strings and redundant data from localStorage
 */
export function cleanupLocalStorageForQuota(): void {
  if (typeof window === 'undefined') return;

  try {
    // 1. Clean cageSnapshotImage from saved games gallery
    const galleryRaw = localStorage.getItem('bingo_saved_games_gallery');
    if (galleryRaw) {
      try {
        const parsed: GameSequenceItem[] = JSON.parse(galleryRaw);
        if (Array.isArray(parsed)) {
          // Keep base64 image only for the single most recent game; strip from all older ones
          const cleaned = parsed.slice(0, 50).map((g, idx) => {
            if (idx > 0 && g.cageSnapshotImage) {
              const copy = { ...g };
              delete copy.cageSnapshotImage;
              return copy;
            }
            return g;
          });
          try {
            localStorage.setItem('bingo_saved_games_gallery', JSON.stringify(cleaned));
          } catch {
            // If still too large, strip all cageSnapshotImages
            const noImages = cleaned.map((g) => {
              if (g.cageSnapshotImage) {
                const c = { ...g };
                delete c.cageSnapshotImage;
                return c;
              }
              return g;
            });
            try {
              localStorage.setItem('bingo_saved_games_gallery', JSON.stringify(noImages.slice(0, 30)));
            } catch {}
          }
        }
      } catch {}
    }

    // 2. Clean cageSnapshotImage from sequence histories (they never need images!)
    const seq75Raw = localStorage.getItem('bingo_game_sequence_history');
    if (seq75Raw) {
      try {
        const parsed: GameSequenceItem[] = JSON.parse(seq75Raw);
        if (Array.isArray(parsed)) {
          const cleaned = sanitizeSequenceForStorage(parsed);
          try {
            localStorage.setItem('bingo_game_sequence_history', JSON.stringify(cleaned.slice(0, 40)));
          } catch {}
        }
      } catch {}
    }

    const seq90Raw = localStorage.getItem('bingo_90_game_sequence_history');
    if (seq90Raw) {
      try {
        const parsed: GameSequenceItem[] = JSON.parse(seq90Raw);
        if (Array.isArray(parsed)) {
          const cleaned = sanitizeSequenceForStorage(parsed);
          try {
            localStorage.setItem('bingo_90_game_sequence_history', JSON.stringify(cleaned.slice(0, 40)));
          } catch {}
        }
      } catch {}
    }

    // 3. Remove obsolete legacy keys
    const legacyKeys = [
      'bingo_game_sequence',
      'bingo_history',
      'bingo_previous_sheet_75_archive',
      'bingo_previous_sheet_90_archive',
      'bingo_sheet_cell_font_scale',
    ];
    legacyKeys.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });
  } catch (err) {
    console.warn('cleanupLocalStorageForQuota encountered an error:', err);
  }
}

/**
 * Safe wrapper for localStorage.setItem that catches QuotaExceededError,
 * cleans up unnecessary local data, strips heavy base64 images if needed,
 * and gracefully prevents application crashes.
 */
export function safeSetItem(key: string, value: string): boolean {
  if (typeof window === 'undefined') return false;

  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e: any) {
    const isQuotaError =
      e &&
      (e.name === 'QuotaExceededError' ||
        e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        e.code === 22 ||
        e.code === 1014 ||
        String(e.message || '').toLowerCase().includes('quota'));

    if (isQuotaError) {
      console.warn(`localStorage quota exceeded while saving key "${key}". Running emergency cleanup...`);
      cleanupLocalStorageForQuota();

      // Retry 1: Try setting value directly after cleanup
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (retryErr) {
        // Retry 2: If the value itself is large JSON, try stripping heavy base64 images
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) {
            const sanitized = sanitizeSequenceForStorage(parsed);
            localStorage.setItem(key, JSON.stringify(sanitized.slice(0, 30)));
            return true;
          } else if (typeof parsed === 'object' && parsed !== null) {
            const sanitizedObj = sanitizeItemForStorage(parsed);
            localStorage.setItem(key, JSON.stringify(sanitizedObj));
            return true;
          }
        } catch {
          // Non-JSON or cannot be sanitized further
        }

        // Retry 3: If this is a critical small key (like user session), free non-critical caches
        if (key.includes('user') || key.includes('session')) {
          try {
            localStorage.removeItem('bingo_game_sequence_history');
            localStorage.removeItem('bingo_90_game_sequence_history');
            localStorage.setItem(key, value);
            return true;
          } catch {}
        }

        console.warn(`Could not persist key "${key}" to localStorage even after cleanup:`, retryErr);
        return false;
      }
    }

    console.warn(`Error writing to localStorage for key "${key}":`, e);
    return false;
  }
}
