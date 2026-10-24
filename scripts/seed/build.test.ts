import { beforeAll, describe, expect, it } from 'vitest'
import { buildSeed, toWrites, type SeedData } from './build.js'
import {
  buildLibraryCalendar,
  isOpenDay,
  lateBusinessDays,
  type LibraryCalendar,
} from '../../src/shared/calendar/business-days.js'
import {
  atLocalTime,
  localDate,
  plusDays,
} from '../../src/shared/calendar/dates.js'
import {
  holidayDates,
  type HolidaysDocument,
} from '../../src/shared/calendar/holidays-api.js'
import { DEFAULT_OPENING_HOURS } from '../../src/shared/library.js'
import { loadHolidaysFile } from './holidays.js'

const BASE_DAY = '2026-10-15'

let data: SeedData
let holidays: HolidaysDocument
// Calendário da biblioteca com os feriados do seed (sem recesso).
let calendar: LibraryCalendar

// Primeiro dia em que a biblioteca abre, a partir de `from` (inclusive).
function firstOpenDay(from: string): string {
  let day = from
  while (!isOpenDay(day, calendar)) day = plusDays(day, 1)
  return day
}

beforeAll(async () => {
  holidays = await loadHolidaysFile(2026)
  calendar = buildLibraryCalendar({
    openingHours: DEFAULT_OPENING_HOURS,
    holidays: holidayDates(holidays),
    recesses: [],
  })
  // O dia de exemplo dos documentos (15/10): o deslocamento é zero, então as
  // tabelas das seções 6.1 a 6.5 podem ser conferidas data por data.
  data = buildSeed({ holidays, tokenSecret: 'test-secret', today: BASE_DAY })
})

