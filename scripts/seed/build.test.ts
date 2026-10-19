import { beforeAll, describe, expect, it } from 'vitest'
import { buildSeed, toWrites, type SeedData } from './build.js'
import {
  holidayDates,
  loadHolidaysFile,
  type HolidaysDocument,
} from './holidays.js'
import { at } from './time.js'

let data: SeedData
let holidays: HolidaysDocument
let nonWorkingDates: Set<string>

beforeAll(async () => {
  holidays = await loadHolidaysFile(2026)
  nonWorkingDates = holidayDates(holidays)
  data = buildSeed({ holidays, tokenSecret: 'test-secret', simulatedNow: true })
})

describe('counters (section 8, step 6)', () => {
  it('Lucas has 4 of 10 loans, 1 queue and the literal 17 books read', () => {
    expect(data.users.uid_lucas).toMatchObject({
      activeLoanCount: 4,
      activeQueueCount: 1,
      openFineTotalCents: 0,
      booksReadByYear: { '2026': 17 },
    })
  })

  it('Marina has 3 of 10 loans and 1 queue', () => {
    expect(data.users.uid_marina).toMatchObject({
      activeLoanCount: 3,
      activeQueueCount: 1,
    })
  })

  it('counts open fines and returned books from the loaded data only', () => {
    expect(data.users.uid_pedrohenrique).toMatchObject({
      openFineTotalCents: 1000,
      booksReadByYear: { '2026': 1 },
    })
    expect(data.users.uid_carlos).toMatchObject({
      activeLoanCount: 0,
      activeQueueCount: 2,
      booksReadByYear: {},
    })
  })

  it('open fines add up to R$ 28,00 in 4 students', () => {
    const open = Object.values(data.fines).filter((f) => f.status === 'open')

    expect(open).toHaveLength(4)
    expect(open.reduce((sum, f) => sum + (f.amountCents ?? 0), 0)).toBe(2800)
  })

  it('Código Limpo: 3 copies, none available, 1 in the queue, next return 28/10', () => {
    expect(data.books.book_codigo_limpo).toMatchObject({
      copiesTotal: 3,
      copiesAvailable: 0,
      queueLength: 1,
      nextReturnAt: at('2026-10-28', '21:55'),
    })
  })

  it('Arquitetura Limpa has 4 waiting and is unavailable for new requests', () => {
    expect(data.books.book_arquitetura_limpa).toMatchObject({
      queueLength: 4,
      unavailableForNewRequests: true,
    })
  })

  it('Refatoração has 2 on the shelf; Algoritmos has 4 on loan in 2 editions, no queue', () => {
    expect(data.books.book_refatoracao).toMatchObject({
      copiesTotal: 3,
      copiesAvailable: 2,
    })
    expect(data.works['algoritmos--cormen']).toMatchObject({ editionCount: 2 })
    for (const id of ['book_algoritmos_3a', 'book_algoritmos_4a']) {
      expect(data.books[id]).toMatchObject({
        copiesTotal: 2,
        copiesAvailable: 0,
        queueLength: 0,
      })
    }
  })

  it('Engenharia de Software has 2 waiting, in order', () => {
    const waiting = Object.values(data.queueEntries)
      .filter((q) => q.bookId === 'book_engenharia_de_software')
      .sort((a, b) => (a.order as number) - (b.order as number))

    expect(waiting.map((q) => q.studentUid)).toEqual([
      'uid_beatriz',
      'uid_diego',
    ])
  })
})

