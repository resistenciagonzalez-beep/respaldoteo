import React, { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext } from 'react';
import {
  User as FirebaseUser,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendEmailVerification,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  onSnapshot,
  deleteField,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { AppUser, ActivityLogItem, BingoMode } from '../types';
import { safeSetItem, safeGetItem, safeRemoveItem, cleanupLocalStorageForQuota } from '../utils/safeStorage';
import { USERS_STORAGE_KEY } from '../utils/userStorage';
import { verifyLegacyPassword, sanitizeInput } from '../utils/security';
import { getCurrentLocalDateKey, setStorageSessionContext } from '../utils/savedGamesStorage';
import { setShiftsSessionContext } from '../utils/shiftsStorage';

interface AuthErrorLike {
  code?: string | number;
  name?: string;
  message?: string;
}

interface AuthContextType {
  currentUser: AppUser | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  isOperator: boolean;
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  register: (name: string, email: string, pass: string, assignedMode?: '75' | '90') => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  logActivity: (action: string, actionType: ActivityLogItem['actionType'], details?: string, mode?: BingoMode) => Promise<void>;
  clearError: () => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);

// Correos que pueden recibir el rango de administrador automáticamente.
// Por seguridad, solo funciona cuando el correo está VERIFICADO en Firebase.
const ADMIN_EMAILS = [
  'resistenciagonzalez@gmail.com',
  'genesis.vargas0619@gmail.com',
  'bingoteteoo@gmail.com',
];

const SESSION_CACHE_KEY = 'bingo_current_user_session';

// Limpieza: versiones anteriores guardaban en el navegador una lista de usuarios con sus contraseñas.
try {
  safeRemoveItem(USERS_STORAGE_KEY);
} catch {
  // ignore
}

type FirestoreData = Record<string, any>;

function normalizeEmail(email?: string | null): string {
  return (email || '').trim().toLowerCase();
}

function buildProfile(uid: string, data: FirestoreData | null | undefined, fbUser: FirebaseUser | null): AppUser {
  const role: 'admin' | 'operator' = data && data.role === 'admin' ? 'admin' : 'operator';
  const email = normalizeEmail((data && data.email) || (fbUser && fbUser.email) || '');
  const mode: '75' | '90' = data && data.assignedMode === '90' ? '90' : '75';
  return {
    id: uid,
    uid,
    name: (data && data.name) || (fbUser && fbUser.displayName) || (email ? email.split('@')[0] : 'Operador'),
    email,
    role,
    status: data && data.status === 'suspended' ? 'suspended' : 'active',
    joinedDate: (data && data.joinedDate) || getCurrentLocalDateKey(),
    createdAt: data ? data.createdAt : undefined,
    lastActive: (data && data.lastActive) || 'En línea',
    gamesPlayed: (data && data.gamesPlayed) || 0,
    notes: (data && data.notes) || '',
    avatarColor: (data && data.avatarColor) || (role === 'admin' ? '#f59e0b' : '#10b981'),
    assignedMode: role === 'admin' ? 'all' : mode,
  };
}

function applySessionContext(user: AppUser | null): void {
  const ctx = user
    ? { uid: user.id, isAdmin: user.role === 'admin', email: user.email, name: user.name }
    : null;
  try {
    setStorageSessionContext(ctx);
  } catch (e) {
    console.warn('Contexto de sesión (partidas):', e);
  }
  try {
    setShiftsSessionContext(ctx);
  } catch (e) {
    console.warn('Contexto de sesión (turnos):', e);
  }
}

function readCachedProfile(uid: string): AppUser | null {
  try {
    const raw = safeGetItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.id === uid) {
      return parsed as AppUser;
    }
  } catch {
    // ignore
  }
  return null;
}

function errorCode(err: unknown): string {
  const e = err as AuthErrorLike | null;
  return String((e && e.code) || '');
}

