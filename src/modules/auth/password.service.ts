import { getAdminAuth, getDb } from '../../config/firebase.js'
import {
  findAccountByMatricula,
  transactionReader,
  writeAuditLog,
} from './accounts.js'
import type { PasswordResetBody } from './auth.schemas.js'
import { createTokenSecret } from './email-token.js'
import {
  evaluateToken,
  issueToken,
  loadTokenSettings,
  readRecentTokens,
  sendWaitSeconds,
  tokenError,
} from './email-token.service.js'
import { sendTokenEmail } from './mailer.js'
import { userRoleSchema } from '../../shared/user-role.js'

const PURPOSE = 'password_reset'

// The same answer whether the matrícula has an account or not, so the route
// reveals nothing about who is registered (decided on 19/10).
export const RECOVERY_MESSAGE =
  'Se a matrícula estiver cadastrada, enviamos um token para o e-mail da conta.'

// RF-AUT-08, for students and librarians. The e-mail is found inside the API
// and never returned.
export async function requestPasswordRecovery(matricula: string) {
  const db = getDb()
  const now = new Date()
  const settings = await loadTokenSettings(db)
  const secret = createTokenSecret()

  const sentTo = await db.runTransaction(async (tx) => {
    const account = await findAccountByMatricula(
      db,
      transactionReader(tx),
      matricula,
    )
    if (!account || account.user.get('status') !== 'active') return undefined

    const recent = await readRecentTokens(tx, db, account.uid, PURPOSE)
    // Inside the 60 seconds nothing is sent, and the answer stays the same:
    // an error here would show that the account exists.
    if (sendWaitSeconds(recent, now) > 0) return undefined

    const to = account.user.get('email') as string
    issueToken(
      tx,
      db,
      {
        uid: account.uid,
        purpose: PURPOSE,
        sentTo: to,
        secret,
        settings,
        recent,
      },
      now,
    )
    return to
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
      // A failure here would show that the account exists, so the app gets
      // the usual answer; the server log has the cause.
      console.error('Could not send the password recovery token:', error)
    }
  }
  return { message: RECOVERY_MESSAGE }
}

// The token is consumed first and the password changed after, so a token can
// never set two passwords. The refresh tokens are revoked: whoever holds an
// old session loses it.
export async function resetPassword(input: PasswordResetBody) {
  const db = getDb()
  const now = new Date()
  const settings = await loadTokenSettings(db)

  const result = await db.runTransaction(async (tx) => {
    const account = await findAccountByMatricula(
      db,
      transactionReader(tx),
      input.matricula,
    )
    if (!account || account.user.get('status') !== 'active') {
      throw tokenError({ result: 'expired_or_used' })
    }
    const recent = await readRecentTokens(tx, db, account.uid, PURPOSE)
    const check = evaluateToken(tx, recent, input.token, {
      now,
      maxAttempts: settings.maxAttempts,
      consume: true,
    })
    if (check.result === 'valid') {
      writeAuditLog(
        tx,
        db,
        {
          actorUid: account.uid,
          actorRole: userRoleSchema.parse(account.user.get('role')),
          action: 'password_reset',
        },
        now,
      )
    }
    return { uid: account.uid, check }
  })
  // Thrown after the transaction, so the wrong attempt stays counted.
  if (result.check.result !== 'valid') throw tokenError(result.check)

  const auth = getAdminAuth()
  await auth.updateUser(result.uid, { password: input.password })
  await auth.revokeRefreshTokens(result.uid)
}