describe('consistency', () => {
  it('every copy on loan or reserved points to a loan of that copy', () => {
    const lent = Object.entries(data.copies).filter(
      ([, copy]) => copy.status !== 'available',
    )

    expect(lent.map(([id]) => id).sort()).toEqual(
      [
        ...Object.values(data.loans)
          .filter((l) => l.status !== 'returned')
          .map((l) => l.copyId),
      ].sort(),
    )
    for (const [id, copy] of lent) {
      expect(copy.currentLoanId, id).toBeTruthy()
      expect(data.loans[copy.currentLoanId!]!.copyId).toBe(id)
      expect(copy.dueAt !== undefined, id).toBe(copy.status === 'on_loan')
    }
  })

  it('never gives a student two active or pending loans of the same title', () => {
    const seen = new Set<string>()
    for (const loan of Object.values(data.loans)) {
      if (loan.status === 'returned') continue
      const key = `${loan.studentUid}|${loan.workId}`
      expect(seen.has(key), key).toBe(false)
      seen.add(key)
    }
  })

  it('has unique copy registrations and unique pickup codes', () => {
    const registrations = Object.values(data.copies).map((c) => c.registration)
    const codes = Object.values(data.loans).map((l) => l.pickupCode as string)

    expect(new Set(registrations).size).toBe(registrations.length)
    expect(new Set(codes).size).toBe(codes.length)
    expect(data.loans.loan_ret4821!.pickupCode).toBe('RET-4821')
    expect(data.loans.loan_beatriz_padroes!.pickupCode).toBe('RET-4817')
    expect(data.loans.loan_rafael_calculo2!.pickupCode).toBe('RET-4809')
  })

  it('gives the loans the documented due dates', () => {
    const due = (id: string) => data.loans[id]!.dueAt
    // Sections 6.3 and 6.5.
    expect(due('loan_lucas_engenharia')).toEqual(at('2026-10-16', '21:55'))
    expect(due('loan_lucas_redes')).toEqual(at('2026-10-20', '21:55'))
    expect(due('loan_lucas_estruturas')).toEqual(at('2026-10-23', '21:55'))
    expect(due('loan_marina_calculo1')).toEqual(at('2026-10-10', '14:10'))
    expect(due('loan_pedromartins_arquitetura')).toEqual(
      at('2026-10-21', '21:55'),
    )
    expect(due('loan_julia_codigo_limpo')).toEqual(at('2026-10-28', '21:55'))
    expect(due('loan_camila_codigo_limpo')).toEqual(at('2026-11-03', '21:55'))
    expect(due('loan_diego_refatoracao')).toEqual(at('2026-10-22', '21:55'))
    expect(due('loan_marina_code_complete')).toEqual(at('2026-10-19', '21:55'))
    expect(due('loan_marina_algoritmos')).toEqual(at('2026-10-17', '14:10'))
    expect(due('loan_pedrohenrique_algoritmos')).toEqual(
      at('2026-10-27', '21:55'),
    )
    expect(due('loan_anabeatriz_algoritmos')).toEqual(at('2026-10-21', '21:55'))
    expect(due('loan_rafael_algoritmos')).toEqual(at('2026-10-23', '21:55'))
  })

  it('renews only the two documented loans, and picks up 14 days before the due date', () => {
    const renewed = Object.entries(data.loans)
      .filter(([, l]) => l.renewalCount === 1)
      .map(([id]) => id)
      .sort()

    expect(renewed).toEqual([
      'loan_camila_codigo_limpo',
      'loan_julia_codigo_limpo',
    ])
    expect(data.loans.loan_julia_codigo_limpo).toMatchObject({
      pickedUpAt: at('2026-09-30', '21:55'),
      originalDueAt: at('2026-10-14', '21:55'),
    })
    expect(data.loans.loan_pedromartins_arquitetura!.pickedUpAt).toEqual(
      at('2026-10-07', '21:55'),
    )
  })

  it('never lands a due date on a Sunday or a holiday', () => {
    for (const [id, loan] of Object.entries(data.loans)) {
      if (!loan.dueAt) continue
      const day = loan.dueAt.toISOString().slice(0, 10)
      expect(loan.dueAt.getUTCDay() === 0, id).toBe(false)
      expect(nonWorkingDates.has(day), id).toBe(false)
    }
  })

  it('RET-4821 follows section 6.4 and links the fulfilled queue entry', () => {
    expect(data.loans.loan_ret4821).toMatchObject({
      status: 'awaiting_pickup',
      origin: 'queue',
      queueEntryId: 'qe_lucas_codigo_limpo',
      qrToken: 'q9Zr0bH6v3S1kT8xY2mW4pLc',
      requestedAt: at('2026-10-15', '09:30'),
      pickupDeadline: at('2026-10-19', '21:55'),
    })
    expect(data.queueEntries.qe_lucas_codigo_limpo).toMatchObject({
      status: 'fulfilled',
      loanId: 'loan_ret4821',
    })
  })

  it('makes QR tokens stable for the same secret, different otherwise, 24 chars', () => {
    const tokens = Object.values(data.loans).map((l) => l.qrToken as string)

    expect(new Set(tokens).size).toBe(tokens.length)
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{24}$/)

    const again = buildSeed({
      holidays,
      tokenSecret: 'test-secret',
      simulatedNow: true,
    })
    expect(again.loans.loan_diego_refatoracao!.qrToken).toBe(
      data.loans.loan_diego_refatoracao!.qrToken,
    )
    const other = buildSeed({
      holidays,
      tokenSecret: 'another-secret',
      simulatedNow: true,
    })
    expect(other.loans.loan_diego_refatoracao!.qrToken).not.toBe(
      data.loans.loan_diego_refatoracao!.qrToken,
    )
  })
})

