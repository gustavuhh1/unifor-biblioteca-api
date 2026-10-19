import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto'
import { RESEND_COOLDOWN_SECONDS } from '../auth.constants.js'
import type { StoredToken, TokenCheck, TokenSecret } from '../auth.types.js'

// Regras do token de e-mail (docs/modelo-de-dados-firestore.md, seção 2.3).
// Funções puras: sem Firestore, para cada regra poder ser testada sozinha.

// Calcula o hash do código com o salt do token (SHA-256 do salt seguido do
// código). RNF-SEG-05.
export function hashTokenCode(code: string, salt: string): string {
  return createHash('sha256').update(`${salt}${code}`).digest('hex')
}

// Gera o código de 6 dígitos (com zeros à esquerda), o salt e o hash. O código
// só sai daqui para ser enviado por e-mail; o banco recebe codeHash e salt.
export function createTokenSecret(): TokenSecret {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const salt = randomBytes(16).toString('hex')
  return { code, salt, codeHash: hashTokenCode(code, salt) }
}

// Calcula quando o token vence: criação mais a validade em minutos (RF-AUT-03).
export function tokenExpiresAt(createdAt: Date, ttlMinutes: number): Date {
  return new Date(createdAt.getTime() + ttlMinutes * 60_000)
}

// Compara dois hashes em tempo constante.
function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

// Decide o que um código digitado significa para o token guardado: vencido ou
// já usado, bloqueado pelas tentativas, errado ou válido. Quem chama grava
// attempts + 1 em 'wrong_code' e usedAt quando o token for consumido.
export function checkToken(
  token: StoredToken,
  code: string,
  now: Date,
  maxAttempts: number,
): TokenCheck {
  if (token.usedAt || token.invalidatedAt || now >= token.expiresAt) {
    return { result: 'expired_or_used' }
  }
  if (token.attempts >= maxAttempts) return { result: 'locked' }
  if (sameHash(token.codeHash, hashTokenCode(code, token.salt))) {
    return { result: 'valid' }
  }
  return {
    result: 'wrong_code',
    attemptsLeft: Math.max(0, maxAttempts - (token.attempts + 1)),
  }
}

// Segundos que faltam para poder enviar outro token; 0 quer dizer que já pode
// (espera de 60 segundos entre envios).
export function resendWaitSeconds(
  lastSentAt: Date | undefined,
  now: Date,
): number {
  if (!lastSentAt) return 0
  const elapsed = (now.getTime() - lastSentAt.getTime()) / 1000
  return Math.max(0, Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed))
}
