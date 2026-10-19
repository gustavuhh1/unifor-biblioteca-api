import { env } from '../../../config/env.js'
import { getAdminAuth, getDb } from '../../../config/firebase.js'
import type { FieldError } from '../../../shared/errors.js'
import { buildUserDocument } from '../../../shared/domain/user.js'
import {
  EMAIL_TAKEN,
  MATRICULA_TAKEN,
  RESEND_COOLDOWN_SECONDS,
  TOKEN_PURPOSE,
} from '../auth.constants.js'
import {
  configMissing,
  conflictError,
  signupNotFound,
  tokenError,
} from '../auth.errors.js'
import type { SignupConfirmBody, SignupStartBody } from '../auth.types.js'
import { sendTokenEmail } from '../mail/mailer.js'
import * as emailTokensRepository from '../repositories/email-tokens.repository.js'
import * as usersRepository from '../repositories/users.repository.js'
import { createTokenSecret } from '../rules/email-token.rules.js'
import {
  assertCanSendToken,
  verifyTokenAndRecordAttempt,
} from './email-token.service.js'
import { createRegistrationOptions } from './passkey.service.js'

const PURPOSE = TOKEN_PURPOSE.emailConfirmation

// Resposta de quem tem um cadastro aguardando confirmação: o app usa o tempo
// para o contador "Reenviar em".
const signupPending = () => ({
  status: 'pending_email' as const,
  resendAvailableInSeconds: RESEND_COOLDOWN_SECONDS,
})

// E-mail interno da conta no Firebase: <matrícula>@AUTH_EMAIL_DOMAIN. Ele nunca
// recebe mensagens.
function authEmailOf(matricula: string): string {
  if (!env.AUTH_EMAIL_DOMAIN) throw configMissing('AUTH_EMAIL_DOMAIN')
  return `${matricula}@${env.AUTH_EMAIL_DOMAIN}`
}

// Inicia o cadastro do aluno (RF-AUT-01). Primeiro os documentos, numa
// transação que também garante matrícula e e-mail únicos; depois a conta
// desativada no Firebase; o e-mail do token vai por último. Repetir o cadastro de
// uma matrícula ainda pendente troca o e-mail e a senha (RF-AUT-03).
export async function startSignup(input: SignupStartBody) {
  const db = getDb()
  const now = new Date()
  const settings = await emailTokensRepository.readTokenSettings()
  const secret = createTokenSecret()
  const authEmail = authEmailOf(input.matricula)
  const newUid = usersRepository.newUid()

  const outcome = await db.runTransaction(async (tx) => {
    const owners = await usersRepository.findIndexOwners(
      tx,
      input.matricula,
      input.email,
    )
    const pending = await usersRepository.findPendingByMatricula(
      tx,
      input.matricula,
    )

    const conflicts: FieldError[] = []
    if (owners.matriculaOwnerUid !== undefined && !pending) {
      conflicts.push(MATRICULA_TAKEN)
    }
    if (
      owners.emailOwnerUid !== undefined &&
      owners.emailOwnerUid !== pending?.uid
    ) {
      conflicts.push(EMAIL_TAKEN)
    }
    if (conflicts.length > 0) throw conflictError(conflicts)

    const uid = pending?.uid ?? newUid
    const previous = pending
      ? await emailTokensRepository.findRecent(tx, uid, PURPOSE)
      : []
    assertCanSendToken(previous, now)

    if (pending) {
      usersRepository.replacePendingEmail(
        tx,
        { uid, oldEmail: pending.email, newEmail: input.email },
        now,
      )
    } else {
      // O nome não vem no cadastro: o aluno o informa depois, no Perfil
      // (decidido em 19/10).
      usersRepository.createPendingStudent(
        tx,
        uid,
        buildUserDocument({
          role: 'student',
          matricula: input.matricula,
          email: input.email,
          authEmail,
          status: 'pending_email',
          createdAt: now,
        }),
        now,
      )
    }

    const tokenId = emailTokensRepository.issue(
      tx,
      {
        uid,
        purpose: PURPOSE,
        sentTo: input.email,
        secret,
        settings,
        previous,
      },
      now,
    )
    return { uid, tokenId, created: !pending }
  })

  const auth = getAdminAuth()
  if (outcome.created) {
    try {
      await auth.createUser({
        uid: outcome.uid,
        email: authEmail,
        password: input.password,
        disabled: true,
      })
    } catch (error) {
      await undoSignup(input, outcome)
      throw error
    }
  } else {
    await auth.updateUser(outcome.uid, { password: input.password })
  }

  await sendTokenEmail({
    to: input.email,
    purpose: PURPOSE,
    code: secret.code,
    ttlMinutes: settings.ttlMinutes,
  })
  return signupPending()
}