describe('contadores (seção 8, passo 6)', () => {
  it('Lucas tem 4 de 10 empréstimos, 1 fila e os 17 livros lidos fixos', () => {
    expect(data.users.uid_lucas).toMatchObject({
      activeLoanCount: 4,
      activeQueueCount: 1,
      openFineTotalCents: 0,
      booksReadByYear: { '2026': 17 },
    })
  })

  it('Marina tem 3 de 10 empréstimos e 1 fila', () => {
    expect(data.users.uid_marina).toMatchObject({
      activeLoanCount: 3,
      activeQueueCount: 1,
    })
  })

  it('conta multas em aberto e livros devolvidos só a partir dos dados carregados', () => {
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

  it('as multas em aberto somam R$ 28,00 em 4 alunos', () => {
    const open = Object.values(data.fines).filter((f) => f.status === 'open')

    expect(open).toHaveLength(4)
    expect(open.reduce((sum, f) => sum + (f.amountCents ?? 0), 0)).toBe(2800)
  })

  it('Código Limpo: 3 exemplares, nenhum disponível, 1 na fila, próxima devolução 28/10', () => {
    expect(data.books.book_codigo_limpo).toMatchObject({
      copiesTotal: 3,
      copiesAvailable: 0,
      queueLength: 1,
      nextReturnAt: atLocalTime('2026-10-28', '21:55'),
    })
  })

  it('Arquitetura Limpa tem 4 na fila e está indisponível para novos pedidos', () => {
    expect(data.books.book_arquitetura_limpa).toMatchObject({
      queueLength: 4,
      unavailableForNewRequests: true,
    })
  })

  it('Refatoração tem 2 na estante; Algoritmos tem 4 emprestados em 2 edições, sem fila', () => {
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

  it('Engenharia de Software tem 2 na fila, em ordem', () => {
    const waiting = Object.values(data.queueEntries)
      .filter((q) => q.bookId === 'book_engenharia_de_software')
      .sort((a, b) => (a.order as number) - (b.order as number))

    expect(waiting.map((q) => q.studentUid)).toEqual([
      'uid_beatriz',
      'uid_diego',
    ])
  })
})

describe('consistência dos dados', () => {
  it('todo exemplar emprestado ou reservado aponta para um empréstimo desse exemplar', () => {
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

  it('nunca dá a um aluno dois empréstimos ativos ou pendentes do mesmo título', () => {
    const seen = new Set<string>()
    for (const loan of Object.values(data.loans)) {
      if (loan.status === 'returned') continue
      const key = `${loan.studentUid}|${loan.workId}`
      expect(seen.has(key), key).toBe(false)
      seen.add(key)
    }
  })

  it('tem registros de exemplar e códigos de retirada únicos', () => {
    const registrations = Object.values(data.copies).map((c) => c.registration)
    const codes = Object.values(data.loans).map((l) => l.pickupCode as string)

    expect(new Set(registrations).size).toBe(registrations.length)
    expect(new Set(codes).size).toBe(codes.length)
    expect(data.loans.loan_ret4821!.pickupCode).toBe('RET-4821')
    expect(data.loans.loan_beatriz_padroes!.pickupCode).toBe('RET-4817')
    expect(data.loans.loan_rafael_calculo2!.pickupCode).toBe('RET-4809')
  })

  it('dá aos empréstimos os vencimentos documentados', () => {
    const due = (id: string) => data.loans[id]!.dueAt
    // Seções 6.3 e 6.5.
    expect(due('loan_lucas_engenharia')).toEqual(
      atLocalTime('2026-10-16', '21:55'),
    )
    expect(due('loan_lucas_redes')).toEqual(atLocalTime('2026-10-20', '21:55'))
    expect(due('loan_lucas_estruturas')).toEqual(
      atLocalTime('2026-10-23', '21:55'),
    )
    expect(due('loan_marina_calculo1')).toEqual(
      atLocalTime('2026-10-10', '14:10'),
    )
    expect(due('loan_pedromartins_arquitetura')).toEqual(
      atLocalTime('2026-10-21', '21:55'),
    )
    expect(due('loan_julia_codigo_limpo')).toEqual(
      atLocalTime('2026-10-28', '21:55'),
    )
    expect(due('loan_camila_codigo_limpo')).toEqual(
      atLocalTime('2026-11-03', '21:55'),
    )
    expect(due('loan_diego_refatoracao')).toEqual(
      atLocalTime('2026-10-22', '21:55'),
    )
    expect(due('loan_marina_code_complete')).toEqual(
      atLocalTime('2026-10-19', '21:55'),
    )
    expect(due('loan_marina_algoritmos')).toEqual(
      atLocalTime('2026-10-17', '14:10'),
    )
    expect(due('loan_pedrohenrique_algoritmos')).toEqual(
      atLocalTime('2026-10-27', '21:55'),
    )
    expect(due('loan_anabeatriz_algoritmos')).toEqual(
      atLocalTime('2026-10-21', '21:55'),
    )
    expect(due('loan_rafael_algoritmos')).toEqual(
      atLocalTime('2026-10-23', '21:55'),
    )
  })

  it('nunca dá um vencimento em domingo, feriado ou recesso, qualquer que seja o dia em que o seed roda', () => {
    // Um mês de "hoje" diferentes: passa por domingos e pelo feriado de 02/11.
    for (let offset = 0; offset < 31; offset++) {
      const today = plusDays(BASE_DAY, offset)
      const seed = buildSeed({ holidays, tokenSecret: 'test-secret', today })
      for (const [id, loan] of Object.entries(seed.loans)) {
        for (const due of [loan.dueAt, loan.originalDueAt]) {
          if (!due) continue
          expect(
            isOpenDay(localDate(due), calendar),
            `${id} vence em ${localDate(due)} (seed de ${today})`,
          ).toBe(true)
        }
      }
    }
  })

  it('renova só os dois empréstimos documentados e retira 14 dias antes do vencimento', () => {
    const renewed = Object.entries(data.loans)
      .filter(([, l]) => l.renewalCount === 1)
      .map(([id]) => id)
      .sort()

    expect(renewed).toEqual([
      'loan_camila_codigo_limpo',
      'loan_julia_codigo_limpo',
    ])
    expect(data.loans.loan_julia_codigo_limpo).toMatchObject({
      pickedUpAt: atLocalTime('2026-09-30', '21:55'),
      originalDueAt: atLocalTime('2026-10-14', '21:55'),
    })
    expect(data.loans.loan_pedromartins_arquitetura!.pickedUpAt).toEqual(
      atLocalTime('2026-10-07', '21:55'),
    )
  })

  it('RET-4821 segue a seção 6.4 e liga a vez cumprida da fila', () => {
    expect(data.loans.loan_ret4821).toMatchObject({
      status: 'awaiting_pickup',
      origin: 'queue',
      queueEntryId: 'qe_lucas_codigo_limpo',
      qrToken: 'q9Zr0bH6v3S1kT8xY2mW4pLc',
      requestedAt: atLocalTime('2026-10-15', '09:30'),
      pickupDeadline: atLocalTime('2026-10-19', '21:55'),
    })
    expect(data.queueEntries.qe_lucas_codigo_limpo).toMatchObject({
      status: 'fulfilled',
      loanId: 'loan_ret4821',
    })
  })

  it('deixa os tokens do QR estáveis para o mesmo segredo, diferentes para outro, com 24 caracteres', () => {
    const tokens = Object.values(data.loans).map((l) => l.qrToken as string)

    expect(new Set(tokens).size).toBe(tokens.length)
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{24}$/)

    const again = buildSeed({
      holidays,
      tokenSecret: 'test-secret',
      today: BASE_DAY,
    })
    expect(again.loans.loan_diego_refatoracao!.qrToken).toBe(
      data.loans.loan_diego_refatoracao!.qrToken,
    )
    const other = buildSeed({
      holidays,
      tokenSecret: 'another-secret',
      today: BASE_DAY,
    })
    expect(other.loans.loan_diego_refatoracao!.qrToken).not.toBe(
      data.loans.loan_diego_refatoracao!.qrToken,
    )
  })
})

describe('documentos', () => {
  it('dá a todo usuário os campos de identidade documentados', () => {
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

  it('dá a todo aluno ativo um e-mail confirmado e ao bibliotecário nenhum', () => {
    const students = Object.values(data.users).filter(
      (u) => u.role === 'student',
    )

    expect(students).toHaveLength(11)
    for (const student of students) {
      expect(student.status).toBe('active')
      const createdAt = student.createdAt as Date
      const verifiedAt = student.emailVerifiedAt as Date
      const minutes = (verifiedAt.getTime() - createdAt.getTime()) / 60_000
      // O horário do Lucas é o valor fixo da seção 6.4 (10:00); os outros, +5 min.
      expect(minutes, String(student.matricula)).toBe(
        student.matricula === '2412858' ? 10 : 5,
      )
    }
    expect(data.users.uid_ana!.emailVerifiedAt).toBeUndefined()
    const written = toWrites(data).find((w) => w.path === 'users/uid_ana')
    expect(written!.data).not.toHaveProperty('emailVerifiedAt')
  })

  it('indexa toda matrícula e e-mail ao seu usuário', () => {
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

  it('monta o searchText de Código Limpo exatamente como a seção 6.4', () => {
    expect(data.books.book_codigo_limpo).toMatchObject({
      coverTone: 1,
      shelf: 'Estante 005.1',
      dataSource: 'mixed',
      externalMetadata: { sources: [], lastSyncedAt: null, found: true },
      searchText:
        'codigo limpo habilidades praticas do agile software robert c. martin desenvolvimento de software linguagem de programacao 9788576082675',
    })
  })

  it('alterna o coverTone de 1 a 6 na ordem da tabela 6.2', () => {
    const tones = Object.values(data.books).map((b) => b.coverTone)

    expect(tones.slice(0, 8)).toEqual([1, 2, 3, 4, 5, 6, 1, 2])
  })

  it('não tem "hoje" simulado nas configurações: as datas são reais', () => {
    expect(data.settings).not.toHaveProperty('simulatedNow')
  })

  it('cria as três pastas e os três livros salvos do Lucas', () => {
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

  it('grava caminhos únicos e nenhum valor undefined', () => {
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

  it('não cria coleções que ninguém documentou', () => {
    const collections = new Set(toWrites(data).map((w) => w.path.split('/')[0]))

    expect(collections).not.toContain('recesses')
    expect(collections).not.toContain('auditLog')
    expect(collections).not.toContain('emailTokens')
  })
})

// O seed segue o dia em que roda: seja qual for esse dia, as situações das
// seções 6.1 a 6.5 precisam valer (e não as datas de exemplo).
describe.each([
  ['the example day (Thursday)', '2026-10-15'],
  ['a Monday', '2026-10-19'],
  ['a Wednesday', '2026-10-21'],
  ['a Saturday', '2026-10-24'],
  ['a Sunday', '2026-10-25'],
  ['another month', '2026-12-09'],
  ['next year', '2027-02-17'],
])('situações quando o seed roda em %s', (_label, today) => {
  let run: SeedData

  beforeAll(() => {
    run = buildSeed({ holidays, tokenSecret: 'test-secret', today })
  })

  const day = (date: Date | undefined) => localDate(date!)

  it('mantém o Lucas com 4 de 10 e o pedido RET-4821 dentro do prazo de retirada', () => {
    expect(run.users.uid_lucas).toMatchObject({ activeLoanCount: 4 })
    const order = run.loans.loan_ret4821!
    expect(order.status).toBe('awaiting_pickup')
    expect(day(order.pickupDeadline as Date)).toBe(plusDays(today, 4))
    expect(day(order.requestedAt as Date)).toBe(today)
    expect((order.pickupDeadline as Date).getTime()).toBeGreaterThan(
      (order.requestedAt as Date).getTime(),
    )
  })

  it('mantém a Marina com um empréstimo atrasado e uma multa contando', () => {
    expect(run.users.uid_marina).toMatchObject({ activeLoanCount: 3 })
    const loan = run.loans.loan_marina_calculo1!
    expect(loan.status).toBe('active')
    expect(day(loan.dueAt)).toBe(plusDays(today, -5))
    expect(run.fines.fine_marina_calculo1).toMatchObject({
      status: 'accruing',
      loanId: 'loan_marina_calculo1',
    })
    // Cerca de 3 dias úteis (um feriado ou um fim de semana pode mudar um pouco).
    expect(
      lateBusinessDays(
        loan.dueAt!,
        atLocalTime(today, '12:00'),
        holidayDates(holidays),
      ),
    ).toBeGreaterThanOrEqual(1)
  })

  it('mantém a Beatriz no último dia de retirada e o Rafael com prazo até amanhã', () => {
    expect(day(run.loans.loan_beatriz_padroes!.pickupDeadline as Date)).toBe(
      today,
    )
    expect(day(run.loans.loan_rafael_calculo2!.pickupDeadline as Date)).toBe(
      plusDays(today, 1),
    )
  })

  it('mantém Engenharia de Software do Lucas perto de vencer, com 2 pessoas na fila', () => {
    // Vence amanhã; se amanhã a biblioteca fecha (domingo, feriado), no próximo
    // dia aberto.
    expect(day(run.loans.loan_lucas_engenharia!.dueAt)).toBe(
      firstOpenDay(plusDays(today, 1)),
    )
    expect(run.books.book_engenharia_de_software).toMatchObject({
      queueLength: 2,
    })
  })

  it('mantém Arquitetura Limpa com 4 na fila e as multas em aberto fixas', () => {
    expect(run.books.book_arquitetura_limpa).toMatchObject({ queueLength: 4 })
    const open = Object.values(run.fines).filter((f) => f.status === 'open')
    expect(open.map((f) => f.amountCents).sort()).toEqual([1000, 400, 600, 800])
  })

  it('mantém as datas em ordem: nada vence ou é devolvido antes de ser pedido, e as devoluções estão no passado', () => {
    for (const [id, loan] of Object.entries(run.loans)) {
      const requested = (loan.requestedAt as Date).getTime()
      if (loan.dueAt)
        expect(loan.dueAt.getTime(), id).toBeGreaterThan(requested)
      if (loan.returnedAt) {
        expect(loan.returnedAt.getTime(), id).toBeGreaterThan(requested)
        expect(day(loan.returnedAt) < today, id).toBe(true)
      }
    }
  })

  it('mantém os textos dos avisos de acordo com os prazos', () => {
    const pickup = run.notifications.notif_pickup_ready!.body as string
    const reminder = run.notifications.notif_due_reminder!.body as string

    expect(pickup).toMatch(
      /^Retire até (dom|seg|ter|qua|qui|sex|sáb), \d{2}\/\d{2}\. Código RET-4821\.$/,
    )
    expect(reminder).toContain('Há 2 pessoas na fila')
  })
})
