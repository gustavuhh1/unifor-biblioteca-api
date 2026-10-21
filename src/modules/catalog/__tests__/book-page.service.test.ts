import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'
import type { AppError } from '../../../shared/errors.js'

const h = vi.hoisted(() => ({
  db: undefined as unknown as FakeFirestore,
  circulation: vi.fn(),
}))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))
vi.mock('../repositories/student-circulation.repository.js', () => ({
  readStudentCirculation: h.circulation,
}))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { getBookPage } = await import('../services/book-page.service.js')
const { makeBook, makeCopy } = await import('./book.fixtures.js')

const STUDENT = { uid: 'uid_lucas', role: 'student' } as const
const LIBRARIAN = { uid: 'uid_ana', role: 'librarian' } as const

const FREE_STUDENT = { activeLoanCount: 4, activeQueueCount: 1, openLoans: [] }

function seedBook(overrides: Parameters<typeof makeBook>[0] = {}) {
  const book = makeBook({ id: 'book1', ...overrides })
  const data: Record<string, unknown> = { ...book }
  delete data.id
  h.db.put('books', 'book1', data)
}

async function catchError(promise: Promise<unknown>): Promise<AppError> {
  return (await promise.then(
    () => undefined,
    (error: unknown) => error,
  )) as AppError
}

