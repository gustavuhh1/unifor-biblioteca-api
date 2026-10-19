import type { Firestore } from 'firebase-admin/firestore'
import { getAdminAuth, getDb } from '../../config/firebase.js'
import { AppError, type FieldError } from '../../shared/errors.js'
import {
  EMAIL_INDEX,
  EMAIL_TOKENS,
  MATRICULA_INDEX,
  USERS,
  findAccountByMatricula,
  transactionReader,
} from './accounts.js'
import type { SignupConfirmBody, SignupStartBody } from './auth.schemas.js'
import { authEmailOf } from './auth-config.js'
import { RESEND_COOLDOWN_SECONDS, createTokenSecret } from './email-token.js'
import {
  assertCanSendToken,
  evaluateToken,
  issueToken,
  loadTokenSettings,
  readRecentTokens,
  tokenError,
} from './email-token.service.js'
import { sendTokenEmail } from './mailer.js'
import { createRegistrationOptions } from './passkey.service.js'

const PURPOSE = 'email_confirmation'

const MATRICULA_TAKEN: FieldError = {
  field: 'matricula',
  message: 'Esta matrícula já tem cadastro.',
}
const EMAIL_TAKEN: FieldError = {
  field: 'email',
  message: 'Este e-mail já tem cadastro.',
}

// "Sua vez na fila" and "Atraso e multa" cannot be turned off (2.1).
const DEFAULT_NOTIFICATION_PREFS = {
  queueTurn: true,
  overdueAndFines: true,
  dueReminders: true,
  pickupReady: true,
  queueUpdates: true,
  returnConfirmed: true,
  channelPush: true,
  channelEmail: true,
}

const signupPending = () => ({
  status: 'pending_email' as const,
  resendAvailableInSeconds: RESEND_COOLDOWN_SECONDS,
})

function conflictError(fields: FieldError[]): AppError {
  const message =
    fields.length === 1
      ? fields[0]!.message
      : 'Esta matrícula e este e-mail já têm cadastro.'
  return new AppError(409, 'signup_conflict', message, { fields })
}

