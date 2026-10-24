import type { LoanRecord } from '../../../shared/types/index.js'
import type { PickupItem } from '../desk.types.js'

// A lista Retiradas do balcão (RF-BAL-05). Funções puras.

// Um pedido aguardando retirada na lista. O segredo do QR não sai daqui: o
// bibliotecário só precisa do código curto, do aluno e do livro.
export function toPickupItem(loan: LoanRecord): PickupItem {
  return {
    loanId: loan.id,
    pickupCode: loan.pickupCode,
    matricula: loan.matricula,
    studentName: loan.studentName,
    bookTitle: loan.bookTitle,
    bookShelf: loan.bookShelf,
    pickupDeadline: loan.pickupDeadline.toISOString(),
  }
}

// Filtra pelos primeiros dígitos da matrícula, para achar os pedidos de um aluno
// enquanto o bibliotecário digita. Sem busca, devolve tudo. Mantém a ordem
// recebida (do prazo mais curto ao mais longo).
export function filterByMatricula(
  loans: readonly LoanRecord[],
  matricula: string | undefined,
): LoanRecord[] {
  return matricula
    ? loans.filter((loan) => loan.matricula.startsWith(matricula))
    : [...loans]
}
