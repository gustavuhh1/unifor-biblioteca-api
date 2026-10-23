import {
  COPY_STATUS,
  type Book,
  type Copy,
} from '../../../shared/types/index.js'

// Diz se o livro pode ser removido do acervo (RF-GAC-05): nenhum exemplar
// reservado ou emprestado e nenhuma pessoa na fila. Exemplar `available` ou
// `withdrawn` não impede.
export function canRemoveBook(
  book: Pick<Book, 'queueLength'>,
  copies: readonly Pick<Copy, 'status'>[],
): boolean {
  const inCirculation = copies.some(
    (copy) =>
      copy.status === COPY_STATUS.reserved ||
      copy.status === COPY_STATUS.onLoan,
  )
  return !inCirculation && book.queueLength === 0
}