function friendlyAuthError(err: unknown, fallback: string): string {
  const e = err as AuthErrorLike | null;
  const code = errorCode(err);
  const message = String((e && e.message) || '');
  if (code === 'auth/invalid-email') return 'El correo electrónico no es válido.';
  if (code === 'auth/too-many-requests') return 'Demasiados intentos seguidos. Espera unos minutos e inténtalo de nuevo.';
  if (code === 'auth/network-request-failed') return 'Sin conexión a internet. Revisa tu red e inténtalo de nuevo.';
  if (code === 'auth/operation-not-allowed') {
    return 'El acceso con correo y contraseña está desactivado en Firebase. Un administrador debe activarlo en Firebase > Authentication > Método de acceso > Correo electrónico/contraseña.';
  }
  if (code === 'auth/weak-password') return 'La contraseña debe tener al menos 6 caracteres.';
  if (code === 'auth/user-disabled') return 'Esta cuenta fue desactivada.';
  if (code === 'permission-denied' || message.includes('PERMISSION_DENIED')) {
    return 'No tienes permiso para realizar esta acción.';
  }
  if (e && (e.name === 'QuotaExceededError' || message.toLowerCase().includes('quota'))) {
    cleanupLocalStorageForQuota();
    return 'El almacenamiento del navegador estaba lleno. Se liberó espacio; inténtalo de nuevo.';
  }
  return fallback;
}

const INVALID_CREDENTIAL_CODES = [
  'auth/invalid-credential',
  'auth/user-not-found',
  'auth/wrong-password',
  'auth/invalid-login-credentials',
];

/**
 * Busca una cuenta antigua (creada antes de usar Firebase Authentication) con el mismo correo
 * y verifica que la contraseña escrita coincida con la que tenía guardada.
 */
async function findLegacyAccount(
  email: string,
  uid: string,
  pass: string
): Promise<{ id: string; data: FirestoreData } | null> {
  const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
  for (const d of snap.docs) {
    if (d.id === uid) continue;
    const data = d.data();
    if (data.status === 'deleted') continue;
    const ok = await verifyLegacyPassword(pass, data.passwordHash, data.password);
    if (ok) return { id: d.id, data };
  }
  return null;
}

/**
 * Crea el perfil del usuario en Firestore si todavía no existe.
 * Las cuentas nuevas siempre empiezan como operadoras; el rango de administrador
 * solo lo puede dar otro administrador (o un correo de la lista, ya verificado).
 */
async function ensureProfileDocument(
  fbUser: FirebaseUser,
  opts: { name?: string; assignedMode?: '75' | '90'; legacy?: { id: string; data: FirestoreData } | null } | null
): Promise<void> {
  const ref = doc(db, 'users', fbUser.uid);
  const existing = await getDoc(ref);
  if (existing.exists()) return;

  const legacyData = opts && opts.legacy ? opts.legacy.data : null;
  const fallbackName = normalizeEmail(fbUser.email).split('@')[0] || 'Operador';
  const name = sanitizeInput(
    (opts && opts.name) || (legacyData && legacyData.name) || fbUser.displayName || fallbackName,
    50
  );
  const mode: '75' | '90' =
    (opts && opts.assignedMode) || (legacyData && legacyData.assignedMode === '90' ? '90' : '75');

  const record: FirestoreData = {
    id: fbUser.uid,
    uid: fbUser.uid,
    name,
    email: fbUser.email || '',
    role: 'operator',
    status: 'active',
    assignedMode: mode,
    joinedDate: (legacyData && legacyData.joinedDate) || getCurrentLocalDateKey(),
    createdAt: (legacyData && legacyData.createdAt) || new Date().toISOString(),
    createdAtTimestamp: serverTimestamp(),
    lastActive: 'Hoy, hace un momento',
    gamesPlayed: (legacyData && legacyData.gamesPlayed) || 0,
    notes: (legacyData && legacyData.notes) || 'Operador de Bingo ' + mode + ' Bolas',
    avatarColor: (legacyData && legacyData.avatarColor) || '#10b981',
  };
  if (opts && opts.legacy) {
    record.legacyIds = [opts.legacy.id];
  }
  await setDoc(ref, record);
}

