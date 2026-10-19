import type {
  DocumentReference,
  DocumentSnapshot,
  Transaction,
} from 'firebase-admin/firestore'

// Lê um documento. Com tx, a leitura entra na transação; sem ela, é uma leitura
// simples. Todo repositório usa esta função.
export function readDocument(
  ref: DocumentReference,
  tx?: Transaction,
): Promise<DocumentSnapshot> {
  return tx ? tx.get(ref) : ref.get()
}
