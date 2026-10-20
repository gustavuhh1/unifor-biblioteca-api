import type { DocumentSnapshot, Transaction } from 'firebase-admin/firestore'
import { getDb } from '../../../config/firebase.js'
import { COLLECTIONS } from '../../../shared/firestore/collections.js'
import { dataWithDates, toDate } from '../../../shared/firestore/converters.js'
import { readDocument } from '../../../shared/firestore/read.js'
import type {
  ChallengePurpose,
  Passkey,
  PasskeyChallenge,
} from '../../../shared/types/index.js'
import { CHALLENGE_TTL_MINUTES } from '../auth.constants.js'
import type { PasskeyRecord } from '../auth.types.js'

// Acesso ao Firestore das coleções passkeys e passkeyChallenges (seções 2.4 e
// 2.5).

const passkeys = () => getDb().collection(COLLECTIONS.passkeys)
const challenges = () => getDb().collection(COLLECTIONS.passkeyChallenges)

// Campos de data do documento que o Firestore devolve como Timestamp.
const PASSKEY_DATE_FIELDS = [
  'createdAt',
  'updatedAt',
  'lastUsedAt',
  'revokedAt',
] as const

// Converte o documento lido em PasskeyRecord (com o id), trocando os Timestamps
// por Date.
function toRecord(snapshot: DocumentSnapshot): PasskeyRecord {
  const data = dataWithDates(snapshot, PASSKEY_DATE_FIELDS)
  return { id: snapshot.id, ...data } as PasskeyRecord
}

// Lista os passkeys de uma conta, do mais novo para o mais antigo (Meus
// passkeys, RF-AUT-10).
export async function listByUser(uid: string): Promise<PasskeyRecord[]> {
  const found = await passkeys()
    .where('uid', '==', uid)
    .orderBy('createdAt', 'desc')
    .get()
  return found.docs.map(toRecord)
}

// Acha um passkey pelo credentialId. Não devolve nada se não existir.
export async function findById(
  id: string,
  tx?: Transaction,
): Promise<PasskeyRecord | undefined> {
  const snapshot = await readDocument(passkeys().doc(id), tx)
  return snapshot.exists ? toRecord(snapshot) : undefined
}

// Guarda um passkey novo (só a chave pública, RNF-SEG-03).
export function create(tx: Transaction, id: string, passkey: Passkey): void {
  tx.set(passkeys().doc(id), passkey)
}

// Apaga um passkey (RF-AUT-10).
export function remove(tx: Transaction, id: string): void {
  tx.delete(passkeys().doc(id))
}

// Registra o uso de um passkey no login: novo contador e último uso.
export function recordUse(
  tx: Transaction,
  id: string,
  newCounter: number,
  now: Date,
): void {
  tx.update(passkeys().doc(id), {
    signCount: newCounter,
    lastUsedAt: now,
    updatedAt: now,
  })
}

// Guarda um desafio novo, que vale por 5 minutos e só uma vez. Sem uid, o
// desafio não pertence a nenhuma conta.
export async function storeChallenge(
  input: { challenge: string; purpose: ChallengePurpose; uid?: string },
  now: Date,
): Promise<void> {
  const challenge: PasskeyChallenge = {
    challenge: input.challenge,
    purpose: input.purpose,
    ...(input.uid ? { uid: input.uid } : {}),
    expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MINUTES * 60_000),
    createdAt: now,
    updatedAt: now,
  }
  await challenges().doc().set(challenge)
}

// Gasta um desafio: ele vale uma vez só. Devolve o dono do desafio, ou nada se
// o desafio não existe, é de outra finalidade, venceu ou já foi usado.
export async function consumeChallenge(
  challenge: string,
  purpose: ChallengePurpose,
  now: Date,
): Promise<{ uid?: string } | undefined> {
  return getDb().runTransaction(async (tx) => {
    const found = await tx.get(
      challenges().where('challenge', '==', challenge).limit(1),
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