async function writeActivityLog(
  uid: string,
  name: string,
  email: string,
  action: string,
  actionType: ActivityLogItem['actionType'],
  details: string,
  mode?: BingoMode
): Promise<void> {
  if (actionType === 'draw_ball') return;
  try {
    const writeLog = addDoc(collection(db, 'activity_logs'), {
      operatorUid: uid,
      operatorName: sanitizeInput(name || 'Operador', 60),
      operatorEmail: sanitizeInput(email || '', 100),
      action: sanitizeInput(action, 80),
      actionType,
      details: sanitizeInput(details || '', 500),
      timestamp: new Date().toISOString(),
      createdAt: serverTimestamp(),
      mode: mode || '75',
    });
    await Promise.race([
      writeLog,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Activity log timeout')), 4000)),
    ]);
  } catch (e) {
    console.warn('No se pudo registrar la actividad:', e);
  }
}

export function useAuthProvider(): AuthContextType {
  const [currentUser, setCurrentUserState] = useState<AppUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const currentUserRef = useRef<AppUser | null>(null);
  const profileSetupInProgressRef = useRef<boolean>(false);
  const verificationSentRef = useRef<boolean>(false);

  const setCurrentUser = useCallback((user: AppUser | null) => {
    // El contexto se aplica ANTES de actualizar React para que la galería y los turnos
    // carguen solo los datos permitidos para este usuario.
    applySessionContext(user);
    currentUserRef.current = user;
    setCurrentUserState(user);
    if (user) {
      safeSetItem(SESSION_CACHE_KEY, JSON.stringify(user));
    } else {
      safeRemoveItem(SESSION_CACHE_KEY);
    }
  }, []);

  // Sesión de Firebase Authentication + perfil en tiempo real
  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;
    const fallbackTimer = setTimeout(() => setLoading(false), 8000);

    const unsubscribeAuth = onAuthStateChanged(auth, (fbUser) => {
      setFirebaseUser(fbUser);
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (!fbUser) {
        setCurrentUser(null);
        setLoading(false);
        return;
      }

      const userRef = doc(db, 'users', fbUser.uid);
      unsubscribeProfile = onSnapshot(
        userRef,
        (snap) => {
          if (!snap.exists()) {
            // El inicio de sesión o el registro están creando el perfil en este momento
            if (profileSetupInProgressRef.current) return;
            profileSetupInProgressRef.current = true;
            ensureProfileDocument(fbUser, null)
              .catch((e) => {
                console.warn('No se pudo crear el perfil:', e);
                setCurrentUser(readCachedProfile(fbUser.uid) || buildProfile(fbUser.uid, null, fbUser));
                setLoading(false);
              })
              .finally(() => {
                profileSetupInProgressRef.current = false;
              });
            return;
          }

          const data = snap.data();
          if (data.status === 'deleted' || data.status === 'suspended') {
            setError(
              data.status === 'deleted'
                ? 'Esta cuenta fue eliminada por un administrador.'
                : 'Esta cuenta ha sido suspendida por un administrador.'
            );
            signOut(auth).catch(() => {});
            setCurrentUser(null);
            setLoading(false);
            return;
          }

          // Rango de administrador automático SOLO para correos de la lista y verificados
          const email = normalizeEmail(fbUser.email);
          if (ADMIN_EMAILS.includes(email) && data.role !== 'admin') {
            if (fbUser.emailVerified) {
              updateDoc(userRef, { role: 'admin', assignedMode: 'all' }).catch((e) =>
                console.warn('No se pudo asignar el rango de administrador:', e)
              );
            } else if (!verificationSentRef.current) {
              verificationSentRef.current = true;
              sendEmailVerification(fbUser)
                .then(() => {
                  setError(
                    'Te enviamos un correo para confirmar tu cuenta de administradora. Ábrelo, confirma y vuelve a iniciar sesión.'
                  );
                })
                .catch(() => {});
            }
          }

          setCurrentUser(buildProfile(snap.id, data, fbUser));
          setLoading(false);
        },
        (err) => {
          // Sin conexión: se usa el último perfil conocido (los permisos reales los controla el servidor)
          console.warn('Perfil de usuario no disponible por ahora:', err);
          setCurrentUser(readCachedProfile(fbUser.uid) || buildProfile(fbUser.uid, null, fbUser));
          setLoading(false);
        }
      );
    });

    return () => {
      clearTimeout(fallbackTimer);
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, [setCurrentUser]);

  const clearError = useCallback(() => setError(null), []);

  const logActivity = useCallback(
    async (action: string, actionType: ActivityLogItem['actionType'], details?: string, mode?: BingoMode) => {
      const fb = auth.currentUser;
      if (!fb) return;
      const u = currentUserRef.current;
      void writeActivityLog(
        fb.uid,
        (u && u.name) || fb.displayName || 'Operador',
        (u && u.email) || fb.email || '',
        action,
        actionType,
        details || '',
        mode
      );
    },
    []
  );

  const fail = useCallback((msg: string) => {
    setError(msg);
    return { success: false, error: msg };
  }, []);

  const login = useCallback(
    async (emailOrUsername: string, pass: string) => {
      setError(null);
      const email = normalizeEmail(sanitizeInput(emailOrUsername, 120));

      if (!email) return fail('Por favor ingresa tu correo electrónico.');
      if (!email.includes('@')) {
        return fail('Ingresa tu correo electrónico. Por seguridad ya no se puede entrar solo con el nombre de usuario.');
      }
      if (!pass) return fail('Por favor ingresa tu contraseña.');

      profileSetupInProgressRef.current = true;
      try {
        let fbUser: FirebaseUser;
        try {
          const cred = await signInWithEmailAndPassword(auth, email, pass);
          fbUser = cred.user;
        } catch (signInErr) {
          if (!INVALID_CREDENTIAL_CODES.includes(errorCode(signInErr))) {
            return fail(friendlyAuthError(signInErr, 'No se pudo iniciar sesión. Inténtalo de nuevo.'));
          }

          // Puede ser una cuenta antigua (anterior a Firebase Authentication): se migra de forma segura
          let createdUser: FirebaseUser;
          try {
            const created = await createUserWithEmailAndPassword(auth, email, pass);
            createdUser = created.user;
          } catch (createErr) {
            const cc = errorCode(createErr);
            if (cc === 'auth/email-already-in-use' || cc === 'auth/weak-password') {
              return fail('Correo electrónico o contraseña incorrectos.');
            }
            return fail(friendlyAuthError(createErr, 'Correo electrónico o contraseña incorrectos.'));
          }

          let legacy: { id: string; data: FirestoreData } | null = null;
          try {
            legacy = await findLegacyAccount(email, createdUser.uid, pass);
          } catch (lookupErr) {
            console.warn('No se pudo revisar la cuenta antigua:', lookupErr);
          }

          if (!legacy) {
            // No era una cuenta antigua válida: se deshace la cuenta recién creada
            await createdUser.delete().catch(() => signOut(auth).catch(() => {}));
            return fail('Correo electrónico o contraseña incorrectos.');
          }

          await ensureProfileDocument(createdUser, { legacy });
          fbUser = createdUser;
        }

        // Perfil: crear si falta y limpiar contraseñas antiguas guardadas en la base de datos
        const ref = doc(db, 'users', fbUser.uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          let legacy: { id: string; data: FirestoreData } | null = null;
          try {
            legacy = await findLegacyAccount(email, fbUser.uid, pass);
          } catch {
            legacy = null;
          }
          await ensureProfileDocument(fbUser, { legacy });
        } else {
          const data = snap.data();
          if (data.status === 'deleted' || data.status === 'suspended') {
            await signOut(auth).catch(() => {});
            return fail(
              data.status === 'deleted'
                ? 'Esta cuenta fue eliminada por un administrador.'
                : 'Esta cuenta ha sido suspendida. Contacte a un administrador.'
            );
          }
          const patch: FirestoreData = {
            lastActive: 'Hoy, hace un momento',
            lastActiveTimestamp: serverTimestamp(),
          };
          if ('passwordHash' in data) patch.passwordHash = deleteField();
          if ('password' in data) patch.password = deleteField();
          updateDoc(ref, patch).catch((e) => console.warn('No se pudo actualizar la última conexión:', e));
        }

        void writeActivityLog(
          fbUser.uid,
          fbUser.displayName || email.split('@')[0],
          email,
          'Inicio de sesión',
          'login',
          'Inicio de sesión de ' + email
        );
        return { success: true };
      } catch (err) {
        console.error('Login error:', err);
        return fail(friendlyAuthError(err, 'No se pudo iniciar sesión. Inténtalo de nuevo.'));
      } finally {
        profileSetupInProgressRef.current = false;
      }
    },
    [fail]
  );

  const register = useCallback(
    async (name: string, email: string, pass: string, assignedMode: '75' | '90' = '75') => {
      setError(null);
      const cleanName = sanitizeInput(name, 50);
      const cleanEmail = normalizeEmail(sanitizeInput(email, 120));

      if (!cleanName) return fail('Por favor ingresa tu nombre de usuario.');
      if (!cleanEmail || !cleanEmail.includes('@')) return fail('Por favor ingresa un correo electrónico válido.');
      if (!pass || pass.length < 6) return fail('La contraseña debe tener al menos 6 caracteres.');

      profileSetupInProgressRef.current = true;
      try {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
        await updateProfile(cred.user, { displayName: cleanName }).catch(() => {});
        await ensureProfileDocument(cred.user, {
          name: cleanName,
          assignedMode: assignedMode === '90' ? '90' : '75',
        });

        if (ADMIN_EMAILS.includes(cleanEmail) && !verificationSentRef.current) {
          verificationSentRef.current = true;
          sendEmailVerification(cred.user).catch(() => {});
        }

        void writeActivityLog(
          cred.user.uid,
          cleanName,
          cleanEmail,
          'Nuevo registro de operador',
          'register',
          'El usuario "' + cleanName + '" (' + cleanEmail + ') se registró con rol de Operador.'
        );
        return { success: true };
      } catch (err) {
        console.error('User register error:', err);
        if (errorCode(err) === 'auth/email-already-in-use') {
          return fail('Ya existe una cuenta con este correo electrónico. Usa "Iniciar Sesión".');
        }
        return fail(friendlyAuthError(err, 'Error al completar el registro.'));
      } finally {
        profileSetupInProgressRef.current = false;
      }
    },
    [fail]
  );

  const logout = useCallback(async () => {
    const u = currentUserRef.current;
    const fb = auth.currentUser;
    if (u && fb) {
      await writeActivityLog(fb.uid, u.name, u.email, 'Cierre de sesión', 'login', 'Operador ' + u.name + ' cerró sesión');
    }
    try {
      await signOut(auth);
    } catch (signOutErr) {
      console.warn('Firebase signOut notice:', signOutErr);
    }
    setCurrentUser(null);
  }, [setCurrentUser]);

  const isAdmin = Boolean(currentUser && currentUser.role === 'admin');
  const isOperator = Boolean(currentUser && !isAdmin);

  return useMemo(
    () => ({
      currentUser,
      firebaseUser,
      loading,
      error,
      isAdmin,
      isOperator,
      login,
      register,
      logout,
      logActivity,
      clearError,
    }),
    [currentUser, firebaseUser, loading, error, isAdmin, isOperator, login, register, logout, logActivity, clearError]
  );
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const authVal = useAuthProvider();
  return <AuthContext.Provider value={authVal}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
