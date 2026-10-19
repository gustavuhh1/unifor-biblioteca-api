import type { DocumentSnapshot, Transaction } from 'firebase-admin/firestore'
import { getDb } from '../../../config/firebase.js'
import {
  COLLECTIONS,
  SETTINGS_DOC_ID,
} from '../../../shared/firestore/collections.js'
import { toDate } from '../../../shared/firestore/converters.js'
import type {
  EmailToken,
  EmailTokenPurpose,
} from '../../../shared/types/index.js'
import { DEFAULT_TOKEN_SETTINGS } from '../auth.constants.js'
import type {
  EmailTokenRecord,
  TokenSecret,
  TokenSettings,
} from '../auth.types.js'
import { tokenExpiresAt } from '../rules/email-token.rules.js'

// Acesso ao Firestore da coleção emailTokens (seção 2.3). Toda função que
// recebe tx grava: chame-a depois de todas as leituras da transação.

const tokens = () => getDb().collection(COLLECTIONS.emailTokens)

// Campos de data do documento que o Firestore devolve como Timestamp.
const TOKEN_DATE_FIELDS = [
  'createdAt',
  'updatedAt',
  'expiresAt',
  'usedAt',
  'invalidatedAt',
] as const

// Converte o documento lido em EmailTokenRecord (com o id), trocando os
// Timestamps por Date.
function toRecord(snapshot: DocumentSnapshot): EmailTokenRecord {
  const data = { ...snapshot.data() } as Record<string, unknown>
  for (const field of TOKEN_DATE_FIELDS) {
    if (data[field] !== undefined) data[field] = toDate(data[field])
  }
  return {
    id: snapshot.id,
    ...data,
    attempts: (data.attempts as number | undefined) ?? 0,
  } as EmailTokenRecord
}

// Lê a validade e o limite de tentativas do token em settings/library
// (emailTokenMinutes e emailTokenMaxAttempts). Sem o documento, valem 20
// minutos e 5 tentativas.
export async function readTokenSettings(): Promise<TokenSettings> {
  const snapshot = await getDb()
    .collection(COLLECTIONS.settings)
    .doc(SETTINGS_DOC_ID)
    .get()
  const positive = (value: unknown, fallback: number) =>
    typeof value === 'number' && value > 0 ? value : fallback
  return {
    ttlMinutes: positive(
      snapshot.get('emailTokenMinutes'),
      DEFAULT_TOKEN_SETTINGS.ttlMinutes,
    ),
    maxAttempts: positive(
      snapshot.get('emailTokenMaxAttempts'),
      DEFAULT_TOKEN_SETTINGS.maxAttempts,
    ),
  }
}

// Lê os tokens mais novos de uma conta para uma finalidade, do mais novo para o
// mais antigo.
export async function findRecent(
  tx: Transaction,
  uid: string,
  purpose: EmailTokenPurpose,
): Promise<EmailTokenRecord[]> {
  const result = await tx.get(
    tokens()
      .where('uid', '==', uid)
      .where('purpose', '==', purpose)
      .orderBy('createdAt', 'desc')
      .limit(5),
  )
  return result.docs.map(toRecord)
}

// Cria um token novo e invalida os anteriores que ainda valiam (RF-AUT-03).
// Devolve o id do documento novo.
export function issue(
  tx: Transaction,
  input: {
    uid: string
    purpose: EmailTokenPurpose
    sentTo: string
    secret: TokenSecret
    settings: TokenSettings
    previous: EmailTokenRecord[]
  },
  now: Date,
): string {
  for (const old of input.previous) {
    if (!old.usedAt && !old.invalidatedAt) {
      tx.update(tokens().doc(old.id), { invalidatedAt: now, updatedAt: now })
    }
  }
  const ref = tokens().doc()
  const token: EmailToken = {
    uid: input.uid,
    purpose: input.purpose,
    codeHash: input.secret.codeHash,
    salt: input.secret.salt,
    sentTo: input.sentTo,
    expiresAt: tokenExpiresAt(now, input.settings.ttlMinutes),
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  }
  tx.set(ref, token)
  return ref.id
}

// Conta uma tentativa errada no token.
export function recordWrongAttempt(
  tx: Transaction,
  token: EmailTokenRecord,
  now: Date,
): void {
  tx.update(tokens().doc(token.id), {
    attempts: token.attempts + 1,
    updatedAt: now,
  })
}

// Marca o token como usado (uso único).
export function markUsed(tx: Transaction, id: string, now: Date): void {
  tx.update(tokens().doc(id), { usedAt: now, updatedAt: now })
}

// Apaga o token (desfaz um cadastro que falhou).
export function remove(tx: Transaction, id: string): void {
  tx.delete(tokens().doc(id))
}
