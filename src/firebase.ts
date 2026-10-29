import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  setLogLevel,
  Firestore,
} from 'firebase/firestore';
import configJson from '../firebase-applet-config.json';

// Silence internal SDK connection retry messages in browser/iframe sandbox
try {
  setLogLevel('silent');
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

// Use initializeFirestore with experimentalForceLongPolling to ensure reliable
// connections in iframe / cloud preview environments without WebChannel streaming issues.
let firestoreDb: Firestore;
try {
  firestoreDb = configJson.firestoreDatabaseId
    ? initializeFirestore(
        app,
        {
          experimentalForceLongPolling: true,
        },
        configJson.firestoreDatabaseId
      )
    : initializeFirestore(app, {
        experimentalForceLongPolling: true,
      });
} catch (err) {
  console.warn('Firestore already initialized, retrieving existing instance:', err);
  firestoreDb = configJson.firestoreDatabaseId
    ? getFirestore(app, configJson.firestoreDatabaseId)
    : getFirestore(app);
}

export const db = firestoreDb;

export default app;