// Desfaz o que a transação do cadastro criou quando a conta do Firebase não pôde
// ser criada.
async function undoSignup(
  input: SignupStartBody,
  created: { uid: string; tokenId: string },
): Promise<void> {
  try {
    await getDb().runTransaction(async (tx) => {
      usersRepository.deletePendingStudent(tx, {
        uid: created.uid,
        matricula: input.matricula,
        email: input.email,
      })
      emailTokensRepository.remove(tx, created.tokenId)
      return Promise.resolve()
    })
  } catch (error) {
    console.error('Não foi possível desfazer um cadastro que falhou:', error)
  }
}

// Reenvia o token de confirmação de um cadastro ainda pendente (RF-AUT-03). O
// token anterior deixa de valer e há uma espera de 60 segundos entre envios.
export async function resendSignupToken(matricula: string) {
  const db = getDb()
  const now = new Date()
  const settings = await emailTokensRepository.readTokenSettings()
  const secret = createTokenSecret()

  const sentTo = await db.runTransaction(async (tx) => {
    const pending = await usersRepository.findPendingByMatricula(tx, matricula)
    if (!pending) throw signupNotFound()

    const previous = await emailTokensRepository.findRecent(
      tx,
      pending.uid,
      PURPOSE,
    )
    assertCanSendToken(previous, now)

    emailTokensRepository.issue(
      tx,
      {
        uid: pending.uid,
        purpose: PURPOSE,
        sentTo: pending.email,
        secret,
        settings,
        previous,
      },
      now,
    )
    return pending.email
  })

  await sendTokenEmail({
    to: sentTo,
    purpose: PURPOSE,
    code: secret.code,
    ttlMinutes: settings.ttlMinutes,
  })
  return signupPending()
}

// Confirma o e-mail com o token e ativa a conta (RF-AUT-03, RF-AUT-04). Confere
// o token (um código errado conta uma tentativa), habilita a conta no Firebase e
// só então consome o token e ativa o usuário; assim uma falha no meio deixa o
// token ainda utilizável. Devolve as opções para criar o passkey.
export async function confirmSignup(input: SignupConfirmBody) {
  const db = getDb()
  const now = new Date()
  const settings = await emailTokensRepository.readTokenSettings()
  const options = { now, maxAttempts: settings.maxAttempts }

  const checked = await db.runTransaction(async (tx) => {
    const account = await usersRepository.findByMatricula(input.matricula, tx)
    // Mesma resposta de um token antigo: não diz que a matrícula é desconhecida.
    if (!account || account.status !== 'pending_email') {
      throw tokenError({ result: 'expired_or_used' })
    }
    const recent = await emailTokensRepository.findRecent(
      tx,
      account.uid,
      PURPOSE,
    )
    const check = verifyTokenAndRecordAttempt(tx, recent, input.token, {
      ...options,
      consume: false,
    })
    return { uid: account.uid, check }
  })
  // O erro sai depois da transação, para a tentativa errada continuar contada.
  if (checked.check.result !== 'valid') throw tokenError(checked.check)
  const { uid } = checked

  await getAdminAuth().updateUser(uid, { disabled: false })

  await db.runTransaction(async (tx) => {
    const recent = await emailTokensRepository.findRecent(tx, uid, PURPOSE)
    const check = verifyTokenAndRecordAttempt(tx, recent, input.token, {
      ...options,
      consume: true,
    })
    if (check.result !== 'valid') throw tokenError(check)
    usersRepository.activate(tx, uid, now)
  })

  return { passkeyOptions: await createRegistrationOptions(uid) }
}
