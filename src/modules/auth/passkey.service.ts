import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import type { Firestore } from 'firebase-admin/firestore'
import { getAdminAuth, getDb } from '../../config/firebase.js'
import { AppError } from '../../shared/errors.js'
import {
  PASSKEYS,
  PASSKEY_CHALLENGES,
  USERS,
  findAccountByMatricula,
  optionalDate,
  plainReader,
  toDate,
  writeAuditLog,
} from './accounts.js'
import type {
  PasskeyLoginVerifyBody,
  PasskeyRegisterBody,
} from './auth.schemas.js'
import { getPasskeyConfig } from './auth-config.js'
import {
  CHALLENGE_TTL_MINUTES,
  buildAuthenticationOptionsInput,
  buildRegistrationOptionsInput,
  challengeFromClientData,
  type CredentialRef,
} from './passkey-options.js'

type ChallengePurpose = 'registration' | 'authentication'

const loginFailed = () =>
  new AppError(
    401,
    'passkey_login_failed',
    'Não foi possível entrar com o passkey. Tente de novo ou use matrícula e senha.',
  )

const registrationFailed = () =>
  new AppError(
    400,
    'passkey_registration_failed',
    'Não foi possível criar o passkey. Tente de novo.',
  )

function credentialsOf(
  docs: { id: string; get(field: string): unknown }[],
): CredentialRef[] {
  return docs.map((doc) => {
    const transports = doc.get('transports') as string[] | undefined
    return transports ? { id: doc.id, transports } : { id: doc.id }
  })
}

async function storeChallenge(
  db: Firestore,
  input: { challenge: string; purpose: ChallengePurpose; uid?: string },
  now: Date,
): Promise<void> {
  await db
    .collection(PASSKEY_CHALLENGES)
    .doc()
    .set({
      challenge: input.challenge,
      purpose: input.purpose,
      ...(input.uid ? { uid: input.uid } : {}),
      expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MINUTES * 60_000),
      createdAt: now,
      updatedAt: now,
    })
}

// A challenge works once. It is spent before the response is checked, so a
// response that fails cannot be tried again with the same challenge.
async function consumeChallenge(
  db: Firestore,
  challenge: string,
  purpose: ChallengePurpose,
  now: Date,
): Promise<{ uid?: string } | undefined> {
  return db.runTransaction(async (tx) => {
    const found = await tx.get(
      db
        .collection(PASSKEY_CHALLENGES)
        .where('challenge', '==', challenge)
        .limit(1),
    )
    const doc = found.docs[0]
    if (
      !doc ||
      doc.get('purpose') !== purpose ||
      doc.get('usedAt') ||
      now >= toDate(doc.get('expiresAt'))
    ) {
      return undefined
    }
    tx.update(doc.ref, { usedAt: now, updatedAt: now })
    const uid = doc.get('uid') as string | undefined
    return uid ? { uid } : {}
  })
}

// Options for creating a passkey on the phone in use: at the end of the
// sign-up and in "Meus passkeys". The challenge belongs to the account.
export async function createRegistrationOptions(
  uid: string,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const db = getDb()
  const now = new Date()
  const { rpId } = getPasskeyConfig()

  const [user, passkeys] = await Promise.all([
    db.collection(USERS).doc(uid).get(),
    db.collection(PASSKEYS).where('uid', '==', uid).get(),
  ])
  const fullName = user.get('fullName') as string | undefined

  const options = await generateRegistrationOptions(
    buildRegistrationOptionsInput({
      rpId,
      uid,
      matricula: user.get('matricula') as string,
      ...(fullName ? { fullName } : {}),
      existingCredentials: credentialsOf(passkeys.docs),
    }),
  )
  await storeChallenge(
    db,
    { challenge: options.challenge, purpose: 'registration', uid },
    now,
  )
  return options
}

// POST /auth/passkey/register. No session: the challenge, tied to the account
// when the options were made, is what proves who is registering.
export async function verifyRegistration(input: PasskeyRegisterBody) {
  const db = getDb()
  const now = new Date()
  const { rpId, origins } = getPasskeyConfig()
  const response = input.response as unknown as RegistrationResponseJSON

  const challenge = challengeFromClientData(response.response.clientDataJSON)
  const owner = challenge
    ? await consumeChallenge(db, challenge, 'registration', now)
    : undefined
  if (!challenge || !owner?.uid) {
    throw new AppError(
      400,
      'passkey_challenge_invalid',
      'O pedido de passkey expirou. Comece de novo.',
    )
  }
  const uid = owner.uid

  const verified = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: origins,
    expectedRPID: rpId,
    requireUserVerification: true,
  }).catch(() => undefined)
  if (!verified?.verified) throw registrationFailed()
  const { credential, aaguid } = verified.registrationInfo

  await db.runTransaction(async (tx) => {
    const userRef = db.collection(USERS).doc(uid)
    const passkeyRef = db.collection(PASSKEYS).doc(credential.id)
    const [user, existing] = await Promise.all([
      tx.get(userRef),
      tx.get(passkeyRef),
    ])
    if (user.get('role') !== 'student' || user.get('status') !== 'active') {
      throw registrationFailed()
    }
    if (existing.exists) {
      throw new AppError(
        409,
        'passkey_already_registered',
        'Este aparelho já tem um passkey desta conta.',
      )
    }
    tx.set(passkeyRef, {
      uid,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      signCount: credential.counter,
      ...(credential.transports ? { transports: credential.transports } : {}),
      deviceName: input.deviceName,
      aaguid,
      createdAt: now,
      updatedAt: now,
    })
    writeAuditLog(
      tx,
      db,
      {
        actorUid: uid,
        actorRole: 'student',
        action: 'passkey_create',
        entityId: credential.id,
      },
      now,
    )
  })

  return {
    id: credential.id,
    deviceName: input.deviceName,
    createdAt: now.toISOString(),
    lastUsedAt: null,
  }
}

