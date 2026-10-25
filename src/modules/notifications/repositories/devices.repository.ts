import type { DocumentSnapshot, Transaction } from 'firebase-admin/firestore'
import { getDb } from '../../../config/firebase.js'
import { userSubcollectionPath } from '../../../shared/firestore/collections.js'
import {
  dataWithDates,
  withoutUndefined,
} from '../../../shared/firestore/converters.js'
import { readDocument } from '../../../shared/firestore/read.js'
import type { Device, DeviceRecord } from '../../../shared/types/index.js'
import { DEVICE_LIST_LIMIT } from '../notifications.constants.js'

// Acesso ao Firestore dos aparelhos, users/{uid}/devices (seção 2.15); o id do
// documento é o ID de instalação do app. Quem grava chama depois de todas as
// leituras da transação.

const devices = (uid: string) =>
  getDb().collection(userSubcollectionPath(uid, 'devices'))

// Converte o documento lido em DeviceRecord (com o id), trocando os Timestamps
// por Date.
function toRecord(snapshot: DocumentSnapshot): DeviceRecord {
  return {
    id: snapshot.id,
    ...dataWithDates(snapshot, [
      'lastSeenAt',
      'pushDisabledAt',
      'createdAt',
      'updatedAt',
    ]),
  } as unknown as DeviceRecord
}

// Lê um aparelho do aluno. Não devolve nada se ele não estiver registrado.
export async function findById(
  uid: string,
  deviceId: string,
  tx?: Transaction,
): Promise<DeviceRecord | undefined> {
  const snapshot = await readDocument(devices(uid).doc(deviceId), tx)
  return snapshot.exists ? toRecord(snapshot) : undefined
}

// Os aparelhos do aluno (RF-AVI-02).
export async function listByUser(uid: string): Promise<DeviceRecord[]> {
  const result = await devices(uid).limit(DEVICE_LIST_LIMIT).get()
  return result.docs.map(toRecord)
}

// Grava o aparelho inteiro, novo ou atualizado.
export function save(
  tx: Transaction,
  uid: string,
  deviceId: string,
  device: Device,
): void {
  tx.set(devices(uid).doc(deviceId), withoutUndefined(device))
}

// Tira o aparelho (o aluno saiu da conta). Sem o aparelho, nada muda.
export function remove(tx: Transaction, uid: string, deviceId: string): void {
  tx.delete(devices(uid).doc(deviceId))
}

// O Expo disse que o token não vale mais: o aparelho para de receber push até
// mandar um token novo (RF-AVI-02).
export async function disablePush(
  uid: string,
  deviceId: string,
  at: Date,
): Promise<void> {
  await devices(uid).doc(deviceId).update({ pushDisabledAt: at, updatedAt: at })
}