// RF-AUT-01. Documents first, in one transaction that also enforces the
// unique matrícula and e-mail; then the disabled Firebase account; the e-mail
// goes last. Repeating it for a matrícula that is still pending replaces the
// e-mail and the password (RF-AUT-03).
export async function startSignup(input: SignupStartBody) {
  const db = getDb()
  const now = new Date()
  const settings = await loadTokenSettings(db)
  const secret = createTokenSecret()
  const authEmail = authEmailOf(input.matricula)
  const newUid = db.collection(USERS).doc().id

  const outcome = await db.runTransaction(async (tx) => {
    const matriculaRef = db.collection(MATRICULA_INDEX).doc(input.matricula)
    const emailRef = db.collection(EMAIL_INDEX).doc(input.email)
    const [matriculaIndex, emailIndex] = await tx.getAll(matriculaRef, emailRef)

    const pending = await (async () => {
      if (!matriculaIndex?.exists) return undefined
      const account = await findAccountByMatricula(
        db,
        transactionReader(tx),
        input.matricula,
      )
      const isPending =
        account?.user.get('role') === 'student' &&
        account.user.get('status') === 'pending_email'
      return isPending ? account : undefined
    })()

    const conflicts: FieldError[] = []
    if (matriculaIndex?.exists && !pending) conflicts.push(MATRICULA_TAKEN)
    if (emailIndex?.exists && emailIndex.get('uid') !== pending?.uid) {
      conflicts.push(EMAIL_TAKEN)
    }
    if (conflicts.length > 0) throw conflictError(conflicts)

    const uid = pending?.uid ?? newUid
    const recent = pending ? await readRecentTokens(tx, db, uid, PURPOSE) : []
    assertCanSendToken(recent, now)

    if (pending) {
      const oldEmail = pending.user.get('email') as string
      if (oldEmail !== input.email) {
        tx.delete(db.collection(EMAIL_INDEX).doc(oldEmail))
        tx.set(emailRef, { uid, createdAt: now, updatedAt: now })
      }
      tx.update(pending.ref, { email: input.email, updatedAt: now })
    } else {
      tx.set(matriculaRef, {
        uid,
        role: 'student',
        createdAt: now,
        updatedAt: now,
      })
      tx.set(emailRef, { uid, createdAt: now, updatedAt: now })
      // The name does not come with the sign-up: the student fills it in at
      // the Profile (decided on 19/10).
      tx.set(db.collection(USERS).doc(uid), {
        role: 'student',
        matricula: input.matricula,
        email: input.email,
        authEmail,
        status: 'pending_email',
        entryYear: 2000 + Number(input.matricula.slice(0, 2)),
        activeLoanCount: 0,
        activeQueueCount: 0,
        openFineTotalCents: 0,
        booksReadByYear: {},
        notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
        createdAt: now,
        updatedAt: now,
      })
    }

    const tokenId = issueToken(
      tx,
      db,
      {
        uid,
        purpose: PURPOSE,
        sentTo: input.email,
        secret,
        settings,
        recent,
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
      await undoSignup(db, input, outcome)
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

// The Firebase account could not be created: remove what the transaction made.
async function undoSignup(
  db: Firestore,
  input: SignupStartBody,
  created: { uid: string; tokenId: string },
): Promise<void> {
  try {
    await db.runTransaction(async (tx) => {
      tx.delete(db.collection(USERS).doc(created.uid))
      tx.delete(db.collection(MATRICULA_INDEX).doc(input.matricula))
      tx.delete(db.collection(EMAIL_INDEX).doc(input.email))
      tx.delete(db.collection(EMAIL_TOKENS).doc(created.tokenId))
      return Promise.resolve()
    })
  } catch (error) {
    console.error('Could not undo a sign-up that failed:', error)
  }
}

// RF-AUT-03: a new token for a sign-up that is still pending.
export async function resendSignupToken(matricula: string) {
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
    if (
      !account ||
      account.user.get('role') !== 'student' ||
      account.user.get('status') !== 'pending_email'
    ) {
      throw new AppError(
        404,
        'signup_not_found',
        'Não há cadastro aguardando confirmação para esta matrícula.',
      )
    }
    const recent = await readRecentTokens(tx, db, account.uid, PURPOSE)
    assertCanSendToken(recent, now)

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

  await sendTokenEmail({
    to: sentTo,
    purpose: PURPOSE,
    code: secret.code,
    ttlMinutes: settings.ttlMinutes,
  })
  return signupPending()
}

// RF-AUT-04. Checks the token (a wrong code counts an attempt), enables the
// Firebase account, and only then consumes the token and activates the user,
// so a failure in the middle leaves the token usable.
export async function confirmSignup(input: SignupConfirmBody) {
  const db = getDb()
  const now = new Date()
  const settings = await loadTokenSettings(db)
  const options = { now, maxAttempts: settings.maxAttempts }

  const checked = await db.runTransaction(async (tx) => {
    const account = await findAccountByMatricula(
      db,
      transactionReader(tx),
      input.matricula,
    )
    // Same answer as for an old token: it does not say the matrícula is unknown.
    if (!account || account.user.get('status') !== 'pending_email') {
      throw tokenError({ result: 'expired_or_used' })
    }
    const recent = await readRecentTokens(tx, db, account.uid, PURPOSE)
    const check = evaluateToken(tx, recent, input.token, {
      ...options,
      consume: false,
    })
    return { uid: account.uid, check }
  })
  // Thrown after the transaction, so the wrong attempt stays counted.
  if (checked.check.result !== 'valid') throw tokenError(checked.check)
  const { uid } = checked

  await getAdminAuth().updateUser(uid, { disabled: false })

  await db.runTransaction(async (tx) => {
    const userRef = db.collection(USERS).doc(uid)
    const recent = await readRecentTokens(tx, db, uid, PURPOSE)
    const check = evaluateToken(tx, recent, input.token, {
      ...options,
      consume: true,
    })
    if (check.result !== 'valid') throw tokenError(check)
    tx.update(userRef, {
      status: 'active',
      emailVerifiedAt: now,
      updatedAt: now,
    })
  })

  return { passkeyOptions: await createRegistrationOptions(uid) }
}
