import type {
  DocumentSnapshot,
  Firestore,
  Transaction,
} from 'firebase-admin/firestore'
import { AppError } from '../../shared/errors.js'
import { EMAIL_TOKENS, optionalDate, toDate } from './accounts.js'
import {
  DEFAULT_TOKEN_SETTINGS,
  checkToken,
  resendWaitSeconds,
  tokenExpiresAt,
  type StoredToken,
  type TokenCheck,
  type TokenPurpose,
  type TokenSecret,
  type TokenSettings,
} from './email-token.js'

// emailTokens in Firestore (docs/modelo-de-dados-firestore.md, 2.3). Every
// function that takes a `Transaction` writes, so call it after all the reads.

// Reads `emailTokenMinutes` and `emailTokenMaxAttempts` from settings/library.
export async function loadTokenSettings(db: Firestore): Promise<TokenSettings> {
  const snap = await db.collection('settings').doc('library').get()
  const positive = (value: unknown, fallback: number) =>
    typeof value === 'number' && value > 0 ? value : fallback
  return {
    ttlMinutes: positive(
      snap.get('emailTokenMinutes'),
      DEFAULT_TOKEN_SETTINGS.ttlMinutes,
    ),
    maxAttempts: positive(
      snap.get('emailTokenMaxAttempts'),
      DEFAULT_TOKEN_SETTINGS.maxAttempts,
    ),
  }
}

// The newest tokens of an account for a purpose, newest first.
export async function readRecentTokens(
  tx: Transaction,
  db: Firestore,
  uid: string,
  purpose: TokenPurpose,
): Promise<DocumentSnapshot[]> {
  const result = await tx.get(
    db
      .collection(EMAIL_TOKENS)
      .where('uid', '==', uid)
      .where('purpose', '==', purpose)
      .orderBy('createdAt', 'desc')
      .limit(5),
  )
  return result.docs
}

function tooSoon(waitSeconds: number): AppError {
  return new AppError(
    429,
    'token_resend_too_soon',
    `Aguarde ${waitSeconds} segundos para pedir outro token.`,
    { retryAfterSeconds: waitSeconds },
  )
}

// Seconds left before another token may be sent; 0 when it may be sent now.
export function sendWaitSeconds(recent: DocumentSnapshot[], now: Date): number {
  const last = recent[0]
  return resendWaitSeconds(
    last ? toDate(last.get('createdAt')) : undefined,
    now,
  )
}

// 429 when the last token was sent less than 60 seconds ago.
export function assertCanSendToken(
  recent: DocumentSnapshot[],
  now: Date,
): void {
  const wait = sendWaitSeconds(recent, now)
  if (wait > 0) throw tooSoon(wait)
}

// Creates a token and invalidates the ones that were still usable. Returns the
// id of the new document.
export function issueToken(
  tx: Transaction,
  db: Firestore,
  input: {
    uid: string
    purpose: TokenPurpose
    sentTo: string
    secret: TokenSecret
    settings: TokenSettings
    recent: DocumentSnapshot[]
  },
  now: Date,
): string {
  for (const old of input.recent) {
    if (!old.get('usedAt') && !old.get('invalidatedAt')) {
      tx.update(old.ref, { invalidatedAt: now, updatedAt: now })
    }
  }
  const ref = db.collection(EMAIL_TOKENS).doc()
  tx.set(ref, {
    uid: input.uid,
    purpose: input.purpose,
    codeHash: input.secret.codeHash,
    salt: input.secret.salt,
    sentTo: input.sentTo,
    expiresAt: tokenExpiresAt(now, input.settings.ttlMinutes),
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  })
  return ref.id
}

function toStoredToken(snap: DocumentSnapshot): StoredToken {
  return {
    codeHash: snap.get('codeHash') as string,
    salt: snap.get('salt') as string,
    expiresAt: toDate(snap.get('expiresAt')),
    usedAt: optionalDate(snap.get('usedAt')),
    invalidatedAt: optionalDate(snap.get('invalidatedAt')),
    attempts: (snap.get('attempts') as number | undefined) ?? 0,
  }
}

// Checks a typed code against the newest token. A wrong code counts an
// attempt; with `consume`, a right one marks the token as used. Without a
// token the answer is the same as for an old one.
export function evaluateToken(
  tx: Transaction,
  recent: DocumentSnapshot[],
  code: string,
  options: { now: Date; maxAttempts: number; consume: boolean },
): TokenCheck {
  const newest = recent[0]
  if (!newest) return { result: 'expired_or_used' }

  const stored = toStoredToken(newest)
  const check = checkToken(stored, code, options.now, options.maxAttempts)
  if (check.result === 'wrong_code') {
    tx.update(newest.ref, {
      attempts: stored.attempts + 1,
      updatedAt: options.now,
    })
  } else if (check.result === 'valid' && options.consume) {
    tx.update(newest.ref, { usedAt: options.now, updatedAt: options.now })
  }
  return check
}

// What the app shows for each way a token can fail (A77).
export function tokenError(check: Exclude<TokenCheck, { result: 'valid' }>) {
  switch (check.result) {
    case 'expired_or_used':
      return new AppError(
        400,
        'token_expired_or_used',
        'Token expirado ou já usado. Peça um novo token.',
      )
    case 'locked':
      return new AppError(
        400,
        'token_attempts_exceeded',
        'Você errou o token muitas vezes. Peça um novo token.',
      )
    case 'wrong_code':
      return new AppError(
        400,
        'token_invalid',
        check.attemptsLeft > 0
          ? `Token incorreto. Você ainda tem ${check.attemptsLeft} ${check.attemptsLeft === 1 ? 'tentativa' : 'tentativas'}.`
          : 'Token incorreto. Peça um novo token.',
      )
  }
}
