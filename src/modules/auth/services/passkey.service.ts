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
import { env } from '../../../config/env.js'
import { getAdminAuth, getDb } from '../../../config/firebase.js'
import { writeAuditLog } from '../../../shared/audit-log.js'
import {
  alreadyRegistered,
  challengeInvalid,
  configMissing,
  loginFailed,
  passkeyNotFound,
  profileNotFound,
  registrationFailed,
} from '../auth.errors.js'
import type {
  CredentialRef,
  PasskeyConfig,
  PasskeyLoginVerifyBody,
  PasskeyRecord,
  PasskeyRegisterBody,
  PasskeySummary,
} from '../auth.types.js'
import * as passkeysRepository from '../repositories/passkeys.repository.js'
import * as usersRepository from '../repositories/users.repository.js'
import {
  buildAuthenticationOptionsInput,
  buildExpectedOrigins,
  buildRegistrationOptionsInput,
  challengeFromClientData,
} from '../rules/passkey-options.rules.js'

// RP ID e origens aceitas, tirados das variáveis de ambiente. Sem o RP ID o
// passkey não pode funcionar.
function getPasskeyConfig(): PasskeyConfig {
  if (!env.PASSKEY_RP_ID) throw configMissing('PASSKEY_RP_ID')
  return {
    rpId: env.PASSKEY_RP_ID,
    origins: buildExpectedOrigins(
      env.PASSKEY_RP_ID,
      env.PASSKEY_ANDROID_ORIGINS,
    ),
  }
}

// Passkeys guardados, no formato que as opções do WebAuthn esperam.
function credentialsOf(passkeys: PasskeyRecord[]): CredentialRef[] {
  return passkeys.map(({ id, transports }) =>
    transports ? { id, transports } : { id },
  )
}

// Resumo de um passkey para a tela Meus passkeys: nunca traz a chave.
function toSummary(passkey: PasskeyRecord): PasskeySummary {
  return {
    id: passkey.id,
    deviceName: passkey.deviceName,
    createdAt: passkey.createdAt.toISOString(),
    lastUsedAt: passkey.lastUsedAt?.toISOString() ?? null,
  }
}

// Cria as opções para o celular criar um passkey, no fim do cadastro e em Meus
// passkeys (RF-AUT-04, RF-AUT-10). O desafio fica ligado à conta.
export async function createRegistrationOptions(
  uid: string,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const now = new Date()
  const { rpId } = getPasskeyConfig()

  const [user, passkeys] = await Promise.all([
    usersRepository.findById(uid),
    passkeysRepository.listByUser(uid),
  ])
  if (!user) throw profileNotFound()

  const options = await generateRegistrationOptions(
    buildRegistrationOptionsInput({
      rpId,
      uid,
      matricula: user.matricula,
      ...(user.fullName ? { fullName: user.fullName } : {}),
      existingCredentials: credentialsOf(passkeys),
    }),
  )
  await passkeysRepository.storeChallenge(
    { challenge: options.challenge, purpose: 'registration', uid },
    now,
  )
  return options
}

