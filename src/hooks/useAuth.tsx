import React, { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext } from 'react';
import {
  User as FirebaseUser,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
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
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { AppUser, ActivityLogItem, BingoMode } from '../types';
import { safeSetItem, safeGetItem, safeRemoveItem, cleanupLocalStorageForQuota } from '../utils/safeStorage';
import { getStoredUsers, saveStoredUsers } from '../utils/userStorage';
import { hashPassword, verifyPassword, sanitizeInput, stripSensitiveUserData } from '../utils/security';
import { getCurrentLocalDateKey } from '../utils/savedGamesStorage';

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

const ADMIN_EMAILS = [
  'admin@bolillerobingo.com',
  'resistenciagonzalez@gmail.com',
  'genesis.vargas0619@gmail.com',
];

export function useAuthProvider(): AuthContextType {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    try {
      const saved = safeGetItem('bingo_current_user_session');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return stripSensitiveUserData(parsed) as AppUser;
        }
      }
    } catch (err) {
      console.warn('Error reading stored user session:', err);
    }
    return null;
  });
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const currentUserRef = useRef<AppUser | null>(currentUser);
  currentUserRef.current = currentUser;

  const currentUserId = currentUser?.id;

  // Real-time Firestore sync with the current user's document
  useEffect(() => {
    // Safety timeout: Never keep the user stuck on the loading splash for more than 1.2 seconds
    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 1200);

    if (!currentUserId) {
      setLoading(false);
      clearTimeout(safetyTimer);
      return;
    }

    const userDocRef = doc(db, 'users', currentUserId);
    const unsubscribeDoc = onSnapshot(
      userDocRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const fallbackUser = currentUserRef.current;
          const updatedUser: AppUser = {
            id: snap.id,
            uid: snap.id,
            name: data.name || fallbackUser?.name || 'Operador',
            email: data.email || fallbackUser?.email || '',
            role: data.role === 'admin' ? 'admin' : 'operator',
            status: data.status === 'suspended' ? 'suspended' : 'active',
            joinedDate: data.joinedDate || fallbackUser?.joinedDate || getCurrentLocalDateKey(),
            createdAt: data.createdAt,
            lastActive: data.lastActive || 'En línea',
            gamesPlayed: data.gamesPlayed || 0,
            notes: data.notes || '',
            avatarColor: data.avatarColor || (data.role === 'admin' ? '#f59e0b' : '#10b981'),
            assignedMode: data.assignedMode || (data.role === 'admin' ? 'all' : '75'),
          };

          if (updatedUser.status === 'suspended') {
            setCurrentUser(null);
            safeRemoveItem('bingo_current_user_session');
            setError('Esta cuenta ha sido suspendida por un administrador.');
          } else {
            const cleanUser = stripSensitiveUserData(updatedUser) as AppUser;
            setCurrentUser(cleanUser);
            safeSetItem('bingo_current_user_session', JSON.stringify(cleanUser));
          }
        }
        setLoading(false);
      },
      (err) => {
        console.warn('Real-time user snapshot listener:', err);
        setLoading(false);
      }
    );

    return () => {
      clearTimeout(safetyTimer);
      unsubscribeDoc();
    };
  }, [currentUserId]);

  // Firebase Auth state listener (registered once on mount)
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser && !currentUserRef.current) {
        try {
          const userRef = doc(db, 'users', fbUser.uid);
          const snap = await getDoc(userRef);
          if (snap.exists()) {
            const data = snap.data();
            const profile: AppUser = {
              id: fbUser.uid,
              uid: fbUser.uid,
              name: data.name || fbUser.displayName || 'Operador',
              email: data.email || fbUser.email || '',
              role: data.role === 'admin' ? 'admin' : 'operator',
              status: data.status === 'suspended' ? 'suspended' : 'active',
              joinedDate: data.joinedDate || getCurrentLocalDateKey(),
              createdAt: data.createdAt,
              lastActive: 'En línea',
              gamesPlayed: data.gamesPlayed || 0,
              notes: data.notes || '',
              avatarColor: data.avatarColor || (data.role === 'admin' ? '#f59e0b' : '#10b981'),
              assignedMode: data.assignedMode || (data.role === 'admin' ? 'all' : '75'),
            };
            if (profile.status !== 'suspended') {
              const cleanProfile = stripSensitiveUserData(profile) as AppUser;
              setCurrentUser(cleanProfile);
              safeSetItem('bingo_current_user_session', JSON.stringify(cleanProfile));
            }
          }
        } catch (e) {
          console.warn('Could not fetch user doc for firebaseUser:', e);
        }
      }
      setLoading(false);
    });

    return () => unsubscribeAuth();
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const logActivity = useCallback(
    async (
      action: string,
      actionType: ActivityLogItem['actionType'],
      details?: string,
      mode?: BingoMode
    ) => {
      // STRICT COST PROTECTION: Never write individual ball extractions to Firestore!
      if (actionType === 'draw_ball') {
        return;
      }

      void (async () => {
        try {
          const operatorUid = currentUser?.id || auth.currentUser?.uid || 'anon';
          const operatorName = sanitizeInput(currentUser?.name || auth.currentUser?.displayName || 'Operador', 60);
          const operatorEmail = sanitizeInput(currentUser?.email || auth.currentUser?.email || '', 100);
          const safeAction = sanitizeInput(action, 80);
          const safeDetails = sanitizeInput(details || '', 500);

          const writeLog = addDoc(collection(db, 'activity_logs'), {
            operatorUid,
            operatorName,
            operatorEmail,
            action: safeAction,
            actionType,
            details: safeDetails,
            timestamp: new Date().toISOString(),
            createdAt: serverTimestamp(),
            mode: mode || '75',
          });
          await Promise.race([
            writeLog,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Activity log timeout')), 4000)),
          ]);
        } catch (e) {
          console.warn('Could not record activity log in Firestore:', e);
        }
      })();
    },
    [currentUser]
  );

  const login = useCallback(
    async (emailOrUsername: string, pass: string) => {
      setError(null);
      cleanupLocalStorageForQuota();
      const rawInput = (emailOrUsername || '').trim();
      const cleanInput = sanitizeInput(rawInput).toLowerCase();

      if (!cleanInput) {
        const msg = 'Por favor ingresa tu correo electrónico o nombre de usuario.';
        setError(msg);
        return { success: false, error: msg };
      }
      if (!pass) {
        const msg = 'Por favor ingresa tu contraseña.';
        setError(msg);
        return { success: false, error: msg };
      }

      // Quick Local Check: Check registered/cached users first to allow instant login
      const localUsers = getStoredUsers();
      for (const u of localUsers) {
        const emailMatch = u.email?.toLowerCase() === cleanInput;
        const nameMatch = u.name?.trim().toLowerCase() === cleanInput;
        if (emailMatch || nameMatch) {
          const isValidPass = await verifyPassword(pass, u.passwordHash || u.password);
          if (isValidPass) {
            if (u.status === 'suspended') {
              const msg = 'Esta cuenta ha sido suspendida. Contacte a un administrador.';
              setError(msg);
              return { success: false, error: msg };
            }
            // Auto-upgrade plaintext to hash if needed
            if (u.password && !u.passwordHash) {
              const newHash = await hashPassword(pass);
              u.passwordHash = newHash;
              delete u.password;
              saveStoredUsers(localUsers);
            }
            const cleanProfile = stripSensitiveUserData({
              ...u,
              lastActive: 'Hoy, hace un momento',
            }) as AppUser;
            setCurrentUser(cleanProfile);
            safeSetItem('bingo_current_user_session', JSON.stringify(cleanProfile));
            return { success: true };
          }
        }
      }

      // Try Firebase Authentication (if input is an email)
      if (cleanInput.includes('@')) {
        try {
          const userCredential = await signInWithEmailAndPassword(auth, cleanInput, pass);
          const uid = userCredential.user.uid;
          const userDocRef = doc(db, 'users', uid);
          let userDoc = await getDoc(userDocRef);
          let data: Record<string, any> | null | undefined = userDoc.exists() ? userDoc.data() : null;

          // If document doesn't exist by uid, check if it was stored by email or custom ID
          if (!data) {
            try {
              const emailSnap = await getDocs(query(collection(db, 'users'), where('email', '==', cleanInput)));
              if (!emailSnap.empty) {
                userDoc = emailSnap.docs[0];
                data = userDoc.data();
              }
            } catch (e) {
              console.warn('Could not query user by email:', e);
            }
          }

          const isEmailAdmin = ADMIN_EMAILS.includes(cleanInput.toLowerCase());
          const assignedRole = (isEmailAdmin || (data && data.role === 'admin')) ? 'admin' : 'operator';

          if (data && data.status === 'suspended') {
            await signOut(auth);
            const msg = 'Esta cuenta ha sido suspendida. Contacte a un administrador.';
            setError(msg);
            return { success: false, error: msg };
          }

          const profile: AppUser = {
            id: userDoc.exists() ? userDoc.id : uid,
            uid,
            name: data?.name || userCredential.user.displayName || (isEmailAdmin ? 'Administrador' : 'Operador'),
            email: cleanInput,
            role: assignedRole,
            status: 'active',
            joinedDate: data?.joinedDate || getCurrentLocalDateKey(),
            createdAt: data?.createdAt || new Date().toISOString(),
            lastActive: 'Hoy, hace un momento',
            gamesPlayed: data?.gamesPlayed || 0,
            notes: data?.notes || (isEmailAdmin ? 'Administrador del sistema' : ''),
            avatarColor: data?.avatarColor || (assignedRole === 'admin' ? '#f59e0b' : '#10b981'),
            assignedMode: data?.assignedMode || (assignedRole === 'admin' ? 'all' : '75'),
          };

          try {
            if (userDoc.exists()) {
              await updateDoc(doc(db, 'users', userDoc.id), {
                lastActive: 'Hoy, hace un momento',
                lastActiveTimestamp: serverTimestamp(),
              });
            } else {
              await setDoc(userDocRef, {
                ...profile,
                createdAtTimestamp: serverTimestamp(),
              });
            }
          } catch (updErr) {
            console.warn('Could not update lastActive timestamp:', updErr);
          }

          const cleanProfile = stripSensitiveUserData(profile) as AppUser;
          setCurrentUser(cleanProfile);
          safeSetItem('bingo_current_user_session', JSON.stringify(cleanProfile));
          saveStoredUsers([...localUsers.filter((u) => u.id !== profile.id), cleanProfile]);
          return { success: true };
        } catch (authErr) {
          // If admin email, try creating account in Firebase Auth if it doesn't exist yet
          const authErrCode = (authErr as AuthErrorLike)?.code;
          if (
            ADMIN_EMAILS.includes(cleanInput) &&
            (authErrCode === 'auth/user-not-found' || authErrCode === 'auth/invalid-credential')
          ) {
            try {
              const newCred = await createUserWithEmailAndPassword(auth, cleanInput, pass);
              const newUid = newCred.user.uid;
              const adminProfile: AppUser = {
                id: newUid,
                uid: newUid,
                name: cleanInput.includes('genesis') ? 'Génesis Vargas' : 'Administrador',
                email: cleanInput,
                role: 'admin',
                status: 'active',
                joinedDate: getCurrentLocalDateKey(),
                createdAt: new Date().toISOString(),
                lastActive: 'En línea',
                gamesPlayed: 0,
                notes: 'Administrador del sistema',
                avatarColor: '#f59e0b',
                assignedMode: 'all',
              };
              await setDoc(doc(db, 'users', newUid), {
                ...adminProfile,
                createdAtTimestamp: serverTimestamp(),
              });
              const cleanProfile = stripSensitiveUserData(adminProfile) as AppUser;
              setCurrentUser(cleanProfile);
              safeSetItem('bingo_current_user_session', JSON.stringify(cleanProfile));
              saveStoredUsers([...localUsers.filter((u) => u.email !== cleanInput), adminProfile]);
              return { success: true };
            } catch {
              // Proceed to Firestore validation fallback
            }
          }
        }
      }

      // Fallback: Validate credentials against Cloud Firestore `users` collection
      try {
        const usersRef = collection(db, 'users');
        const initialSnapshot = cleanInput.includes('@')
          ? await getDocs(query(usersRef, where('email', '==', cleanInput)))
          : await getDocs(query(usersRef, where('name', '==', rawInput)));

        let matchedUserDoc = initialSnapshot.empty ? undefined : initialSnapshot.docs[0];

        if (!matchedUserDoc && !cleanInput.includes('@')) {
          const allDocs = await getDocs(usersRef);
          matchedUserDoc = allDocs.docs.find((d) => {
            const dat = d.data();
            return (
              dat.name?.trim().toLowerCase() === cleanInput ||
              dat.email?.toLowerCase() === cleanInput
            );
          });
        }

        if (matchedUserDoc) {
          const userDoc = matchedUserDoc;
          const data = userDoc.data();

          if (data.status === 'suspended') {
            const msg = 'Esta cuenta ha sido suspendida. Contacte a un administrador.';
            setError(msg);
            return { success: false, error: msg };
          }

          const storedHashOrPass = data.passwordHash || data.password;
          const isPasswordValid = await verifyPassword(pass, storedHashOrPass);

          if (!isPasswordValid) {
            const msg = 'Correo electrónico / usuario o contraseña incorrectos.';
            setError(msg);
            return { success: false, error: msg };
          }

          // Auto-upgrade plaintext in Firestore to secure hash
          if (data.password && !data.passwordHash) {
            try {
              const newHash = await hashPassword(pass);
              await updateDoc(doc(db, 'users', userDoc.id), {
                passwordHash: newHash,
                password: null,
              });
            } catch (upgradeErr) {
              console.warn('Could not update Firestore password hash:', upgradeErr);
            }
          }

          const resolvedEmail = data.email || cleanInput;
          const isEmailAdmin = ADMIN_EMAILS.includes(resolvedEmail.toLowerCase());
          const assignedRole = (isEmailAdmin || data.role === 'admin') ? 'admin' : 'operator';

          const profile: AppUser = {
            id: userDoc.id,
            uid: userDoc.id,
            name: data.name || (isEmailAdmin ? 'Administrador' : 'Operador'),
            email: resolvedEmail,
            role: assignedRole,
            status: 'active',
            joinedDate: data.joinedDate || getCurrentLocalDateKey(),
            createdAt: data.createdAt,
            lastActive: 'Hoy, hace un momento',
            gamesPlayed: data.gamesPlayed || 0,
            notes: data.notes || (assignedRole === 'admin' ? 'Administrador del sistema' : ''),
            avatarColor: data.avatarColor || (assignedRole === 'admin' ? '#f59e0b' : '#10b981'),
            assignedMode: data.assignedMode || (assignedRole === 'admin' ? 'all' : '75'),
          };

          try {
            await updateDoc(doc(db, 'users', userDoc.id), {
              role: assignedRole,
              lastActive: 'Hoy, hace un momento',
              lastActiveTimestamp: serverTimestamp(),
            });
          } catch (updErr) {
            console.warn('Could not update user lastActive in Firestore:', updErr);
          }

          const cleanProfile = stripSensitiveUserData(profile) as AppUser;
          setCurrentUser(cleanProfile);
          safeSetItem('bingo_current_user_session', JSON.stringify(cleanProfile));
          saveStoredUsers([...localUsers.filter((u) => u.id !== profile.id), cleanProfile]);
          return { success: true };
        }

        // Initial First-Time Provisioning for designated admin email (if no record exists anywhere yet)
        if (ADMIN_EMAILS.includes(cleanInput)) {
          const userAlreadyStored = localUsers.some((u) => u.email?.toLowerCase() === cleanInput);
          if (!userAlreadyStored) {
            const newAdminDocId = `admin_${cleanInput.replace(/[^a-zA-Z0-9]/g, '_')}`;
            const hashedPassword = await hashPassword(pass);
            const adminProfile: AppUser = {
              id: newAdminDocId,
              uid: newAdminDocId,
              name: cleanInput.includes('genesis') ? 'Génesis Vargas' : 'Administrador',
              email: cleanInput,
              passwordHash: hashedPassword,
              role: 'admin',
              status: 'active',
              joinedDate: getCurrentLocalDateKey(),
              createdAt: new Date().toISOString(),
              lastActive: 'En línea',
              gamesPlayed: 0,
              notes: 'Administrador del sistema',
              avatarColor: '#f59e0b',
              assignedMode: 'all',
            };
            try {
              await setDoc(doc(db, 'users', newAdminDocId), {
                ...adminProfile,
                createdAtTimestamp: serverTimestamp(),
              });
            } catch (setAdminErr) {
              console.warn('Could not persist initial admin doc to Firestore:', setAdminErr);
            }
            const cleanProfile = stripSensitiveUserData(adminProfile) as AppUser;
            setCurrentUser(cleanProfile);
            safeSetItem('bingo_current_user_session', JSON.stringify(cleanProfile));
            saveStoredUsers([...localUsers.filter((u) => u.email !== cleanInput), adminProfile]);
            return { success: true };
          }
        }

        const msg = 'Usuario o contraseña incorrectos.';
        setError(msg);
        return { success: false, error: msg };
      } catch (err: unknown) {
        const errObj = err as AuthErrorLike | null;
        console.error('Login error:', err);
        cleanupLocalStorageForQuota();

        // Local emergency fallback if network is down
        for (const u of localUsers) {
          if (u.email?.toLowerCase() === cleanInput || u.name?.trim().toLowerCase() === cleanInput) {
            const isValid = await verifyPassword(pass, u.passwordHash || u.password);
            if (isValid) {
              const cleanProfile = stripSensitiveUserData({
                ...u,
                lastActive: 'Hoy, en sesión local',
              }) as AppUser;
              setCurrentUser(cleanProfile);
              safeSetItem('bingo_current_user_session', JSON.stringify(cleanProfile));
              return { success: true };
            }
          }
        }

        let msg = errObj?.message || 'Error al conectar con el servidor.';
        if (
          errObj?.name === 'QuotaExceededError' ||
          errObj?.code === 22 ||
          errObj?.code === 1014 ||
          String(errObj?.message || '').toLowerCase().includes('quota')
        ) {
          msg = 'El almacenamiento del navegador estaba saturado. Se ha liberado espacio automáticamente; por favor intenta presionar Iniciar Sesión de nuevo.';
        } else if (errObj?.code === 'auth/too-many-requests') {
          msg = 'Demasiados intentos fallidos seguidos. Por seguridad, la cuenta está en espera temporal. Intenta de nuevo en unos momentos.';
        } else if (errObj?.code === 'resource-exhausted' || String(errObj?.message || '').includes('RESOURCE_EXHAUSTED')) {
          msg = 'Límite temporal de consultas del servidor alcanzado. Espera unos instantes e inténtalo nuevamente.';
        } else if (String(errObj?.message || '').includes('billing') || String(errObj?.message || '').includes('closed') || String(errObj?.message || '').includes('PERMISSION_DENIED')) {
          msg = 'Comprueba tu conexión a la red o credenciales de acceso.';
        }
        setError(msg);
        return { success: false, error: msg };
      }
    },
    []
  );

  const register = useCallback(
    async (name: string, email: string, pass: string, assignedMode: '75' | '90' = '75') => {
      setError(null);
      const cleanName = sanitizeInput(name, 50);
      const cleanEmail = sanitizeInput(email, 100).toLowerCase();

      if (!cleanName) {
        const msg = 'Por favor ingresa tu nombre de usuario.';
        setError(msg);
        return { success: false, error: msg };
      }
      if (!cleanEmail || !cleanEmail.includes('@')) {
        const msg = 'Por favor ingresa un correo electrónico válido.';
        setError(msg);
        return { success: false, error: msg };
      }
      if (pass.length < 6) {
        const msg = 'La contraseña debe tener al menos 6 caracteres.';
        setError(msg);
        return { success: false, error: msg };
      }

      const isInitialAdmin = ADMIN_EMAILS.includes(cleanEmail);
      let userUid = '';
      const hashedPassword = await hashPassword(pass);

      // 1. Try Firebase Authentication (if enabled)
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
        const user = userCredential.user;
        await updateProfile(user, { displayName: cleanName });
        userUid = user.uid;
      } catch (authErr: unknown) {
        const errObj = authErr as AuthErrorLike | null;

        if (errObj?.code === 'auth/email-already-in-use') {
          const msg = 'Ya existe una cuenta registrada con este correo electrónico.';
          setError(msg);
          return { success: false, error: msg };
        }

        userUid = `user_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now().toString(36)}`;
      }

      // 2. Check if user already exists in Firestore `users` collection
      try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', cleanEmail));
        const existingDocs = await getDocs(q);

        if (!existingDocs.empty) {
          const msg = 'Ya existe una cuenta registrada con este correo electrónico.';
          setError(msg);
          return { success: false, error: msg };
        }

        // 3. Register user profile in Cloud Firestore
        // Role is strictly 'operator' unless in designated ADMIN_EMAILS list
        const chosenMode: '75' | '90' | 'all' = isInitialAdmin ? 'all' : (assignedMode === '90' ? '90' : '75');

        const userRecord: AppUser = {
          id: userUid,
          uid: userUid,
          name: cleanName,
          email: cleanEmail,
          passwordHash: hashedPassword,
          role: isInitialAdmin ? 'admin' : 'operator',
          assignedMode: chosenMode,
          status: 'active',
          joinedDate: getCurrentLocalDateKey(),
          createdAt: new Date().toISOString(),
          lastActive: 'Recién registrado',
          gamesPlayed: 0,
          notes: isInitialAdmin ? 'Administrador del sistema' : `Operador de Bingo ${chosenMode} Bolas`,
          avatarColor: isInitialAdmin ? '#f59e0b' : '#10b981',
        };

        try {
          await setDoc(doc(db, 'users', userUid), {
            ...userRecord,
            createdAtTimestamp: serverTimestamp(),
          });
        } catch (fsSaveErr) {
          console.warn('Firestore setDoc user warning (saved locally):', fsSaveErr);
        }

        // Always persist locally in user list and active session without exposing plaintext
        const currentStored = getStoredUsers();
        saveStoredUsers([...currentStored.filter((u) => u.email !== cleanEmail && u.id !== userUid), userRecord]);

        const sessionUser = stripSensitiveUserData(userRecord) as AppUser;
        setCurrentUser(sessionUser);
        safeSetItem('bingo_current_user_session', JSON.stringify(sessionUser));

        await logActivity(
          'Nuevo registro de operador',
          'register',
          `El usuario "${cleanName}" (${cleanEmail}) se registró con rol de Operador.`
        );

        return { success: true };
      } catch (err: unknown) {
        const errObj = err as AuthErrorLike | null;
        console.error('User register error:', err);
        cleanupLocalStorageForQuota();
        let msg = errObj?.message || 'Error al completar el registro.';
        if (
          errObj?.name === 'QuotaExceededError' ||
          errObj?.code === 22 ||
          errObj?.code === 1014 ||
          String(errObj?.message || '').toLowerCase().includes('quota')
        ) {
          msg = 'El almacenamiento del navegador estaba lleno. Se ha liberado espacio automáticamente; por favor intenta de nuevo.';
        } else if (errObj?.code === 'auth/email-already-in-use') {
          msg = 'Este correo electrónico ya está registrado. Por favor selecciona Iniciar Sesión.';
        }
        setError(msg);
        return { success: false, error: msg };
      }
    },
    [logActivity]
  );

  const logout = useCallback(async () => {
    try {
      if (currentUser) {
        await logActivity('Cierre de sesión', 'login', `Operador ${currentUser.name} cerró sesión`);
      }
      try {
        await signOut(auth);
      } catch (signOutErr) {
        console.warn('Firebase signOut notice:', signOutErr);
      }
      setCurrentUser(null);
      safeRemoveItem('bingo_current_user_session');
    } catch (e) {
      console.error('Logout error:', e);
    }
  }, [currentUser, logActivity]);

  const isAdmin = currentUser?.role === 'admin';
  const isOperator = currentUser?.role === 'operator';

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
    [
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
    ]
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
