import type { Transaction } from 'firebase-admin/firestore'
import { TOKEN_CHECK_RESULT } from '../auth.constants.js'
import { tooSoon } from '../auth.errors.js'
import type { EmailTokenRecord, TokenCheck } from '../auth.types.js'
import * as emailTokensRepository from '../repositories/email-tokens.repository.js'
import { checkToken, resendWaitSeconds } from '../rules/email-token.rules.js'

// Regras do fluxo do token de e-mail, em cima do repositório.

// Responde 429 se o último token foi enviado há menos de 60 segundos.
export function assertCanSendToken(
  recent: EmailTokenRecord[],
  now: Date,
): void {
  const wait = resendWaitSeconds(recent[0]?.createdAt, now)
  if (wait > 0) throw tooSoon(wait)
}

// Confere o código digitado com o token mais novo. Um código errado conta uma
// tentativa; com consume, um código certo marca o token como usado. Sem token, a
// resposta é a mesma de um token vencido.
export function verifyTokenAndRecordAttempt(
  tx: Transaction,
  recent: EmailTokenRecord[],
  code: string,
  options: { now: Date; maxAttempts: number; consume: boolean },
): TokenCheck {
  const newest = recent[0]
  if (!newest) return { result: TOKEN_CHECK_RESULT.expiredOrUsed }

  const check = checkToken(newest, code, options.now, options.maxAttempts)
  if (check.result === TOKEN_CHECK_RESULT.wrongCode) {
    emailTokensRepository.recordWrongAttempt(tx, newest, options.now)
  } else if (check.result === TOKEN_CHECK_RESULT.valid && options.consume) {
    emailTokensRepository.markUsed(tx, newest.id, options.now)
  }
  return check
}