// Registra o passkey criado pelo celular (POST /auth/passkey/register, RF-AUT-04).
// Não há sessão: o desafio, ligado à conta quando as opções foram feitas, prova
// quem está registrando. O desafio é gasto antes da verificação.
export async function verifyRegistration(
  input: PasskeyRegisterBody,
): Promise<PasskeySummary> {
  const now = new Date()
  const { rpId, origins } = getPasskeyConfig()
  const response = input.response as unknown as RegistrationResponseJSON

  const challenge = challengeFromClientData(response.response.clientDataJSON)
  const owner = challenge
    ? await passkeysRepository.consumeChallenge(challenge, 'registration', now)
    : undefined
  if (!challenge || !owner?.uid) throw challengeInvalid()
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

  await getDb().runTransaction(async (tx) => {
    const user = await usersRepository.findById(uid, tx)
    const existing = await passkeysRepository.findById(credential.id, tx)
    if (user?.role !== 'student' || user.status !== 'active') {
      throw registrationFailed()
    }
    if (existing) throw alreadyRegistered()

    // Só a chave pública é guardada (RNF-SEG-03).
    passkeysRepository.create(tx, credential.id, {
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
      {
        actorUid: uid,
        actorRole: 'student',
        action: 'passkey_create',
        targetUid: uid,
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

// Cria o desafio do login com passkey (POST /auth/passkey/login/options,
// RF-AUT-05). Matrícula sem passkey, de bibliotecário ou sem conta recebe opções
// sem credenciais e nada é guardado, então a resposta não diz qual é o caso.
export async function createLoginOptions(
  matricula: string,
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const now = new Date()
  const { rpId } = getPasskeyConfig()

  const account = await usersRepository.findByMatricula(matricula)
  const passkeys =
    account?.role === 'student'
      ? await passkeysRepository.listByUser(account.uid)
      : []

  const options = await generateAuthenticationOptions(
    buildAuthenticationOptionsInput({
      rpId,
      credentials: credentialsOf(passkeys),
    }),
  )
  if (account && passkeys.length > 0) {
    await passkeysRepository.storeChallenge(
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

// Confere a assinatura do passkey e devolve o custom token do Firebase
// (POST /auth/passkey/login/verify, RF-AUT-05). Toda falha tem a mesma resposta
// 401, para não dizer qual parte estava errada.
export async function verifyLogin(input: PasskeyLoginVerifyBody) {
  const now = new Date()
  const { rpId, origins } = getPasskeyConfig()
  const response = input.response as unknown as AuthenticationResponseJSON

  const challenge = challengeFromClientData(response.response.clientDataJSON)
  const owner = challenge
    ? await passkeysRepository.consumeChallenge(
        challenge,
        'authentication',
        now,
      )
    : undefined
  if (!challenge || !owner?.uid) throw loginFailed()
  const uid = owner.uid

  const [passkey, user] = await Promise.all([
    passkeysRepository.findById(response.id),
    usersRepository.findById(uid),
  ])
  if (!passkey || passkey.uid !== uid) throw loginFailed()
  if (user?.role !== 'student' || user.status !== 'active') throw loginFailed()

  const verified = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: origins,
    expectedRPID: rpId,
    requireUserVerification: true,
    credential: {
      id: passkey.id,
      publicKey: Buffer.from(passkey.publicKey, 'base64url'),
      counter: passkey.signCount,
      ...(passkey.transports ? { transports: passkey.transports } : {}),
    },
  }).catch(() => undefined)
  if (!verified?.verified) throw loginFailed()

  await getDb().runTransaction(async (tx) => {
    passkeysRepository.recordUse(
      tx,
      passkey.id,
      verified.authenticationInfo.newCounter,
      now,
    )
    usersRepository.recordLogin(tx, uid, now)
    return Promise.resolve()
  })

  // Precisa do papel Service Account Token Creator no Cloud Run (docs/infra.md).
  return { customToken: await getAdminAuth().createCustomToken(uid) }
}

// Lista os aparelhos com passkey do aluno, nunca a chave (GET /auth/passkeys,
// RF-AUT-10).
export async function listPasskeys(
  uid: string,
): Promise<{ passkeys: PasskeySummary[] }> {
  const passkeys = await passkeysRepository.listByUser(uid)
  return { passkeys: passkeys.map(toSummary) }
}

// Remove um passkey do aluno (DELETE /auth/passkeys/:id, RF-AUT-10). O passkey
// de outra pessoa é tratado como inexistente.
export async function removePasskey(
  uid: string,
  credentialId: string,
): Promise<void> {
  const now = new Date()
  await getDb().runTransaction(async (tx) => {
    const passkey = await passkeysRepository.findById(credentialId, tx)
    if (!passkey || passkey.uid !== uid) throw passkeyNotFound()

    passkeysRepository.remove(tx, credentialId)
    writeAuditLog(
      tx,
      {
        actorUid: uid,
        actorRole: 'student',
        action: 'passkey_remove',
        targetUid: uid,
        entityId: credentialId,
      },
      now,
    )
  })
}
