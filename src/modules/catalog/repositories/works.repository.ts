import type { Transaction } from 'firebase-admin/firestore'
import { getDb } from '../../../config/firebase.js'
import { COLLECTIONS } from '../../../shared/firestore/collections.js'
import { dataWithDates } from '../../../shared/firestore/converters.js'
import { readDocument } from '../../../shared/firestore/read.js'
import type { Work } from '../../../shared/types/index.js'

// Acesso ao Firestore da coleção works (seção 2.6). Toda função que grava recebe
// tx e deve ser chamada depois de todas as leituras da transação.

const workRef = (id: string) => getDb().collection(COLLECTIONS.works).doc(id)

// Lê a obra dentro da transação. Não devolve nada se ela não existir.
export async function findById(
  tx: Transaction,
  id: string,
): Promise<Work | undefined> {
  const snapshot = await readDocument(workRef(id), tx)
  return snapshot.exists
    ? (dataWithDates(snapshot, ['createdAt', 'updatedAt']) as unknown as Work)
    : undefined
}

// Cria a obra de uma primeira edição (cadastro, RF-GAC-02).
export function create(
  tx: Transaction,
  id: string,
  work: Pick<Work, 'title' | 'authors'>,
  bookId: string,
  at: Date,
): void {
  const document: Work = {
    title: work.title,
    authors: work.authors,
    bookIds: [bookId],
    editionCount: 1,
    createdAt: at,
    updatedAt: at,
  }
  tx.set(workRef(id), document)
}

// Acrescenta uma edição a uma obra que já existe: bookIds e editionCount +1.
export function addEdition(
  tx: Transaction,
  id: string,
  work: Pick<Work, 'bookIds' | 'editionCount'>,
  bookId: string,
  at: Date,
): void {
  tx.update(workRef(id), {
    bookIds: [...work.bookIds, bookId],
    editionCount: work.editionCount + 1,
    updatedAt: at,
  })
}

// Tira uma edição das ativas da obra (remoção do livro, RF-GAC-05): editionCount
// -1, sem passar de zero. O livro continua em bookIds (ativas e removidas).
export function removeEdition(
  tx: Transaction,
  id: string,
  work: Pick<Work, 'editionCount'>,
  at: Date,
): void {
  tx.update(workRef(id), {
    editionCount: Math.max(work.editionCount - 1, 0),
    updatedAt: at,
  })
}
