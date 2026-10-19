import { createHmac } from 'node:crypto'
import { lateBusinessDays } from './business-days.js'
import {
  AUTH_EMAIL_DOMAIN,
  BOOKS,
  FINES,
  LOANS,
  LUCAS_FOLDERS,
  NOW_TIME,
  QUEUE_ENTRIES,
  TODAY,
  USERS,
  type BookSpec,
  type LoanSpec,
  type UserSpec,
} from './data.js'
import { holidayDates, type HolidaysDocument } from './holidays.js'
import { OPENING_HOURS, at, atClosing, closingTime, plusDays } from './time.js'

export type Doc = Record<string, unknown>

export interface Write {
  path: string
  data: Doc
}

export interface BuildOptions {
  holidays: HolidaysDocument
  // Key of the HMAC that makes the QR tokens stable between runs but unguessable.
  tokenSecret: string
  // The simulated "today" only exists in the test environment (RF-SIS-04).
  simulatedNow: boolean
}

type BookDoc = {
  workId: string
  title: string
  authors: string[]
  isbn?: string
  publisher?: string
  synopsis?: string
  coverUrl: string | null
  copiesTotal: number
  copiesAvailable: number
  queueLength: number
  nextReturnAt?: Date
  googleBooks?: Doc
  [field: string]: unknown
}

type CopyDoc = {
  bookId: string
  registration: string
  status: 'available' | 'reserved' | 'on_loan'
  currentLoanId?: string
  dueAt?: Date
  [field: string]: unknown
}

type LoanDoc = {
  studentUid: string
  bookId: string
  copyId: string
  status: 'awaiting_pickup' | 'active' | 'returned'
  dueAt?: Date
  returnedAt?: Date
  [field: string]: unknown
}

type QueueDoc = {
  studentUid: string
  bookId: string
  status: 'waiting' | 'fulfilled'
  [field: string]: unknown
}

type FineDoc = {
  studentUid: string
  status: 'accruing' | 'open'
  amountCents?: number
  [field: string]: unknown
}

export interface SeedData {
  settings: Doc
  holidays: Doc
  users: Record<string, Doc>
  matriculaIndex: Record<string, Doc>
  emailIndex: Record<string, Doc>
  works: Record<string, Doc>
  books: Record<string, BookDoc>
  copies: Record<string, CopyDoc>
  loans: Record<string, LoanDoc>
  queueEntries: Record<string, QueueDoc>
  fines: Record<string, FineDoc>
  // Lucas's subcollections.
  folders: Record<string, Doc>
  savedBooks: Record<string, Doc>
  notifications: Record<string, Doc>
}

export const FINE_RATE_CENTS = 200
// Section 6.4: the only qrToken the document gives.
const RET_4821_QR_TOKEN = 'q9Zr0bH6v3S1kT8xY2mW4pLc'

export const uidOf = (userKey: string) => `uid_${userKey}`
export const bookIdOf = (bookKey: string) => `book_${bookKey}`
export const copyIdOf = (registration: string) => `copy_${registration}`

// Lower case, no accents: the format of `searchText` and the `*Normalized` fields.
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

