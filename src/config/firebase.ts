import { getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth, type Auth } from 'firebase-admin/auth'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { env } from './env.js'

// Devolve o app do Firebase Admin, criando-o na primeira chamada. Nunca se usa
// arquivo de chave: com FIRESTORE_EMULATOR_HOST e FIREBASE_AUTH_EMULATOR_HOST
// definidas, o Admin SDK fala com o Emulator Suite e não precisa de credenciais;
// no Cloud Run ele usa a conta de serviço do serviço (Application Default
// Credentials).
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

// Devolve o Firestore do projeto.
export function getDb(): Firestore {
  return getFirestore(getFirebaseApp())
}

// Devolve o Firebase Authentication do projeto (Admin SDK).
export function getAdminAuth(): Auth {
  return getAuth(getFirebaseApp())
}
