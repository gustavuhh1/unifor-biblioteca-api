import { createHmac } from 'node:crypto'
import {
  AUTH_EMAIL_DOMAIN,
  BASE_DATE,
  BOOKS,
  FINES,
  LIBRARY_PLACE,
  LOANS,
  LUCAS_FOLDERS,
  NOW_TIME,
  QUEUE_ENTRIES,
  USERS,
  type BookSpec,
  type LoanSpec,
} from './data.js'
import { buildUserDocument } from '../../src/shared/domain/user.js'
import {
  COLLECTIONS,
  SETTINGS_DOC_ID,
  userSubcollectionPath,
} from '../../src/shared/firestore/collections.js'
import { normalizeText } from '../../src/shared/text.js'
import { LIBRARY_TIMEZONE } from '../../src/shared/time.js'
import {
  BOOK_STATUS,
  COPY_STATUS,
  DATA_SOURCE,
  DELIVERY_STATUS,
  FINE_STATUS,
  LOAN_ORIGIN,
  LOAN_STATUS,
  NOTIFICATION_ACTION,
  NOTIFICATION_TYPE,
  QUEUE_ENTRY_STATUS,
  QUEUE_ORIGIN,
  USER_ROLE,
  USER_STATUS,
  type Book,
  type Copy,
  type EmailIndex,
  type Fine,
  type Folder,
  type Holiday,
  type LibrarySettings,
  type Loan,
  type MatriculaIndex,
  type NotificationDelivery,
  type QueueEntry,
  type SavedBook,
  type Timestamps,
  type User,
  type UserNotification,
  type Work,
} from '../../src/shared/types/index.js'
import type { HolidaysDocument } from './holidays.js'
import {
  OPENING_HOURS,
  at,
  atClosing,
  closingTime,
  daysBetween,
  formatDayMonth,
  localDate,
  plusDays,
} from './time.js'

// Documento como vai para o Firestore, com campos soltos.
export type Doc = Record<string, unknown>

// O que todo empréstimo tem, qualquer que seja a situação.
type LoanBase = Omit<Loan, 'requestedAt' | 'pickupDeadline' | keyof Timestamps>

// Uma escrita da carga: o caminho do documento e os dados.
export interface Write {
  path: string
  data: Doc
}

// Opções para montar a carga.
export interface BuildOptions {
  holidays: HolidaysDocument
  // Chave do HMAC que deixa os tokens do QR estáveis entre execuções, mas
  // impossíveis de adivinhar.
  tokenSecret: string
  // "Hoje" ("AAAA-MM-DD", America/Fortaleza). Toda data dos dados é deslocada do
  // dia de exemplo (15/10) para este dia, mantendo as mesmas situações.
  today: string
}

// Todos os documentos da carga, por coleção e por id.
export interface SeedData {
  settings: LibrarySettings
  holidays: Holiday
  users: Record<string, User>
  matriculaIndex: Record<string, MatriculaIndex>
  emailIndex: Record<string, EmailIndex>
  works: Record<string, Work>
  books: Record<string, Book>
  copies: Record<string, Copy>
  loans: Record<string, Loan>
  queueEntries: Record<string, QueueEntry>
  fines: Record<string, Fine>
  // Subcoleções do Lucas.
  folders: Record<string, Folder>
  savedBooks: Record<string, SavedBook>
  notifications: Record<string, UserNotification>
}

// Valor da multa por dia útil de atraso, em centavos (R$ 2,00).
export const FINE_RATE_CENTS = 200
// Seção 6.4: o único qrToken que o documento informa.
const RET_4821_QR_TOKEN = 'q9Zr0bH6v3S1kT8xY2mW4pLc'

