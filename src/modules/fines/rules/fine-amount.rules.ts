import { lateBusinessDays } from '../../../shared/calendar/business-days.js'
import {
  FINE_STATUS,
  type Cents,
  type DateOnly,
  type Fine,
  type LoanRecord,
} from '../../../shared/types/index.js'

// Cálculo e congelamento da multa (RF-MUL-01, RF-MUL-02, seção 2.11). Funções
// puras: recebem o calendário e o instante de referência, sem Firestore e sem
// relógio escondido.

// Dias úteis de atraso e o valor correspondente.
export interface FineCalculation {
  businessDaysLate: number
  amountCents: Cents
}

// Valor da multa (RF-MUL-01): dias úteis de atraso × valor do dia, em centavos.
export function fineAmountCents(
  businessDaysLate: number,
  ratePerBusinessDayCents: Cents,
): Cents {
  return businessDaysLate * ratePerBusinessDayCents
}

// Calcula a multa de um empréstimo (RF-MUL-01): os dias úteis depois do dia do
// vencimento, até `until` (hoje, ou a devolução), a R$ 2,00 cada, sem teto.
// Fim de semana, feriado e recesso não contam. Exemplo: venceu no sábado 10/10,
// até a quinta 15/10, com 12/10 feriado: 13, 14 e 15 = 3 dias = 600 centavos.
export function calculateFine(input: {
  dueAt: Date
  until: Date
  ratePerBusinessDayCents: Cents
  closedDates: ReadonlySet<DateOnly>
}): FineCalculation {
  const businessDaysLate = lateBusinessDays(
    input.dueAt,
    input.until,
    input.closedDates,
  )
  return {
    businessDaysLate,
    amountCents: fineAmountCents(
      businessDaysLate,
      input.ratePerBusinessDayCents,
    ),
  }
}

// Quem recebeu o valor no balcão.
export interface FineReceiver {
  uid: string
  name: string
}

// Os campos que o congelamento sempre grava, mais os do pagamento na devolução.
export type FrozenFineFields = Partial<Fine> &
  Required<
    Pick<Fine, 'status' | 'businessDaysLate' | 'amountCents' | 'frozenAt'>
  >

// O que gravar na multa ao congelar (RF-MUL-02, RF-BAL-08): ela para de contar na
// devolução (`returnedAt`) e fica `open` até o pagamento no balcão. Com
// `paidNow` (a chave "Multa paga agora" do balcão), fecha direto como `paid`,
// com `paidAtReturn`.
export function freezeFields(
  fine: Pick<Fine, 'dueAt' | 'ratePerBusinessDayCents'>,
  input: {
    returnedAt: Date
    closedDates: ReadonlySet<DateOnly>
    paidNow?: FineReceiver | undefined
  },
): FrozenFineFields {
  const { returnedAt, closedDates, paidNow } = input
  const calculation = calculateFine({
    dueAt: fine.dueAt,
    until: returnedAt,
    ratePerBusinessDayCents: fine.ratePerBusinessDayCents,
    closedDates,
  })
  return {
    ...calculation,
    status: paidNow ? FINE_STATUS.paid : FINE_STATUS.open,
    frozenAt: returnedAt,
    ...(paidNow
      ? {
          paidAt: returnedAt,
          receivedBy: paidNow.uid,
          receivedByName: paidNow.name,
          paidAtReturn: true,
        }
      : {}),
    updatedAt: returnedAt,
  }
}

// O que a multa nova copia do aluno (seção 2.11).
export interface FineStudent {
  matricula: string
  name: string
  nameNormalized: string
}

// Monta a multa de um empréstimo devolvido com atraso que ainda não tinha o
// documento (a rotina que cria a multa `accruing` ainda não passou): já nasce
// congelada, com a mesma regra de freezeFields. Sem nenhum dia útil de atraso
// (devolveu no mesmo dia do vencimento ou só no fim de semana), não há multa e
// devolve undefined.
export function buildFrozenFine(input: {
  loan: Pick<LoanRecord, 'id' | 'studentUid' | 'bookId' | 'bookTitle'> & {
    dueAt: Date
  }
  student: FineStudent
  ratePerBusinessDayCents: Cents
  returnedAt: Date
  closedDates: ReadonlySet<DateOnly>
  paidNow?: FineReceiver | undefined
}): Fine | undefined {
  const { loan, student, returnedAt } = input
  const base: Fine = {
    loanId: loan.id,
    studentUid: loan.studentUid,
    matricula: student.matricula,
    studentName: student.name,
    studentNameNormalized: student.nameNormalized,
    bookId: loan.bookId,
    bookTitle: loan.bookTitle,
    status: FINE_STATUS.open,
    ratePerBusinessDayCents: input.ratePerBusinessDayCents,
    dueAt: loan.dueAt,
    createdAt: returnedAt,
    updatedAt: returnedAt,
  }
  const frozen = freezeFields(base, {
    returnedAt,
    closedDates: input.closedDates,
    paidNow: input.paidNow,
  })
  return frozen.businessDaysLate ? { ...base, ...frozen } : undefined
}

// Quanto a multa soma em `users.openFineTotalCents` depois de congelar: o valor
// inteiro, se ficou `open`; nada, se foi paga na devolução.
export function openTotalDelta(frozen: Pick<Fine, 'status' | 'amountCents'>) {
  return frozen.status === FINE_STATUS.open ? (frozen.amountCents ?? 0) : 0
}

// Por que o pagamento não pode ser registrado (RF-BAL-09): a multa ainda está
// contando (`accruing`, o livro não voltou) ou já foi paga (`paid`).
export function payDenialOf(
  fine: Pick<Fine, 'status'>,
): typeof FINE_STATUS.accruing | typeof FINE_STATUS.paid | null {
  if (fine.status === FINE_STATUS.accruing) return FINE_STATUS.accruing
  if (fine.status === FINE_STATUS.paid) return FINE_STATUS.paid
  return null
}

// O que gravar na multa quando o bibliotecário registra o pagamento no balcão
// (RF-BAL-09): `paid`, com a hora e quem recebeu.
export function payFields(receiver: FineReceiver, at: Date): Partial<Fine> {
  return {
    status: FINE_STATUS.paid,
    paidAt: at,
    receivedBy: receiver.uid,
    receivedByName: receiver.name,
    updatedAt: at,
  }
}
