import type { ActivityLogItem, AppUser } from '../types';
import { collection, doc, limit, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export function subscribeToUsersCentralized(
  onData: (users: AppUser[]) => void,
  onError?: (err: unknown) => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  try {
    const usersRef = collection(db, 'users');
    return onSnapshot(
      usersRef,
      (snapshot) => {
        const users: AppUser[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          users.push({
            id: docSnap.id,
            uid: docSnap.id,
            name: data.name || 'Operador',
            email: data.email || '',
            role: data.role === 'admin' ? 'admin' : 'operator',
            status: data.status === 'suspended' ? 'suspended' : 'active',
            joinedDate: data.joinedDate || '',
            createdAt: data.createdAt,
            lastActive: data.lastActive || 'Reciente',
            gamesPlayed: data.gamesPlayed || 0,
            notes: data.notes || '',
            avatarColor: data.avatarColor || (data.role === 'admin' ? '#f59e0b' : '#10b981'),
            assignedMode: data.assignedMode || (data.role === 'admin' ? 'all' : '75'),
          });
        });
        onData(users);
      },
      (err) => {
        onError?.(err);
      }
    );
  } catch (err) {
    onError?.(err);
    return () => {};
  }
}

export function subscribeToActivityLogsCentralized(
  onData: (logs: ActivityLogItem[], addedChanges: ActivityLogItem[]) => void,
  onError?: (err: unknown) => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  try {
    const activityRef = collection(db, 'activity_logs');
    const q = query(activityRef, orderBy('createdAt', 'desc'), limit(120));
    return onSnapshot(
      q,
      (snapshot) => {
        const addedChanges: ActivityLogItem[] = [];
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            addedChanges.push({
              id: change.doc.id,
              operatorUid: data.operatorUid || '',
              operatorName: data.operatorName || 'Operador',
              operatorEmail: data.operatorEmail || '',
              action: data.action || '',
              actionType: data.actionType || 'draw_ball',
              details: data.details || '',
              timestamp: data.timestamp || new Date().toISOString(),
              mode: data.mode || '75',
            });
          }
        });

        const logs: ActivityLogItem[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          logs.push({
            id: docSnap.id,
            operatorUid: data.operatorUid || '',
            operatorName: data.operatorName || 'Operador',
            operatorEmail: data.operatorEmail || '',
            action: data.action || '',
            actionType: data.actionType || 'draw_ball',
            details: data.details || '',
            timestamp: data.timestamp || new Date().toISOString(),
            mode: data.mode || '75',
          });
        });

        onData(logs, addedChanges);
      },
      (err) => {
        onError?.(err);
      }
    );
  } catch (err) {
    onError?.(err);
    return () => {};
  }
}

export async function updateUserFieldsCentralized(
  userId: string,
  fields: Partial<Pick<AppUser, 'role' | 'status' | 'assignedMode' | 'name' | 'notes'>>,
  sanitizeForFirestore: <T>(value: T) => T
): Promise<void> {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, sanitizeForFirestore(fields));
}
