import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

export async function getFirebase() {
  if (app) return { app, auth, db };

  try {
    // We use a dynamic import to check for the config file
    // In this environment, the file might not exist until the user accepts terms
    // @ts-ignore - Config may not exist yet
    const config = await import('../../firebase-applet-config.json').catch(() => null);
    
    if (!config || !config.default) {
      console.warn("Firebase config not found. Database features will be disabled until setup is complete.");
      return { app: null, auth: null, db: null };
    }

    if (!getApps().length) {
      app = initializeApp(config.default);
      auth = getAuth(app);
      db = getFirestore(app, config.default.firestoreDatabaseId);
    } else {
      app = getApps()[0];
      auth = getAuth(app);
      db = getFirestore(app);
    }

    return { app, auth, db };
  } catch (error) {
    console.error("Error initializing Firebase:", error);
    return { app: null, auth: null, db: null };
  }
}
