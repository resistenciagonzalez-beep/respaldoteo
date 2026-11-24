import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  setLogLevel,
  Firestore,
} from 'firebase/firestore';
import configJson from '../firebase-applet-config.json';

// Solo se muestran errores reales de Firebase en la consola (no los mensajes normales de reconexión)
try {
  setLogLevel('error');
} catch (err) {
  console.warn('Could not set Firestore log level:', err);
}

export const firebaseConfig = {
  projectId: configJson.projectId,
  appId: configJson.appId,
  apiKey: configJson.apiKey,
  authDomain: configJson.authDomain,
  firestoreDatabaseId: configJson.firestoreDatabaseId,
  storageBucket: configJson.storageBucket,
  messagingSenderId: configJson.messagingSenderId,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

// Conexión con Firestore: el SDK detecta solo si la red permite la conexión rápida (streaming)
// y, si no, usa la conexión de respaldo (long polling). Antes se forzaba siempre la de respaldo,
// que era necesaria solo dentro de Google AI Studio y hace todo más lento.
let firestoreDb: Firestore;
try {
  firestoreDb = configJson.firestoreDatabaseId
    ? initializeFirestore(
        app,
        {
          experimentalAutoDetectLongPolling: true,
        },
        configJson.firestoreDatabaseId
      )
    : initializeFirestore(app, {
        experimentalAutoDetectLongPolling: true,
      });
} catch (err) {
  console.warn('Firestore already initialized, retrieving existing instance:', err);
  firestoreDb = configJson.firestoreDatabaseId
    ? getFirestore(app, configJson.firestoreDatabaseId)
    : getFirestore(app);
}

export const db = firestoreDb;

export default app;