beforeEach(() => {
  h.db = new Fake()
  h.circulation.mockReset().mockResolvedValue(FREE_STUDENT)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-21T15:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('página do livro (getBookPage)', () => {
  it('mostra os campos de exibição, a devolução prevista e a fila', async () => {
    seedBook({
      queueLength: 1,
      nextReturnAt: new Date('2026-10-28T00:55:00Z'),
    })

    const page = await getBookPage('book1', STUDENT)

    expect(page).toMatchObject({
      id: 'book1',
      title: 'Código Limpo',
      subtitle: 'habilidades práticas do agile software',
      authors: ['Robert C. Martin'],
      translators: ['Leandro Chu'],
      publisher: 'Alta Books',
      edition: 'revisada',
      year: 2011,
      language: 'Português',
      isbn: '9788576082675',
      cdu: '005.1',
      cutter: 'M386c',
      shelf: 'Estante 005.1',
      location: 'Biblioteca (Praça Central)',
      queueLength: 1,
      nextReturnAt: '2026-10-28T00:55:00.000Z',
      copiesTotal: 3,
      copiesAvailable: 0,
      unavailableForNewRequests: false,
    })
  })

  it('nunca expõe os campos internos', async () => {
    seedBook({ createdBy: 'uid_ana', removedBy: 'uid_x' } as never)

    const page = await getBookPage('book1', STUDENT)

    for (const field of [
      'searchText',
      'createdBy',
      'removedBy',
      'removedAt',
      'status',
      'googleBooks',
      'dataSource',
      'createdAt',
    ]) {
      expect(page).not.toHaveProperty(field)
    }
  })

  it('resume os exemplares com registro, formato e situação, sem os retirados do acervo', async () => {
    seedBook()
    const copyOf = (
      registration: string,
      status: 'reserved' | 'on_loan' | 'withdrawn',
    ) => makeCopy({ bookId: 'book1', registration, status })
    h.db.put('copies', 'c1', copyOf('46122', 'reserved'))
    h.db.put('copies', 'c2', copyOf('223223', 'on_loan'))
    h.db.put('copies', 'c3', copyOf('9', 'withdrawn'))
    h.db.put('copies', 'c4', makeCopy({ bookId: 'outro', registration: '1' }))

    const page = await getBookPage('book1', STUDENT)

    expect(page.copies).toEqual([
      { registration: '46122', format: 'Impresso', status: 'reserved' },
      { registration: '223223', format: 'Impresso', status: 'on_loan' },
    ])
  })

  it('devolve null nos campos opcionais que o livro não tem', async () => {
    seedBook({
      isbn: undefined,
      subtitle: undefined,
      translators: undefined,
      synopsis: undefined,
      nextReturnAt: undefined,
    })

    const page = await getBookPage('book1', STUDENT)

    expect(page).toMatchObject({
      isbn: null,
      subtitle: null,
      translators: [],
      synopsis: null,
      coverUrl: null,
      nextReturnAt: null,
    })
  })

  it('responde 404 para livro inexistente ou removido', async () => {
    seedBook({ status: 'removed' })

    for (const id of ['nao-existe', 'book1']) {
      expect(await catchError(getBookPage(id, STUDENT))).toMatchObject({
        status: 404,
        code: 'book_not_found',
      })
    }
  })

  describe('bloco de ação do aluno', () => {
    it('sugere pedir o empréstimo quando há exemplar disponível', async () => {
      seedBook({ copiesAvailable: 2, queueLength: 0 })

      const page = await getBookPage('book1', STUDENT)

      expect(page.action).toEqual({ suggestedAction: 'request', allowed: true })
    })

    it('sugere entrar na fila quando não há exemplar disponível', async () => {
      seedBook({ copiesAvailable: 0 })

      const page = await getBookPage('book1', STUDENT)

      expect(page.action).toEqual({
        suggestedAction: 'join_queue',
        allowed: true,
      })
    })

    it('bloqueia com "unavailable" no livro indisponível para novos pedidos', async () => {
      seedBook({ copiesAvailable: 0, unavailableForNewRequests: true })

      const page = await getBookPage('book1', STUDENT)

      expect(page.action).toEqual({
        suggestedAction: 'join_queue',
        allowed: false,
        blockedReason: 'unavailable',
      })
      expect(page.unavailableForNewRequests).toBe(true)
    })

    it('bloqueia com "overdue" para quem tem empréstimo atrasado', async () => {
      seedBook({ copiesAvailable: 1 })
      h.circulation.mockResolvedValue({
        ...FREE_STUDENT,
        openLoans: [
          {
            workId: 'calculo--stewart',
            status: 'active',
            dueAt: new Date('2026-10-10T17:10:00Z'),
          },
        ],
      })

      const page = await getBookPage('book1', STUDENT)

      expect(page.action).toMatchObject({
        allowed: false,
        blockedReason: 'overdue',
      })
    })

    it('bloqueia com "same_title" para quem já tem o título', async () => {
      seedBook({ copiesAvailable: 1 })
      h.circulation.mockResolvedValue({
        ...FREE_STUDENT,
        openLoans: [
          { workId: 'codigo-limpo--martin', status: 'awaiting_pickup' },
        ],
      })

      const page = await getBookPage('book1', STUDENT)

      expect(page.action).toMatchObject({
        suggestedAction: 'request',
        allowed: false,
        blockedReason: 'same_title',
      })
    })

    it('usa os limites de settings/library', async () => {
      seedBook({ copiesAvailable: 1 })
      h.db.put('settings', 'library', { maxActiveLoans: 4, maxActiveQueues: 7 })

      const page = await getBookPage('book1', STUDENT)

      expect(page.action).toMatchObject({
        allowed: false,
        blockedReason: 'loan_limit',
      })
    })

    it('bloqueia a fila com "queue_limit" no limite de filas', async () => {
      seedBook({ copiesAvailable: 0 })
      h.circulation.mockResolvedValue({ ...FREE_STUDENT, activeQueueCount: 7 })

      const page = await getBookPage('book1', STUDENT)

      expect(page.action).toMatchObject({
        suggestedAction: 'join_queue',
        allowed: false,
        blockedReason: 'queue_limit',
      })
    })

    it('lê os dados do aluno que pediu a página', async () => {
      seedBook()

      await getBookPage('book1', STUDENT)

      expect(h.circulation).toHaveBeenCalledWith('uid_lucas')
    })
  })

  it('para o bibliotecário o bloco de ação é null e nada do aluno é lido', async () => {
    seedBook()

    const page = await getBookPage('book1', LIBRARIAN)

    expect(page.action).toBeNull()
    expect(h.circulation).not.toHaveBeenCalled()
  })
})