// POST /auth/passkey/login/options. A matrícula without passkeys (or without
// account) gets options with no credentials and nothing is stored, so the
// answer does not tell them apart; the phone just finds no passkey.
export async function createLoginOptions(
  matricula: string,
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const db = getDb()
  const now = new Date()
  const { rpId } = getPasskeyConfig()

  const account = await findAccountByMatricula(db, plainReader, matricula)
  const isStudent = account?.user.get('role') === 'student'
  const passkeys =
    account && isStudent
      ? (await db.collection(PASSKEYS).where('uid', '==', account.uid).get())
          .docs
      : []

  const options = await generateAuthenticationOptions(
    buildAuthenticationOptionsInput({
      rpId,
      credentials: credentialsOf(passkeys),
    }),
  )
  if (account && passkeys.length > 0) {
    await storeChallenge(
      db,
      {
        challenge: options.challenge,
        purpose: 'authentication',
        uid: account.uid,
      },
      now,
    )
  }
  return options
}

// POST /auth/passkey/login/verify. Every failure is the same 401, so nothing
// says which part was wrong.
export async function verifyLogin(input: PasskeyLoginVerifyBody) {
  const db = getDb()
  const now = new Date()
  const { rpId, origins } = getPasskeyConfig()
  const response = input.response as unknown as AuthenticationResponseJSON

  const challenge = challengeFromClientData(response.response.clientDataJSON)
  const owner = challenge
    ? await consumeChallenge(db, challenge, 'authentication', now)
    : undefined
  if (!challenge || !owner?.uid) throw loginFailed()
  const uid = owner.uid

  const passkeyRef = db.collection(PASSKEYS).doc(response.id)
  const [passkey, user] = await Promise.all([
    passkeyRef.get(),
    db.collection(USERS).doc(uid).get(),
  ])
  if (!passkey.exists || passkey.get('uid') !== uid) throw loginFailed()
  if (user.get('role') !== 'student' || user.get('status') !== 'active') {
    throw loginFailed()
  }

  const transports = passkey.get('transports') as string[] | undefined
  const verified = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: origins,
    expectedRPID: rpId,
    requireUserVerification: true,
    credential: {
      id: passkey.id,
      publicKey: Buffer.from(passkey.get('publicKey') as string, 'base64url'),
      counter: passkey.get('signCount') as number,
      ...(transports ? { transports } : {}),
    },
  }).catch(() => undefined)
  if (!verified?.verified) throw loginFailed()

  await db.runTransaction(async (tx) => {
    tx.update(passkeyRef, {
      signCount: verified.authenticationInfo.newCounter,
      lastUsedAt: now,
      updatedAt: now,
    })
    tx.update(db.collection(USERS).doc(uid), {
      lastLoginAt: now,
      updatedAt: now,
    })
    return Promise.resolve()
  })

  // Needs the Service Account Token Creator role on Cloud Run (docs/infra.md).
  return { customToken: await getAdminAuth().createCustomToken(uid) }
}

// GET /auth/passkeys: the devices of the account, never the key.
export async function listPasskeys(uid: string) {
  const found = await getDb()
    .collection(PASSKEYS)
    .where('uid', '==', uid)
    .orderBy('createdAt', 'desc')
    .get()
  return {
    passkeys: found.docs.map((doc) => ({
      id: doc.id,
      deviceName: doc.get('deviceName') as string,
      createdAt: toDate(doc.get('createdAt')).toISOString(),
      lastUsedAt: optionalDate(doc.get('lastUsedAt'))?.toISOString() ?? null,
    })),
  }
}

// DELETE /auth/passkeys/:id. A passkey of someone else is "not found".
export async function removePasskey(uid: string, credentialId: string) {
  const db = getDb()
  const now = new Date()
  await db.runTransaction(async (tx) => {
    const ref = db.collection(PASSKEYS).doc(credentialId)
    const passkey = await tx.get(ref)
    if (!passkey.exists || passkey.get('uid') !== uid) {
      throw new AppError(404, 'passkey_not_found', 'Passkey não encontrado.')
    }
    tx.delete(ref)
    writeAuditLog(
      tx,
      db,
      {
        actorUid: uid,
        actorRole: 'student',
        action: 'passkey_remove',
        entityId: credentialId,
      },
      now,
    )
  })
}