describe('documents', () => {
  it('gives every user the documented identity fields', () => {
    expect(Object.keys(data.users)).toHaveLength(12)
    expect(data.users.uid_lucas).toMatchObject({
      role: 'student',
      matricula: '2412858',
      fullNameNormalized: 'lucas almeida',
      initials: 'LA',
      authEmail: '2412858@contas.uni-books.app',
      entryYear: 2024,
      course: 'Ciência da Computação',
    })
    expect(data.users.uid_ana).toMatchObject({
      role: 'librarian',
      matricula: '0900001',
      deskLabel: 'Balcão · Biblioteca (Praça Central)',
    })
    for (const user of Object.values(data.users)) {
      expect(user.matricula).toMatch(/^\d{7}$/)
      expect(user).not.toHaveProperty('password')
    }
  })

  it('gives every active student a confirmed e-mail, and the librarian none', () => {
    const students = Object.values(data.users).filter(
      (u) => u.role === 'student',
    )

    expect(students).toHaveLength(11)
    for (const student of students) {
      expect(student.status).toBe('active')
      const createdAt = student.createdAt as Date
      const verifiedAt = student.emailVerifiedAt as Date
      const minutes = (verifiedAt.getTime() - createdAt.getTime()) / 60_000
      // Lucas's time is the literal of section 6.4 (10:00); the others, +5 min.
      expect(minutes, String(student.matricula)).toBe(
        student.matricula === '2412858' ? 10 : 5,
      )
    }
    expect(data.users.uid_ana!.emailVerifiedAt).toBeUndefined()
    const written = toWrites(data).find((w) => w.path === 'users/uid_ana')
    expect(written!.data).not.toHaveProperty('emailVerifiedAt')
  })

  it('indexes every matrícula and e-mail to its user', () => {
    expect(data.matriculaIndex['2412858']).toMatchObject({
      uid: 'uid_lucas',
      role: 'student',
    })
    expect(data.emailIndex['lucas.almeida@edu.unifor.br']).toMatchObject({
      uid: 'uid_lucas',
    })
    expect(Object.keys(data.matriculaIndex)).toHaveLength(12)
    expect(Object.keys(data.emailIndex)).toHaveLength(12)
  })

  it('builds the searchText of Código Limpo exactly as section 6.4', () => {
    expect(data.books.book_codigo_limpo).toMatchObject({
      coverTone: 1,
      shelf: 'Estante 005.1',
      dataSource: 'mixed',
      googleBooks: { volumeId: null, lastSyncedAt: null, found: true },
      searchText:
        'codigo limpo habilidades praticas do agile software robert c. martin desenvolvimento de software linguagem de programacao 9788576082675',
    })
  })

  it('cycles coverTone from 1 to 6 in the order of table 6.2', () => {
    const tones = Object.values(data.books).map((b) => b.coverTone)

    expect(tones.slice(0, 8)).toEqual([1, 2, 3, 4, 5, 6, 1, 2])
  })

  it('puts simulatedNow only in the test environment', () => {
    const production = buildSeed({
      holidays,
      tokenSecret: 'test-secret',
      simulatedNow: false,
    })

    expect(data.settings.simulatedNow).toEqual(at('2026-10-15', '12:00'))
    expect(production.settings.simulatedNow).toBeNull()
  })

  it("creates Lucas's three folders and three saved books", () => {
    expect(data.folders.folder_ler_depois).toMatchObject({
      name: 'Ler depois',
      bookCount: 3,
    })
    expect(data.folders.folder_amei).toMatchObject({
      name: 'Amei!!!',
      bookCount: 0,
    })
    expect(data.folders.folder_tcc).toMatchObject({ name: 'TCC', bookCount: 0 })
    expect(Object.keys(data.savedBooks).sort()).toEqual([
      'book_algoritmos_3a',
      'book_codificador_limpo',
      'book_refatoracao',
    ])
    expect(
      Object.values(data.notifications)
        .map((n) => n.type)
        .sort(),
    ).toEqual(['due_reminder', 'pickup_ready', 'queue_turn'])
  })

  it('writes unique paths and no undefined values', () => {
    const writes = toWrites(data)
    const paths = writes.map((w) => w.path)

    expect(new Set(paths).size).toBe(paths.length)
    expect(paths).toContain('settings/library')
    expect(paths).toContain('holidays/2026')
    expect(paths).toContain('users/uid_lucas/notifications/notif_queue_turn')
    const hasUndefined = (value: unknown): boolean =>
      value === undefined ||
      (Array.isArray(value) && value.some(hasUndefined)) ||
      (!!value &&
        typeof value === 'object' &&
        !(value instanceof Date) &&
        Object.values(value).some(hasUndefined))
    for (const write of writes)
      expect(hasUndefined(write.data), write.path).toBe(false)
  })

  it('does not create collections nobody documented', () => {
    const collections = new Set(toWrites(data).map((w) => w.path.split('/')[0]))

    expect(collections).not.toContain('recesses')
    expect(collections).not.toContain('auditLog')
    expect(collections).not.toContain('emailTokens')
  })
})
