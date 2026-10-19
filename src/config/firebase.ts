import { getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth, type Auth } from 'firebase-admin/auth'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { env } from './env.js'

// No key file is ever used. With FIRESTORE_EMULATOR_HOST and
// FIREBASE_AUTH_EMULATOR_HOST set, the Admin SDK talks to the Emulator Suite and
// needs no credentials. On Cloud Run it uses the service account of the service
// through Application Default Credentials.
export function getFirebaseApp(): App {
  const [existing] = getApps()
  if (existing) return existing

  if (env.NODE_ENV !== 'production' && !env.FIRESTORE_EMULATOR_HOST) {
    console.warn(
      'FIRESTORE_EMULATOR_HOST is not set: Firebase Admin will use the default Google credentials instead of the emulator.',
    )
  }
  return initializeApp({ projectId: env.GOOGLE_CLOUD_PROJECT })
}

export function getDb(): Firestore {
  return getFirestore(getFirebaseApp())
}

export function getAdminAuth(): Auth {
  return getAuth(getFirebaseApp())
}