function initialsOf(fullName: string): string {
  const words = fullName.split(' ')
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase()
}

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Seed data is missing ${what}.`)
  return value
}

export function buildSeed(options: BuildOptions): SeedData {
  const now = at(TODAY, NOW_TIME)
  const created = at('2026-09-01', '09:50')
  const nonWorkingDates = holidayDates(options.holidays)
  const userByKey = new Map(USERS.map((user) => [user.key, user]))
  const bookSpecByKey = new Map(BOOKS.map((book) => [book.key, book]))
  const loanSpecById = new Map(LOANS.map((loan) => [loan.id, loan]))

  const stamps = (createdAt = created, updatedAt = now) => ({
    createdAt,
    updatedAt,
  })

  // --- Books, copies and works ---------------------------------------------

  const books: Record<string, BookDoc> = {}
  const copies: Record<string, CopyDoc> = {}

  BOOKS.forEach((spec, index) => {
    const id = bookIdOf(spec.key)
    books[id] = {
      workId: spec.workId,
      isbn: spec.isbn,
      title: spec.title,
      subtitle: spec.subtitle,
      authors: spec.authors,
      translators: spec.translators,
      publisher: spec.publisher,
      publicationPlace: spec.publicationPlace,
      edition: spec.edition,
      year: spec.year,
      language: 'Português',
      materialType: 'Livro',
      series: spec.series,
      subjects: spec.subjects,
      synopsis: spec.synopsis,
      coverUrl: null,
      coverTone: (index % 6) + 1,
      cdu: spec.cdu,
      cutter: spec.cutter,
      shelf: spec.cdu ? `Estante ${spec.cdu}` : '',
      location: 'Biblioteca (Praça Central)',
      googleBooks: spec.isbn
        ? { volumeId: null, lastSyncedAt: null, found: true }
        : undefined,
      dataSource: spec.isbn ? 'mixed' : 'manual',
      copiesTotal: 0,
      copiesAvailable: 0,
      queueLength: 0,
      unavailableForNewRequests: spec.unavailableForNewRequests ?? false,
      status: 'active',
      searchText: searchTextOf(spec),
      ...stamps(),
    }
    for (const { registration } of spec.copies) {
      copies[copyIdOf(registration)] = {
        bookId: id,
        workId: spec.workId,
        registration,
        format: 'Impresso',
        libraryCode: '1163 · Biblioteca · Livros',
        status: 'available',
        ...stamps(),
      }
    }
  })

  // --- Loans ----------------------------------------------------------------

  const documentedCodes = new Set(LOANS.map((loan) => loan.pickupCode))
  let nextCodeNumber = 4800
  const nextPickupCode = () => {
    while (documentedCodes.has(`RET-${nextCodeNumber}`)) nextCodeNumber++
    return `RET-${nextCodeNumber++}`
  }

  const loans: Record<string, LoanDoc> = {}
  for (const spec of LOANS) {
    loans[spec.id] = buildLoan(spec)
  }

  function buildLoan(spec: LoanSpec): LoanDoc {
    const student = required(
      userByKey.get(spec.student),
      `user ${spec.student}`,
    )
    const book = required(bookSpecByKey.get(spec.book), `book ${spec.book}`)
    const common = {
      studentUid: uidOf(student.key),
      matricula: student.matricula,
      studentName: student.fullName,
      bookId: bookIdOf(book.key),
      workId: book.workId,
      copyId: copyIdOf(spec.copy),
      bookTitle: book.title,
      bookShelf: book.cdu ? `Estante ${book.cdu}` : '',
      status: spec.status,
      origin: spec.queueEntry ? 'queue' : 'request',
      queueEntryId: spec.queueEntry,
      pickupCode: spec.pickupCode ?? nextPickupCode(),
      qrToken:
        spec.id === 'loan_ret4821'
          ? RET_4821_QR_TOKEN
          : createHmac('sha256', options.tokenSecret)
              .update(`qr:${spec.id}`)
              .digest('base64url')
              .slice(0, 24),
      loanDays: 14,
      renewalCount: spec.renewedOn ? 1 : 0,
      fineId: spec.fine,
      remindersSent: spec.due2DaysReminderAt
        ? { due2Days: at(...spec.due2DaysReminderAt) }
        : {},
    }

    if (spec.status === 'awaiting_pickup') {
      const requestedAt = at(...required(spec.requestedAt, 'requestedAt'))
      return {
        ...common,
        status: 'awaiting_pickup',
        requestedAt,
        pickupDeadline: at(...required(spec.pickupDeadline, 'pickupDeadline')),
        ...stamps(requestedAt, requestedAt),
      }
    }

    // Already picked up: due date = pickup + 14 days (+14 if renewed), at closing time.
    const pickedUpOn = required(spec.pickedUpOn, 'pickedUpOn')
    const originalDueOn = plusDays(pickedUpOn, 14)
    const dueOn = spec.renewedOn ? plusDays(originalDueOn, 14) : originalDueOn
    const pickedUpAt = at(pickedUpOn, closingTime(originalDueOn))
    const renewedAt = spec.renewedOn ? at(spec.renewedOn, '12:00') : undefined
    const returnedAt = spec.returnedAt ? at(...spec.returnedAt) : undefined
    return {
      ...common,
      status: spec.status,
      // The order and the pickup are the same moment for loans already picked up.
      requestedAt: pickedUpAt,
      pickupDeadline: pickedUpAt,
      pickedUpAt,
      pickedUpBy: uidOf('ana'),
      dueAt: atClosing(dueOn),
      originalDueAt: spec.renewedOn ? atClosing(originalDueOn) : undefined,
      renewedAt,
      returnedAt,
      returnedTo: returnedAt ? uidOf('ana') : undefined,
      ...stamps(pickedUpAt, returnedAt ?? renewedAt ?? pickedUpAt),
    }
  }

  // Copies follow the loans: an order reserves the copy, a pickup lends it.
  for (const [loanId, loan] of Object.entries(loans)) {
    const copy = required(copies[loan.copyId], `copy ${loan.copyId}`)
    if (loan.status === 'awaiting_pickup') {
      copy.status = 'reserved'
      copy.currentLoanId = loanId
    } else if (loan.status === 'active') {
      copy.status = 'on_loan'
      copy.currentLoanId = loanId
      copy.dueAt = loan.dueAt
    }
  }

  // --- Queues ---------------------------------------------------------------

  const queueEntries: Record<string, QueueDoc> = {}
  for (const spec of QUEUE_ENTRIES) {
    const student = required(
      userByKey.get(spec.student),
      `user ${spec.student}`,
    )
    const book = required(bookSpecByKey.get(spec.book), `book ${spec.book}`)
    const joinedAt = at(spec.joinedOn, '10:00')
    const fulfilled = spec.status === 'fulfilled'
    // Lucas was called at 09:12 today and confirmed at 09:30 (24 h to confirm).
    const turnStartedAt = fulfilled ? at(TODAY, '09:12') : undefined
    queueEntries[spec.id] = {
      bookId: bookIdOf(book.key),
      workId: book.workId,
      bookTitle: book.title,
      studentUid: uidOf(student.key),
      matricula: student.matricula,
      studentName: student.fullName,
      status: spec.status,
      order: spec.order,
      joinedAt,
      origin: 'student',
      turnStartedAt,
      confirmDeadline: turnStartedAt
        ? at(plusDays(TODAY, 1), '09:12')
        : undefined,
      reservedCopyId: fulfilled
        ? loans[required(spec.loan, 'loan')]?.copyId
        : undefined,
      loanId: spec.loan,
      endedAt: fulfilled ? at(TODAY, '09:30') : undefined,
      notifyCount: 0,
      ...stamps(joinedAt, fulfilled ? at(TODAY, '09:30') : joinedAt),
    }
  }

  // --- Fines ----------------------------------------------------------------

  const fines: Record<string, FineDoc> = {}
  for (const spec of FINES) {
    const loanSpec = required(loanSpecById.get(spec.loan), `loan ${spec.loan}`)
    const loan = required(loans[spec.loan], `loan ${spec.loan}`)
    const student = required(userByKey.get(loanSpec.student), 'fine student')
    const base = {
      loanId: spec.loan,
      studentUid: loan.studentUid,
      matricula: student.matricula,
      studentName: student.fullName,
      studentNameNormalized: normalizeText(student.fullName),
      bookId: loan.bookId,
      bookTitle: loan.bookTitle,
      ratePerBusinessDayCents: FINE_RATE_CENTS,
      dueAt: loan.dueAt,
    }
    if (spec.status === 'accruing') {
      fines[spec.id] = { ...base, status: 'accruing', ...stamps() }
    } else {
      const returnedAt = required(loan.returnedAt, 'returnedAt')
      const businessDaysLate = lateBusinessDays(
        required(loan.dueAt, 'dueAt'),
        returnedAt,
        nonWorkingDates,
      )
      fines[spec.id] = {
        ...base,
        status: 'open',
        businessDaysLate,
        amountCents: businessDaysLate * FINE_RATE_CENTS,
        frozenAt: returnedAt,
        ...stamps(returnedAt, returnedAt),
      }
    }
  }

  // --- Counters, computed from the data above ------------------------------

  for (const [bookId, book] of Object.entries(books)) {
    const bookCopies = Object.values(copies).filter((c) => c.bookId === bookId)
    const onLoanDueDates = bookCopies
      .filter((c) => c.status === 'on_loan')
      .map((c) => required(c.dueAt, 'copy dueAt').getTime())
    book.copiesTotal = bookCopies.length
    book.copiesAvailable = bookCopies.filter(
      (c) => c.status === 'available',
    ).length
    book.queueLength = Object.values(queueEntries).filter(
      (q) => q.bookId === bookId && q.status === 'waiting',
    ).length
    book.nextReturnAt = onLoanDueDates.length
      ? new Date(Math.min(...onLoanDueDates))
      : undefined
  }

  const works: Record<string, Doc> = {}
  for (const spec of BOOKS) {
    const work = works[spec.workId]
    const bookId = bookIdOf(spec.key)
    if (work) {
      ;(work.bookIds as string[]).push(bookId)
      work.editionCount = (work.bookIds as string[]).length
    } else {
      works[spec.workId] = {
        title: spec.title,
        authors: spec.authors,
        bookIds: [bookId],
        editionCount: 1,
        ...stamps(),
      }
    }
  }

  const users: Record<string, Doc> = {}
  const matriculaIndex: Record<string, Doc> = {}
  const emailIndex: Record<string, Doc> = {}
  for (const spec of USERS) {
    const uid = uidOf(spec.key)
    const mine = <T extends { studentUid: string }>(docs: Record<string, T>) =>
      Object.values(docs).filter((doc) => doc.studentUid === uid)

    // Lucas's reading history is not loaded: his 17 books are a literal (6.4).
    const returnedThisYear = mine(loans).filter((l) => l.status === 'returned')
    const booksReadByYear: Record<string, number> =
      spec.key === 'lucas' ? { '2026': 17 } : {}
    if (spec.key !== 'lucas') {
      for (const loan of returnedThisYear) {
        const year = String(
          required(loan.returnedAt, 'returnedAt').getUTCFullYear(),
        )
        booksReadByYear[year] = (booksReadByYear[year] ?? 0) + 1
      }
    }

    users[uid] = buildUser(spec, {
      activeLoanCount: mine(loans).filter(
        (l) => l.status === 'awaiting_pickup' || l.status === 'active',
      ).length,
      activeQueueCount: mine(queueEntries).filter((q) => q.status === 'waiting')
        .length,
      openFineTotalCents: mine(fines)
        .filter((f) => f.status === 'open')
        .reduce((sum, f) => sum + required(f.amountCents, 'amountCents'), 0),
      booksReadByYear,
    })
    matriculaIndex[spec.matricula] = { uid, role: spec.role, ...stamps() }
    emailIndex[spec.email.toLowerCase()] = { uid, ...stamps() }
  }

  function buildUser(
    spec: UserSpec,
    counters: {
      activeLoanCount: number
      activeQueueCount: number
      openFineTotalCents: number
      booksReadByYear: Record<string, number>
    },
  ): Doc {
    const isLucas = spec.key === 'lucas'
    return {
      role: spec.role,
      matricula: spec.matricula,
      fullName: spec.fullName,
      fullNameNormalized: normalizeText(spec.fullName),
      initials: initialsOf(spec.fullName),
      email: spec.email,
      authEmail: `${spec.matricula}@${AUTH_EMAIL_DOMAIN}`,
      status: 'active',
      emailVerifiedAt: isLucas ? at('2026-09-01', '10:00') : undefined,
      course: spec.course,
      entryYear:
        spec.role === 'student'
          ? 2000 + Number(spec.matricula.slice(0, 2))
          : undefined,
      deskLabel: spec.deskLabel,
      ...counters,
      notificationPrefs: {
        queueTurn: true,
        overdueAndFines: true,
        dueReminders: true,
        pickupReady: true,
        queueUpdates: true,
        returnConfirmed: true,
        channelPush: true,
        channelEmail: true,
      },
      ...stamps(created, isLucas ? at(TODAY, '09:12') : now),
    }
  }

  // --- Lucas's folders, saved books and notifications ----------------------

  const folders: Record<string, Doc> = {}
  const savedBooks: Record<string, Doc> = {}
  for (const folder of LUCAS_FOLDERS) {
    folders[folder.id] = {
      name: folder.name,
      bookCount: folder.books.length,
      ...stamps(now, now),
    }
    for (const bookKey of folder.books) {
      const bookId = bookIdOf(bookKey)
      savedBooks[bookId] = {
        bookId,
        savedAt: now,
        folderIds: [folder.id],
        ...stamps(now, now),
      }
    }
  }

  const delivery = { push: 'sent', email: 'sent' }
  const codigoLimpoId = bookIdOf('codigo_limpo')
  const notifications: Record<string, Doc> = {
    notif_queue_turn: {
      type: 'queue_turn',
      title: 'É a sua vez: Código Limpo',
      body: 'Confirme até amanhã, 09:12, que vai retirar.',
      bookId: codigoLimpoId,
      loanId: 'loan_ret4821',
      queueEntryId: 'qe_lucas_codigo_limpo',
      action: 'open_loan',
      readAt: at(TODAY, '09:30'),
      delivery,
      ...stamps(at(TODAY, '09:12'), at(TODAY, '09:30')),
    },
    notif_pickup_ready: {
      type: 'pickup_ready',
      title: 'Pedido pronto: Código Limpo',
      body: 'Retire até seg, 19/10. Código RET-4821.',
      bookId: codigoLimpoId,
      loanId: 'loan_ret4821',
      action: 'show_qr',
      delivery,
      ...stamps(at(TODAY, '09:30'), at(TODAY, '09:30')),
    },
    notif_due_reminder: {
      type: 'due_reminder',
      title: 'Engenharia de Software vence em 2 dias',
      body: 'Devolva até sex, 16/10. Há 2 pessoas na fila, então não dá para renovar.',
      bookId: bookIdOf('engenharia_de_software'),
      loanId: 'loan_lucas_engenharia',
      action: 'open_loan',
      delivery,
      ...stamps(at('2026-10-14', '09:00'), at('2026-10-14', '09:00')),
    },
  }

  // --- Settings and holidays ------------------------------------------------

  const settings: Doc = {
    timezone: 'America/Fortaleza',
    openingHours: OPENING_HOURS,
    maxActiveLoans: 10,
    maxActiveQueues: 7,
    loanDays: 14,
    renewalDays: 14,
    maxRenewals: 1,
    pickupBusinessDays: 2,
    queueConfirmHours: 24,
    fineCentsPerBusinessDay: FINE_RATE_CENTS,
    dueSoonDays: 2,
    emailTokenMinutes: 20,
    emailTokenMaxAttempts: 5,
    assistantActionMinutes: 15,
    simulatedNow: options.simulatedNow ? now : null,
    contact: {
      place: 'Biblioteca (Praça Central)',
      biblioZap: '(85) 3477-3257',
      loanPhone: '(85) 3477-3162',
      loanEmail: 'bibemprestimo@unifor.br',
    },
    officialRulesUrl: 'https://unifor.br/cesta-de-servicos/biblioteca',
    ...stamps(),
  }

  const fetchedAt = new Date(options.holidays.fetchedAt)
  const holidays: Doc = {
    year: options.holidays.year,
    cityIbge: options.holidays.cityIbge,
    items: options.holidays.items,
    fetchedAt,
    source: options.holidays.source,
    ...stamps(fetchedAt, fetchedAt),
  }

  return {
    settings,
    holidays,
    users,
    matriculaIndex,
    emailIndex,
    works,
    books,
    copies,
    loans,
    queueEntries,
    fines,
    folders,
    savedBooks,
    notifications,
  }
}

// `searchText`: title, subtitle, authors, subjects and ISBN (section 2.7, 6.4).
function searchTextOf(spec: BookSpec): string {
  return normalizeText(
    [spec.title, spec.subtitle, ...spec.authors, ...spec.subjects, spec.isbn]
      .filter(Boolean)
      .join(' '),
  )
}

// Removes `undefined` fields (Firestore rejects them), keeping `null` and Dates.
function clean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clean)
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, field]) => field !== undefined)
        .map(([key, field]) => [key, clean(field)]),
    )
  }
  return value
}

function inCollection(
  collection: string,
  docs: Record<string, object>,
): Write[] {
  return Object.entries(docs).map(([id, data]) => ({
    path: `${collection}/${id}`,
    data: clean(data) as Doc,
  }))
}

// Writes in the order of section 8: settings and holidays, users, catalog,
// circulation, then Lucas's notifications and saved books.
export function toWrites(data: SeedData): Write[] {
  const lucas = `users/${uidOf('lucas')}`
  return [
    ...inCollection('settings', { library: data.settings }),
    ...inCollection('holidays', {
      [String(data.holidays.year)]: data.holidays,
    }),
    ...inCollection('users', data.users),
    ...inCollection('matriculaIndex', data.matriculaIndex),
    ...inCollection('emailIndex', data.emailIndex),
    ...inCollection('works', data.works),
    ...inCollection('books', data.books),
    ...inCollection('copies', data.copies),
    ...inCollection('loans', data.loans),
    ...inCollection('queueEntries', data.queueEntries),
    ...inCollection('fines', data.fines),
    ...inCollection(`${lucas}/folders`, data.folders),
    ...inCollection(`${lucas}/savedBooks`, data.savedBooks),
    ...inCollection(`${lucas}/notifications`, data.notifications),
  ]
}
