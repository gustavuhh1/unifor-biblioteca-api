import { getAdminAuth, getDb } from '../../../config/firebase.js'
import { writeAuditLog } from '../../../shared/audit-log.js'
import {
  AUDIT_ACTION,
  EMAIL_TOKEN_PURPOSE,
  USER_STATUS,
} from '../../../shared/types/index.js'
import { RECOVERY_MESSAGE } from '../auth.constants.js'
import { tokenError } from '../auth.errors.js'
import type { PasswordResetBody } from '../auth.types.js'
import { sendTokenEmail } from '../mail/mailer.js'
import * as emailTokensRepository from '../repositories/email-tokens.repository.js'
import * as usersRepository from '../repositories/users.repository.js'
import {
  createTokenSecret,
  resendWaitSeconds,
} from '../rules/email-token.rules.js'
import { verifyTokenAndRecordAttempt } from './email-token.service.js'

const PURPOSE = EMAIL_TOKEN_PURPOSE.passwordReset

// Pede o token de recuperação de senha pela matrícula (RF-AUT-08), para aluno e
// bibliotecário. A API acha o e-mail da conta por dentro e nunca o devolve. A
// resposta é sempre a mesma, exista a conta ou não, e mesmo dentro dos 60
// segundos desde o último token (nesse caso só não envia outro e-mail).
export async function requestPasswordRecovery(matricula: string) {
  const db = getDb()
  const now = new Date()
  const settings = await emailTokensRepository.readTokenSettings()
  const secret = createTokenSecret()

  const sentTo = await db.runTransaction(async (tx) => {
    const account = await usersRepository.findByMatricula(matricula, tx)
    if (!account || account.status !== USER_STATUS.active) return undefined

    const previous = await emailTokensRepository.findRecent(
      tx,
      account.uid,
      PURPOSE,
    )
    // Dentro dos 60 segundos nada é enviado, e a resposta continua igual: um
    // erro aqui mostraria que a conta existe.
    if (resendWaitSeconds(previous[0]?.createdAt, now) > 0) return undefined

    emailTokensRepository.issue(
      tx,
      {
        uid: account.uid,
        purpose: PURPOSE,
        sentTo: account.email,
        secret,
        settings,
        previous,
      },
      now,
    )
    return account.email
  })

  if (sentTo) {
    try {
      await sendTokenEmail({
        to: sentTo,
        purpose: PURPOSE,
        code: secret.code,
        ttlMinutes: settings.ttlMinutes,
      })
    } catch (error) {
      // Uma falha aqui mostraria que a conta existe, então o app recebe a
      // resposta de sempre; a causa fica no log do servidor.
      console.error('Não foi possível enviar o token de recuperação:', error)
    }
  }
  return { message: RECOVERY_MESSAGE }
}

// Define a nova senha com o token (RF-AUT-08). O token é consumido primeiro e a
// senha trocada depois, para um token nunca definir duas senhas. Os refresh
// tokens são revogados: quem tinha uma sessão antiga a perde.
export async function resetPassword(input: PasswordResetBody) {
  const db = getDb()
  const now = new Date()
  const settings = await emailTokensRepository.readTokenSettings()

  const result = await db.runTransaction(async (tx) => {
    const account = await usersRepository.findByMatricula(input.matricula, tx)
    if (!account || account.status !== USER_STATUS.active) {
      throw tokenError({ result: 'expired_or_used' })
    }
    const recent = await emailTokensRepository.findRecent(
      tx,
      account.uid,
      PURPOSE,
    )
    const check = verifyTokenAndRecordAttempt(tx, recent, input.token, {
      now,
      maxAttempts: settings.maxAttempts,
      consume: true,
    })
    if (check.result === 'valid') {
      writeAuditLog(
        tx,
        {
          actorUid: account.uid,
          actorRole: account.role,
          action: AUDIT_ACTION.passwordReset,
          targetUid: account.uid,
        },
        now,
      )
    }
    return { uid: account.uid, check }
  })
  // O erro sai depois da transação, para a tentativa errada continuar contada.
  if (result.check.result !== 'valid') throw tokenError(result.check)

  const auth = getAdminAuth()
  await auth.updateUser(result.uid, { password: input.password })
  await auth.revokeRefreshTokens(result.uid)
}