// Uid fixo da conta de cada usuário do seed: uid_<chave>.
export const uidOf = (userKey: string) => `uid_${userKey}`
// Id fixo de cada livro do seed: book_<chave>.
export const bookIdOf = (bookKey: string) => `book_${bookKey}`
// Id fixo de cada exemplar do seed: copy_<registro>.
export const copyIdOf = (registration: string) => `copy_${registration}`

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Seed data is missing ${what}.`)
  return value
}

// Monta todos os documentos da carga (seção 8), com as datas deslocadas para
// o dia em que o seed roda.
export function buildSeed(options: BuildOptions): SeedData {
  const today = options.today
  // As datas documentadas são o exemplo de 15/10: cada uma é um deslocamento a
  // partir desse dia, aplicado a hoje (ex.: retirado em 02/10 = hoje - 13 dias).
  const dayShift = daysBetween(BASE_DATE, today)
  const shift = (date: string) => plusDays(date, dayShift)
  const atShifted = ([date, time]: [string, string]) => at(shift(date), time)
  const now = at(today, NOW_TIME)
  const created = at(shift('2026-09-01'), '09:50')
  const userByKey = new Map(USERS.map((user) => [user.key, user]))
  const bookSpecByKey = new Map(BOOKS.map((book) => [book.key, book]))
  const loanSpecById = new Map(LOANS.map((loan) => [loan.id, loan]))
  // Acham o usuário e o livro pela chave dos dados; o dado que não existe é erro.
  const userOf = (key: string) => required(userByKey.get(key), `user ${key}`)
  const bookOf = (key: string) =>
    required(bookSpecByKey.get(key), `book ${key}`)

  const stamps = (createdAt = created, updatedAt = now) => ({
    createdAt,
    updatedAt,
  })

  // --- Livros, exemplares e obras ---------------------------------------------

  const books: Record<string, Book> = {}
  const copies: Record<string, Copy> = {}

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
      location: LIBRARY_PLACE,
      googleBooks: spec.isbn
        ? { volumeId: null, lastSyncedAt: null, found: true }
        : undefined,
      dataSource: spec.isbn ? DATA_SOURCE.mixed : DATA_SOURCE.manual,
      copiesTotal: 0,
      copiesAvailable: 0,
      queueLength: 0,
      unavailableForNewRequests: spec.unavailableForNewRequests ?? false,
      status: BOOK_STATUS.active,
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
        status: COPY_STATUS.available,
        ...stamps(),
      }
    }
  })

  // --- Empréstimos ----------------------------------------------------------------

  const documentedCodes = new Set(LOANS.map((loan) => loan.pickupCode))
  let nextCodeNumber = 4800
  const nextPickupCode = () => {
    while (documentedCodes.has(`RET-${nextCodeNumber}`)) nextCodeNumber++
    return `RET-${nextCodeNumber++}`
  }

  const loans: Record<string, Loan> = {}
  for (const spec of LOANS) {
    loans[spec.id] = buildLoan(spec)
  }

  function buildLoan(spec: LoanSpec): Loan {
    const student = userOf(spec.student)
    const book = bookOf(spec.book)
    const common: LoanBase = {
      studentUid: uidOf(student.key),
      matricula: student.matricula,
      studentName: student.fullName,
      bookId: bookIdOf(book.key),
      workId: book.workId,
      copyId: copyIdOf(spec.copy),
      bookTitle: book.title,
      bookShelf: book.cdu ? `Estante ${book.cdu}` : '',
      status: spec.status,
      origin: spec.queueEntry ? LOAN_ORIGIN.queue : LOAN_ORIGIN.request,
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
        ? { due2Days: atShifted(spec.due2DaysReminderAt) }
        : {},
    }

    if (spec.status === LOAN_STATUS.awaitingPickup) {
      const requestedAt = atShifted(required(spec.requestedAt, 'requestedAt'))
      return {
        ...common,
        status: LOAN_STATUS.awaitingPickup,
        requestedAt,
        pickupDeadline: atShifted(
          required(spec.pickupDeadline, 'pickupDeadline'),
        ),
        ...stamps(requestedAt, requestedAt),
      }
    }

    // Já retirado: vencimento = retirada + 14 dias (+14 se renovado), no horário
    // de fechamento.
    const pickedUpOn = shift(required(spec.pickedUpOn, 'pickedUpOn'))
    const originalDueOn = plusDays(pickedUpOn, 14)
    const dueOn = spec.renewedOn ? plusDays(originalDueOn, 14) : originalDueOn
    const pickedUpAt = at(pickedUpOn, closingTime(originalDueOn))
    const renewedAt = spec.renewedOn
      ? at(shift(spec.renewedOn), '12:00')
      : undefined
    const returnedAt = spec.returnedAt ? atShifted(spec.returnedAt) : undefined
    return {
      ...common,
      status: spec.status,
      // O pedido e a retirada são o mesmo momento nos empréstimos já retirados.
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

  // Os exemplares seguem os empréstimos: o pedido reserva o exemplar e a retirada
  // o empresta.
  for (const [loanId, loan] of Object.entries(loans)) {
    const copy = required(copies[loan.copyId], `copy ${loan.copyId}`)
    if (loan.status === LOAN_STATUS.awaitingPickup) {
      copy.status = COPY_STATUS.reserved
      copy.currentLoanId = loanId
    } else if (loan.status === LOAN_STATUS.active) {
      copy.status = COPY_STATUS.onLoan
      copy.currentLoanId = loanId
      copy.dueAt = loan.dueAt
    }
  }

  // --- Filas ---------------------------------------------------------------

  const queueEntries: Record<string, QueueEntry> = {}
  for (const spec of QUEUE_ENTRIES) {
    const student = userOf(spec.student)
    const book = bookOf(spec.book)
    const joinedAt = at(shift(spec.joinedOn), '10:00')
    const fulfilled = spec.status === QUEUE_ENTRY_STATUS.fulfilled
    // Lucas foi chamado às 09:12 de hoje e confirmou às 09:30 (24 h para
    // confirmar).
    const turnStartedAt = fulfilled ? at(today, '09:12') : undefined
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
      origin: QUEUE_ORIGIN.student,
      turnStartedAt,
      confirmDeadline: turnStartedAt
        ? at(plusDays(today, 1), '09:12')
        : undefined,
      reservedCopyId: fulfilled
        ? loans[required(spec.loan, 'loan')]?.copyId
        : undefined,
      loanId: spec.loan,
      endedAt: fulfilled ? at(today, '09:30') : undefined,
      notifyCount: 0,
      ...stamps(joinedAt, fulfilled ? at(today, '09:30') : joinedAt),
    }
  }

  // --- Multas ----------------------------------------------------------------

  const fines: Record<string, Fine> = {}
  for (const spec of FINES) {
    const loanSpec = required(loanSpecById.get(spec.loan), `loan ${spec.loan}`)
    const loan = required(loans[spec.loan], `loan ${spec.loan}`)
    const student = userOf(loanSpec.student)
    const base = {
      loanId: spec.loan,
      studentUid: loan.studentUid,
      matricula: student.matricula,
      studentName: student.fullName,
      studentNameNormalized: normalizeText(student.fullName),
      bookId: loan.bookId,
      bookTitle: loan.bookTitle,
      ratePerBusinessDayCents: FINE_RATE_CENTS,
      dueAt: required(loan.dueAt, 'dueAt'),
    }
    if (spec.status === FINE_STATUS.accruing) {
      fines[spec.id] = { ...base, status: FINE_STATUS.accruing, ...stamps() }
    } else {
      const returnedAt = required(loan.returnedAt, 'returnedAt')
      // Congelada na devolução: os dias e os valores documentados não mudam com
      // as datas (seção 6.5).
      const businessDaysLate = required(
        spec.businessDaysLate,
        'businessDaysLate',
      )
      fines[spec.id] = {
        ...base,
        status: FINE_STATUS.open,
        businessDaysLate,
        amountCents: businessDaysLate * FINE_RATE_CENTS,
        frozenAt: returnedAt,
        ...stamps(returnedAt, returnedAt),
      }
    }
  }

  // --- Contadores, calculados a partir dos dados acima ------------------------------

  for (const [bookId, book] of Object.entries(books)) {
    const bookCopies = Object.values(copies).filter((c) => c.bookId === bookId)
    const onLoanDueDates = bookCopies
      .filter((c) => c.status === COPY_STATUS.onLoan)
      .map((c) => required(c.dueAt, 'copy dueAt').getTime())
    book.copiesTotal = bookCopies.length
    book.copiesAvailable = bookCopies.filter(
      (c) => c.status === COPY_STATUS.available,
    ).length
    book.queueLength = Object.values(queueEntries).filter(
      (q) => q.bookId === bookId && q.status === QUEUE_ENTRY_STATUS.waiting,
    ).length
    book.nextReturnAt = onLoanDueDates.length
      ? new Date(Math.min(...onLoanDueDates))
      : undefined
  }

  const works: Record<string, Work> = {}
  for (const spec of BOOKS) {
    const work = works[spec.workId]
    const bookId = bookIdOf(spec.key)
    if (work) {
      work.bookIds.push(bookId)
      work.editionCount = work.bookIds.length
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

  const users: Record<string, User> = {}
  const matriculaIndex: Record<string, MatriculaIndex> = {}
  const emailIndex: Record<string, EmailIndex> = {}
  for (const spec of USERS) {
    const uid = uidOf(spec.key)
    const mine = <T extends { studentUid: string }>(docs: Record<string, T>) =>
      Object.values(docs).filter((doc) => doc.studentUid === uid)

    // O histórico de leitura do Lucas não é carregado: os 17 livros são um valor
    // fixo (6.4).
    const returnedThisYear = mine(loans).filter(
      (l) => l.status === LOAN_STATUS.returned,
    )
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

    const isLucas = spec.key === 'lucas'
    users[uid] = buildUserDocument({
      role: spec.role,
      matricula: spec.matricula,
      fullName: spec.fullName,
      email: spec.email,
      authEmail: `${spec.matricula}@${AUTH_EMAIL_DOMAIN}`,
      status: USER_STATUS.active,
      // Todo aluno ativo confirmou o token de e-mail: o Lucas 10 minutos depois de
      // criado (seção 6.4), os outros 5. Bibliotecários não se cadastram pelo
      // app, então não têm confirmação.
      emailVerifiedAt: isLucas
        ? new Date(created.getTime() + 10 * 60_000)
        : spec.role === USER_ROLE.student
          ? new Date(created.getTime() + 5 * 60_000)
          : undefined,
      course: spec.course,
      deskLabel: spec.deskLabel,
      counters: {
        activeLoanCount: mine(loans).filter(
          (l) =>
            l.status === LOAN_STATUS.awaitingPickup ||
            l.status === LOAN_STATUS.active,
        ).length,
        activeQueueCount: mine(queueEntries).filter(
          (q) => q.status === QUEUE_ENTRY_STATUS.waiting,
        ).length,
        openFineTotalCents: mine(fines)
          .filter((f) => f.status === FINE_STATUS.open)
          .reduce((sum, f) => sum + required(f.amountCents, 'amountCents'), 0),
        booksReadByYear,
      },
      createdAt: created,
      updatedAt: isLucas ? at(today, '09:12') : now,
    })
    matriculaIndex[spec.matricula] = { uid, role: spec.role, ...stamps() }
    emailIndex[spec.email.toLowerCase()] = { uid, ...stamps() }
  }

  // --- Pastas, livros salvos e avisos do Lucas ----------------------

  const folders: Record<string, Folder> = {}
  const savedBooks: Record<string, SavedBook> = {}
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

  const delivery: NotificationDelivery = {
    push: DELIVERY_STATUS.sent,
    email: DELIVERY_STATUS.sent,
  }
  const pickupDeadline = required(
    loans.loan_ret4821?.pickupDeadline,
    'pickupDeadline',
  )
  const dueAt = required(loans.loan_lucas_engenharia?.dueAt, 'dueAt')
  const waiting = books[bookIdOf('engenharia_de_software')]!.queueLength
  const codigoLimpoId = bookIdOf('codigo_limpo')
  const notifications: Record<string, UserNotification> = {
    notif_queue_turn: {
      type: NOTIFICATION_TYPE.queueTurn,
      title: 'É a sua vez: Código Limpo',
      body: 'Confirme até amanhã, 09:12, que vai retirar.',
      bookId: codigoLimpoId,
      loanId: 'loan_ret4821',
      queueEntryId: 'qe_lucas_codigo_limpo',
      action: NOTIFICATION_ACTION.openLoan,
      readAt: at(today, '09:30'),
      delivery,
      ...stamps(at(today, '09:12'), at(today, '09:30')),
    },
    notif_pickup_ready: {
      type: NOTIFICATION_TYPE.pickupReady,
      title: 'Pedido pronto: Código Limpo',
      body: `Retire até ${formatDayMonth(localDate(pickupDeadline))}. Código RET-4821.`,
      bookId: codigoLimpoId,
      loanId: 'loan_ret4821',
      action: NOTIFICATION_ACTION.showQr,
      delivery,
      ...stamps(at(today, '09:30'), at(today, '09:30')),
    },
    notif_due_reminder: {
      type: NOTIFICATION_TYPE.dueReminder,
      title: 'Engenharia de Software vence em 2 dias',
      body: `Devolva até ${formatDayMonth(localDate(dueAt))}. Há ${waiting} pessoas na fila, então não dá para renovar.`,
      bookId: bookIdOf('engenharia_de_software'),
      loanId: 'loan_lucas_engenharia',
      action: NOTIFICATION_ACTION.openLoan,
      delivery,
      ...stamps(
        at(shift('2026-10-14'), '09:00'),
        at(shift('2026-10-14'), '09:00'),
      ),
    },
  }

  // --- Configurações e feriados ------------------------------------------------

  const settings: LibrarySettings = {
    timezone: LIBRARY_TIMEZONE,
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
    contact: {
      place: LIBRARY_PLACE,
      biblioZap: '(85) 3477-3257',
      loanPhone: '(85) 3477-3162',
      loanEmail: 'bibemprestimo@unifor.br',
    },
    officialRulesUrl: 'https://unifor.br/cesta-de-servicos/biblioteca',
    ...stamps(),
  }

  const fetchedAt = new Date(options.holidays.fetchedAt)
  const holidays: Holiday = {
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

// `searchText`: título, subtítulo, autores, assuntos e ISBN (seções 2.7 e 6.4).
function searchTextOf(spec: BookSpec): string {
  return normalizeText(
    [spec.title, spec.subtitle, ...spec.authors, ...spec.subjects, spec.isbn]
      .filter(Boolean)
      .join(' '),
  )
}

// Remove os campos `undefined` (o Firestore os recusa), mantendo `null` e datas.
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

// Monta as escritas na ordem da seção 8: configurações e feriados, usuários,
// acervo, circulação e, por fim, os avisos e os livros salvos do Lucas.
export function toWrites(data: SeedData): Write[] {
  const lucas = uidOf('lucas')
  return [
    ...inCollection(COLLECTIONS.settings, { [SETTINGS_DOC_ID]: data.settings }),
    ...inCollection(COLLECTIONS.holidays, {
      [String(data.holidays.year)]: data.holidays,
    }),
    ...inCollection(COLLECTIONS.users, data.users),
    ...inCollection(COLLECTIONS.matriculaIndex, data.matriculaIndex),
    ...inCollection(COLLECTIONS.emailIndex, data.emailIndex),
    ...inCollection(COLLECTIONS.works, data.works),
    ...inCollection(COLLECTIONS.books, data.books),
    ...inCollection(COLLECTIONS.copies, data.copies),
    ...inCollection(COLLECTIONS.loans, data.loans),
    ...inCollection(COLLECTIONS.queueEntries, data.queueEntries),
    ...inCollection(COLLECTIONS.fines, data.fines),
    ...inCollection(
      userSubcollectionPath(lucas, COLLECTIONS.folders),
      data.folders,
    ),
    ...inCollection(
      userSubcollectionPath(lucas, COLLECTIONS.savedBooks),
      data.savedBooks,
    ),
    ...inCollection(
      userSubcollectionPath(lucas, COLLECTIONS.notifications),
      data.notifications,
    ),
  ]
}
