import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'
import {
  COLLECTIONS,
  SETTINGS_DOC_ID,
} from '../../../shared/firestore/collections.js'
import {
  BOOK_STATUS,
  LOAN_STATUS,
  type BookRecord,
  type Loan,
} from '../../../shared/types/index.js'
import { makeLoan, STUDENT_UID } from '../../loans/__tests__/loan.fixtures.js'
import { putBook } from '../../saved/__tests__/saved.fixtures.js'
import {
  RECOMMENDATIONS_CACHE_HOURS,
  RECOMMENDATIONS_LIMIT,
} from '../recommendations.constants.js'
import { recommendationsResponseSchema } from '../schemas/response.schemas.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))
vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))
const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { listRecommendations } =
  await import('../services/recommendations.service.js')
const repository = await import('../repositories/recommendations.repository.js')
const booksRepository =
  await import('../../catalog/repositories/books.repository.js')
const similarity = await import('../../../shared/rules/book-similarity.js')
const AT = new Date('2026-10-26T12:00:00Z')

const book = (id: string, fields: Partial<BookRecord> = {}) =>
  putBook(h.db, id, {
    workId: `w-${id}`,
    title: `Livro ${id}`,
    subjects: ['Software'],
    authors: [],
    ...fields,
  })
const loan = (id: string, fields: Partial<Loan> = {}) =>
  h.db.put(
    COLLECTIONS.loans,
    id,
    makeLoan({
      bookId: id,
      workId: `w-${id}`,
      status: LOAN_STATUS.returned,
      returnedAt: AT,
      ...fields,
    }),
  )
const ids = (result: Awaited<ReturnType<typeof listRecommendations>>) =>
  result.items.map(({ book }) => book.id)

beforeEach(() => {
  h.db = new Fake()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AT)
})
afterEach(() => vi.useRealTimers())

