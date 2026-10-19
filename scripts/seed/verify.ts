import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { lateBusinessDays } from './business-days.js'
import { uidOf, bookIdOf } from './build.js'
import { COLLECTIONS, SUBCOLLECTIONS } from './firestore.js'
import type { HolidaysDocument } from './holidays.js'
import { holidayDates } from './holidays.js'
import { NOW_TIME, TODAY } from './data.js'
import { at } from './time.js'

export interface Check {
  label: string
  ok: boolean
  detail: string
}

async function count(db: Firestore, name: string, group: boolean) {
  const query = group ? db.collectionGroup(name) : db.collection(name)
  return (await query.count().get()).data().count
}

// Document counts per collection, read back from the database.
export async function countDocuments(db: Firestore): Promise<string[]> {
  const lines: string[] = []
  for (const name of COLLECTIONS) {
    lines.push(`${name.padEnd(20)} ${await count(db, name, false)}`)
  }
  for (const name of SUBCOLLECTIONS) {
    lines.push(
      `${(name + ' (users/*)').padEnd(20)} ${await count(db, name, true)}`,
    )
  }
  return lines
}

const formatMoney = (cents: number) =>
  `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`

// Section 8, step 9: reads the data back and checks the documented figures.
export async function runChecks(
  db: Firestore,
  holidays: HolidaysDocument,
): Promise<Check[]> {
  const checks: Check[] = []
  const check = (
    label: string,
    expected: unknown,
    actual: unknown,
    detail: string,
  ) => checks.push({ label, ok: expected === actual, detail })

  const lucas = (await db.doc(`users/${uidOf('lucas')}`).get()).data()
  check(
    'Lucas com 4 de 10',
    4,
    lucas?.activeLoanCount,
    `${lucas?.activeLoanCount} de 10`,
  )

  const marina = (await db.doc(`users/${uidOf('marina')}`).get()).data()
  check(
    'Marina com 3 de 10',
    3,
    marina?.activeLoanCount,
    `${marina?.activeLoanCount} de 10`,
  )

  const marinaFine = (await db.doc('fines/fine_marina_calculo1').get()).data()
  const dueAt = (marinaFine?.dueAt as Timestamp | undefined)?.toDate()
  const days = dueAt
    ? lateBusinessDays(dueAt, at(TODAY, NOW_TIME), holidayDates(holidays))
    : -1
  check(
    'Marina com 3 dias úteis e R$ 6,00',
    600,
    days * ((marinaFine?.ratePerBusinessDayCents as number | undefined) ?? 0),
    `${days} dias úteis, ${formatMoney(days * 200)}`,
  )

  const queue = await db
    .collection('queueEntries')
    .where('bookId', '==', bookIdOf('arquitetura_limpa'))
    .where('status', '==', 'waiting')
    .get()
  check(
    'Arquitetura Limpa com 4 na fila',
    4,
    queue.size,
    `${queue.size} na fila`,
  )

  const openFines = await db
    .collection('fines')
    .where('status', '==', 'open')
    .get()
  const total = openFines.docs.reduce(
    (sum, doc) => sum + (doc.data().amountCents as number),
    0,
  )
  check(
    'R$ 28,00 em aberto',
    2800,
    total,
    `${formatMoney(total)} em ${openFines.size} alunos`,
  )

  const onLoan = await db
    .collection('copies')
    .where('status', '==', 'on_loan')
    .get()
  const orphans = onLoan.docs.filter((doc) => !doc.data().currentLoanId)
  check(
    'Todo exemplar emprestado tem currentLoanId',
    0,
    orphans.length,
    `${onLoan.size} emprestados, ${orphans.length} sem empréstimo`,
  )

  return checks
}
