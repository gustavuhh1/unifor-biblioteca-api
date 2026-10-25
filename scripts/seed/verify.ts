import { formatMoney } from '../../src/shared/money.js'
import type { Firestore } from 'firebase-admin/firestore'
import {
  COLLECTIONS,
  ROOT_COLLECTIONS,
  SUBCOLLECTIONS,
} from '../../src/shared/firestore/collections.js'
import { optionalDate } from '../../src/shared/firestore/converters.js'
import {
  COPY_STATUS,
  FINE_STATUS,
  LOAN_STATUS,
  QUEUE_ENTRY_STATUS,
} from '../../src/shared/types/index.js'
import { bookIdOf, uidOf } from './build.js'
import { lateBusinessDays } from '../../src/shared/calendar/business-days.js'
import {
  atLocalTime,
  localDate,
  plusDays,
} from '../../src/shared/calendar/dates.js'
import {
  holidayDates,
  type HolidaysDocument,
} from '../../src/shared/calendar/holidays-api.js'

// Resultado de uma conferência: o que foi conferido, se passou e o detalhe.
export interface Check {
  label: string
  ok: boolean
  detail: string
}

async function count(db: Firestore, name: string, group: boolean) {
  const query = group ? db.collectionGroup(name) : db.collection(name)
  return (await query.count().get()).data().count
}

// Conta os documentos de cada coleção, lidos de volta do banco.
export async function countDocuments(db: Firestore): Promise<string[]> {
  const lines: string[] = []
  for (const name of ROOT_COLLECTIONS) {
    lines.push(`${name.padEnd(20)} ${await count(db, name, false)}`)
  }
  for (const name of SUBCOLLECTIONS) {
    lines.push(
      `${(name + ' (users/*)').padEnd(20)} ${await count(db, name, true)}`,
    )
  }
  return lines
}

// Seção 8, passo 9. As datas seguem o dia em que o seed roda, então isto confere
// as situações das seções 6.1 a 6.5 (quem está atrasado, quem tem prazo hoje...),
// e não as datas de exemplo.
export async function runChecks(
  db: Firestore,
  holidays: HolidaysDocument,
  today: string,
): Promise<Check[]> {
  const checks: Check[] = []
  const check = (label: string, ok: boolean, detail: string) =>
    checks.push({ label, ok, detail })
  const read = async (path: string) => (await db.doc(path).get()).data()

  const lucas = await read(`${COLLECTIONS.users}/${uidOf('lucas')}`)
  check(
    'Lucas com 4 de 10',
    lucas?.activeLoanCount === 4,
    `${lucas?.activeLoanCount} de 10`,
  )

  const marina = await read(`${COLLECTIONS.users}/${uidOf('marina')}`)
  check(
    'Marina com 3 de 10',
    marina?.activeLoanCount === 3,
    `${marina?.activeLoanCount} de 10`,
  )

  // Marina: empréstimo atrasado e multa ainda contando (valor calculado na hora).
  const marinaLoan = await read(`${COLLECTIONS.loans}/loan_marina_calculo1`)
  const marinaFine = await read(`${COLLECTIONS.fines}/fine_marina_calculo1`)
  const marinaDue = optionalDate(marinaLoan?.dueAt)
  const marinaDays = marinaDue
    ? lateBusinessDays(
        marinaDue,
        atLocalTime(today, '12:00'),
        holidayDates(holidays),
      )
    : 0
  const rate = (marinaFine?.ratePerBusinessDayCents as number | undefined) ?? 0
  check(
    'Marina com empréstimo atrasado e multa contando',
    marinaLoan?.status === LOAN_STATUS.active &&
      marinaFine?.status === FINE_STATUS.accruing &&
      marinaDue !== null &&
      localDate(marinaDue) < today &&
      marinaDays >= 1,
    `${marinaDays} dias úteis de atraso, ${formatMoney(marinaDays * rate)} até hoje`,
  )

  const ret4821 = await read(`${COLLECTIONS.loans}/loan_ret4821`)
  const ret4821Deadline = optionalDate(ret4821?.pickupDeadline)
  check(
    'Pedido RET-4821 do Lucas dentro do prazo de retirada',
    ret4821?.status === LOAN_STATUS.awaitingPickup &&
      ret4821Deadline !== null &&
      ret4821Deadline.getTime() > Date.now(),
    `retirar até ${ret4821Deadline ? localDate(ret4821Deadline) : '?'}`,
  )

  const beatriz = optionalDate(
    (await read(`${COLLECTIONS.loans}/loan_beatriz_padroes`))?.pickupDeadline,
  )
  check(
    'Beatriz no último dia de retirada',
    beatriz !== null && localDate(beatriz) === today,
    `prazo em ${beatriz ? localDate(beatriz) : '?'}`,
  )

  const rafael = optionalDate(
    (await read(`${COLLECTIONS.loans}/loan_rafael_calculo2`))?.pickupDeadline,
  )
  check(
    'Rafael com prazo até amanhã',
    rafael !== null && localDate(rafael) === plusDays(today, 1),
    `prazo em ${rafael ? localDate(rafael) : '?'}`,
  )

  const engenhariaDue = optionalDate(
    (await read(`${COLLECTIONS.loans}/loan_lucas_engenharia`))?.dueAt,
  )
  const engenhariaQueue = await db
    .collection(COLLECTIONS.queueEntries)
    .where('bookId', '==', bookIdOf('engenharia_de_software'))
    .where('status', '==', QUEUE_ENTRY_STATUS.waiting)
    .get()
  const dueDay = engenhariaDue ? localDate(engenhariaDue) : undefined
  check(
    'Engenharia de Software do Lucas vencendo em breve, com 2 na fila',
    dueDay !== undefined &&
      dueDay >= today &&
      dueDay <= plusDays(today, 2) &&
      engenhariaQueue.size === 2,
    `vence em ${dueDay}, ${engenhariaQueue.size} na fila`,
  )

  const queue = await db
    .collection(COLLECTIONS.queueEntries)
    .where('bookId', '==', bookIdOf('arquitetura_limpa'))
    .where('status', '==', QUEUE_ENTRY_STATUS.waiting)
    .get()
  check(
    'Arquitetura Limpa com 4 na fila',
    queue.size === 4,
    `${queue.size} na fila`,
  )

  const openFines = await db
    .collection(COLLECTIONS.fines)
    .where('status', '==', FINE_STATUS.open)
    .get()
  const amounts = openFines.docs
    .map((doc) => doc.data().amountCents as number)
    .sort((a, b) => b - a)
  const total = amounts.reduce((sum, cents) => sum + cents, 0)
  check(
    'Multas em aberto: 1000, 800, 600 e 400 centavos (R$ 28,00)',
    amounts.join(',') === '1000,800,600,400',
    `${formatMoney(total)} em ${openFines.size} alunos`,
  )

  const onLoan = await db
    .collection(COLLECTIONS.copies)
    .where('status', '==', COPY_STATUS.onLoan)
    .get()
  const orphans = onLoan.docs.filter((doc) => !doc.data().currentLoanId)
  check(
    'Todo exemplar emprestado tem currentLoanId',
    orphans.length === 0,
    `${onLoan.size} emprestados, ${orphans.length} sem empréstimo`,
  )

  return checks
}