describe('Recomendados para você (RF-ASS-03)', () => {
  it('escolhe até seis livros por semelhança, explica os motivos e grava o cache com as datas do documento', async () => {
    book('lido', { title: 'Engenharia de Software' })
    loan('lido')
    for (let i = 0; i < 8; i++) book(`s${i}`)
    const result = await listRecommendations(STUDENT_UID)
    expect(ids(result)).toEqual(['s0', 's1', 's2', 's3', 's4', 's5'])
    expect(result.items).toHaveLength(RECOMMENDATIONS_LIMIT)
    expect(result.reasonText).toBe('Pelo que você mais leu em Software')
    expect(
      result.items.every(
        (item) => item.reasonText === 'Porque você leu Engenharia de Software',
      ),
    ).toBe(true)
    expect(result.generatedAt).toBe(AT.toISOString())
    expect(result.validUntil).toBe('2026-10-27T12:00:00.000Z')
    expect(recommendationsResponseSchema.safeParse(result).success).toBe(true)
    expect(h.db.read(COLLECTIONS.recommendations, STUDENT_UID)).toEqual({
      bookIds: ids(result),
      reasonText: result.reasonText,
      generatedAt: AT,
      validUntil: new Date(result.validUntil),
      createdAt: AT,
      updatedAt: AT,
    })
  })

  it('na segunda chamada preserva os ids e a ordem, sem escolher candidatos novos nem gravar de novo', async () => {
    book('lido')
    loan('lido')
    book('a')
    book('b')
    const select = vi.spyOn(booksRepository, 'listActive')
    const save = vi.spyOn(repository, 'save')
    const first = await listRecommendations(STUDENT_UID)
    book('a', { title: 'Zeta', copiesAvailable: 2 })
    book('novo', { title: 'A melhor sugestão' })
    const rank = vi.spyOn(similarity, 'recommendFromHistory')
    vi.setSystemTime(new Date('2026-10-27T11:59:59.999Z'))
    const second = await listRecommendations(STUDENT_UID)
    expect(ids(second)).toEqual(ids(first))
    expect(second.items[0]?.book.copiesAvailable).toBe(2)
    expect(second.generatedAt).toBe(first.generatedAt)
    expect(second.validUntil).toBe(first.validUntil)
    expect(select).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledTimes(1)
    // No cache, a regra recebe um livro por vez apenas para reconstruir o motivo.
    expect(
      rank.mock.calls.map(([, candidates]) => candidates.map(({ id }) => id)),
    ).toEqual([['a'], ['b']])
  })

  it('recalcula exatamente no vencimento de 24h, com nova validade', async () => {
    book('lido')
    loan('lido')
    book('b')
    const select = vi.spyOn(booksRepository, 'listActive')
    await listRecommendations(STUDENT_UID)
    book('a')
    vi.setSystemTime(new Date('2026-10-27T12:00:00Z'))
    const result = await listRecommendations(STUDENT_UID)
    expect(ids(result)).toEqual(['a', 'b'])
    expect(select).toHaveBeenCalledTimes(2)
    expect(result.generatedAt).toBe('2026-10-27T12:00:00.000Z')
    expect(result.validUntil).toBe('2026-10-28T12:00:00.000Z')
    expect(
      h.db.read(COLLECTIONS.recommendations, STUDENT_UID)?.bookIds,
    ).toEqual(['a', 'b'])
  })

  it('retira do cache livros removidos, inexistentes, fechados a pedidos e obras pegas depois, sem preencher vagas', async () => {
    book('lido')
    loan('lido')
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) book(id)
    await listRecommendations(STUDENT_UID)
    book('a', { status: BOOK_STATUS.removed })
    await h.db.doc(COLLECTIONS.books, 'b').delete()
    book('c', { unavailableForNewRequests: true })
    loan('outra-edicao', { workId: 'w-d', status: LOAN_STATUS.awaitingPickup })
    const result = await listRecommendations(STUDENT_UID)
    expect(ids(result)).toEqual(['e', 'f'])
    expect(
      h.db.read(COLLECTIONS.recommendations, STUDENT_UID)?.bookIds,
    ).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  it('exclui obras de qualquer situação do empréstimo, edições repetidas e livros indisponíveis na geração', async () => {
    book('base')
    loan('base')
    for (const status of Object.values(LOAN_STATUS)) {
      book(status)
      loan(status, { status })
      book(`edicao-${status}`, { workId: `w-${status}` })
    }
    book('removido', { status: BOOK_STATUS.removed })
    book('bloqueado', { unavailableForNewRequests: true })
    book('sem-semelhanca', { subjects: ['Matemática'] })
    book('a')
    book('b', { workId: 'w-a' })
    expect(ids(await listRecommendations(STUDENT_UID))).toEqual(['a'])
  })

  it('o histórico de um livro removido ainda fundamenta sugestões, com o título que mais pesou', async () => {
    book('antigo', { title: 'Software antigo', subjects: ['Software'] })
    loan('antigo', { returnedAt: new Date('2026-10-20') })
    book('lido', {
      title: 'Arquitetura Limpa',
      subjects: ['Software', 'Arquitetura'],
      status: BOOK_STATUS.removed,
    })
    loan('lido')
    book('novo', { subjects: ['Software', 'Arquitetura'] })
    const result = await listRecommendations(STUDENT_UID)
    expect(result.items[0]?.reasonText).toBe(
      'Porque você leu Arquitetura Limpa',
    )
  })

  it('sem devoluções retorna lista vazia e motivo nulo, sem gravar cache', async () => {
    book('lido')
    loan('lido', { status: LOAN_STATUS.active })
    book('a')
    const select = vi.spyOn(booksRepository, 'listActive')
    const first = await listRecommendations(STUDENT_UID)
    expect(select).not.toHaveBeenCalled()
    expect(first).toMatchObject({ items: [], reasonText: null })
    expect(h.db.read(COLLECTIONS.recommendations, STUDENT_UID)).toBeUndefined()
    // A primeira devolução já gera sugestões na chamada seguinte.
    loan('lido')
    expect(ids(await listRecommendations(STUDENT_UID))).toEqual(['a'])
  })

  it('não mistura histórico nem cache de alunos diferentes', async () => {
    book('lido')
    loan('lido')
    book('a')
    const first = await listRecommendations(STUDENT_UID)
    expect(ids(first)).toEqual(['a'])
    expect(await listRecommendations('outro-aluno')).toMatchObject({
      items: [],
      reasonText: null,
    })
    expect(
      h.db.read(COLLECTIONS.recommendations, STUDENT_UID)?.bookIds,
    ).toEqual(['a'])
  })

  it('considera obras anteriores aos 200 empréstimos mais recentes', async () => {
    book('base')
    loan('base', { requestedAt: new Date('2025-01-01') })
    book('antigo')
    loan('antigo', {
      status: LOAN_STATUS.cancelled,
      requestedAt: new Date('2025-01-01'),
    })
    for (let i = 0; i < 201; i++)
      loan(`recente-${i}`, { status: LOAN_STATUS.active })
    book('novo')
    expect(ids(await listRecommendations(STUDENT_UID))).toEqual(['novo'])
  })

  it('usa o relógio simulado e converte os Timestamps do cache', async () => {
    const simulated = new Date('2026-10-15T12:00:00Z')
    h.db.put(COLLECTIONS.settings, SETTINGS_DOC_ID, { simulatedNow: simulated })
    const first = await listRecommendations(STUDENT_UID)
    expect(first.generatedAt).toBe(simulated.toISOString())
    const validUntil = new Date(first.validUntil)
    expect((validUntil.getTime() - simulated.getTime()) / 3_600_000).toBe(
      RECOMMENDATIONS_CACHE_HOURS,
    )
    h.db.put(COLLECTIONS.recommendations, STUDENT_UID, {
      bookIds: [],
      reasonText: null,
      generatedAt: Timestamp.fromDate(simulated),
      validUntil: Timestamp.fromDate(validUntil),
    })
    const save = vi.spyOn(repository, 'save')
    expect(await listRecommendations(STUDENT_UID)).toEqual(first)
    expect(save).not.toHaveBeenCalled()
  })
})
