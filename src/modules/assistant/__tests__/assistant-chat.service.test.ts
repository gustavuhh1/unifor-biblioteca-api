import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'
import type { GeminiContent, GeminiRequest } from '../gemini/gemini.client.js'

const h = vi.hoisted(() => ({
  db: undefined as unknown as FakeFirestore,
  generate: vi.fn(),
}))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))
vi.mock('../gemini/gemini.client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../gemini/gemini.client.js')>()),
  generateContent: h.generate,
}))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { invalidateCatalogCache } =
  await import('../../../shared/catalog-cache.js')
const { GeminiError } = await import('../gemini/gemini.client.js')
const { ASSISTANT_DISCLAIMER, ASSISTANT_ERROR_TEXT } =
  await import('../assistant.constants.js')
const { listConversation, sendMessage } =
  await import('../services/assistant-chat.service.js')
const { makeLoan } = await import('../../loans/__tests__/loan.fixtures.js')
const {
  ACTIONS_PATH,
  MESSAGES_PATH,
  NOW,
  STUDENT_UID,
  putBook,
  putMessage,
  seedStudent,
} = await import('./assistant.fixtures.js')

// Resposta do modelo só com texto.
const text = (value: string): GeminiContent => ({
  role: 'model',
  parts: [{ text: value }],
})
// Resposta do modelo pedindo uma ferramenta.
const call = (name: string, args: Record<string, unknown>): GeminiContent => ({
  role: 'model',
  parts: [{ functionCall: { name, args } }],
})
// Tudo o que foi mandado ao Gemini, como texto.
const sentToGemini = () =>
  JSON.stringify(
    h.generate.mock.calls.map(([request]) => request as GeminiRequest),
  )

beforeEach(() => {
  h.db = new Fake()
  h.generate.mockReset()
  invalidateCatalogCache()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  seedStudent(h.db)
})

describe('sendMessage: conversa com o Assistente (RF-ASS-01 a RF-ASS-07)', () => {
  it('grava a pergunta e a resposta e devolve o aviso de que a IA pode errar', async () => {
    h.generate.mockResolvedValueOnce(
      text('Para pedir, abra a página do livro.'),
    )

    const result = await sendMessage(STUDENT_UID, 'Como peço um livro?')

    expect(result.disclaimer).toBe(ASSISTANT_DISCLAIMER)
    expect(result.question).toMatchObject({
      sender: 'student',
      text: 'Como peço um livro?',
    })
    expect(result.reply).toMatchObject({
      sender: 'assistant',
      text: 'Para pedir, abra a página do livro.',
      error: false,
    })
    expect(h.db.all(MESSAGES_PATH)).toHaveLength(2)
  })

  it('busca no acervo pela ferramenta e mostra os livros como cartões', async () => {
    putBook(h.db, 'b1', { title: 'Código Limpo' })
    h.generate
      .mockResolvedValueOnce(call('search_catalog', { query: 'código limpo' }))
      .mockResolvedValueOnce(text('Achei o Código Limpo.'))

    const result = await sendMessage(STUDENT_UID, 'Tem Código Limpo?')

    expect(result.reply.suggestedBooks.map((book) => book.id)).toEqual(['b1'])
    const second = h.generate.mock.calls[1]![0] as GeminiRequest
    const toolAnswer = second.contents.at(-1)?.parts[0]?.functionResponse
    expect(toolAnswer?.name).toBe('search_catalog')
    expect(JSON.stringify(toolAnswer?.response)).toContain('Código Limpo')
  })

  it('prepara o pedido e anexa a ação à resposta, sem executar', async () => {
    putBook(h.db, 'b1')
    h.generate
      .mockResolvedValueOnce(call('propose_loan', { bookId: 'b1' }))
      .mockResolvedValueOnce(text('Confirme no cartão para eu pedir.'))

    const result = await sendMessage(STUDENT_UID, 'Pede pra mim')

    expect(result.reply.action).toMatchObject({
      type: 'request_loan',
      status: 'proposed',
    })
    expect(h.db.all(ACTIONS_PATH)).toHaveLength(1)
    expect(h.db.all('loans')).toEqual([])
  })

  it('explica o bloqueio quando a regra impede a ação', async () => {
    putBook(h.db, 'b1')
    h.db.put('users', STUDENT_UID, {
      ...h.db.read('users', STUDENT_UID),
      activeLoanCount: 10,
    })
    h.generate
      .mockResolvedValueOnce(call('propose_loan', { bookId: 'b1' }))
      .mockResolvedValueOnce(text('Você atingiu o limite de livros.'))

    const result = await sendMessage(STUDENT_UID, 'Pede pra mim')

    expect(result.reply.action).toMatchObject({
      status: 'blocked',
      blockedReason: 'loan_limit',
    })
    expect(result.reply.blockedReason).toContain('limite de livros')
  })

  it('sugere pelo histórico de leitura (RF-ASS-03)', async () => {
    putBook(h.db, 'lido', { workId: 'w-lido', subjects: ['Software'] })
    putBook(h.db, 'novo', { workId: 'w-novo', subjects: ['Software'] })
    h.db.put(
      'loans',
      'l1',
      makeLoan({
        bookId: 'lido',
        workId: 'w-lido',
        status: 'returned',
        returnedAt: NOW,
      }),
    )
    h.generate
      .mockResolvedValueOnce(call('recommend_from_history', {}))
      .mockResolvedValueOnce(text('Pelo que você leu, veja este.'))

    const result = await sendMessage(STUDENT_UID, 'O que eu leio agora?')

    expect(result.reply.suggestedBooks.map((book) => book.id)).toEqual(['novo'])
  })

  it('não manda ao Gemini matrícula, nome, e-mail nem o uid (RF-ASS-07)', async () => {
    putBook(h.db, 'b1')
    h.db.put('loans', 'l1', makeLoan({ status: 'returned', returnedAt: NOW }))
    h.generate
      .mockResolvedValueOnce(call('recommend_from_history', {}))
      .mockResolvedValueOnce(call('propose_loan', { bookId: 'b1' }))
      .mockResolvedValueOnce(text('Pronto.'))

    await sendMessage(STUDENT_UID, 'Me ajuda')

    const sent = sentToGemini()
    for (const personal of [
      '2412858',
      'Lucas Almeida',
      'lucas@edu.unifor.br',
      STUDENT_UID,
    ]) {
      expect(sent).not.toContain(personal)
    }
  })

  it('ferramenta desconhecida recebe erro, e a conversa continua', async () => {
    h.generate
      .mockResolvedValueOnce(call('apagar_tudo', {}))
      .mockResolvedValueOnce(text('Não posso fazer isso.'))

    const result = await sendMessage(STUDENT_UID, 'Apaga tudo')

    const second = h.generate.mock.calls[1]![0] as GeminiRequest
    expect(
      second.contents.at(-1)?.parts[0]?.functionResponse?.response,
    ).toEqual({ error: 'Ferramenta ou argumento inválido.' })
    expect(result.reply.error).toBe(false)
  })

  it('se o Gemini falhar, responde com erro e a pergunta fica salva (A49)', async () => {
    h.generate.mockRejectedValueOnce(new GeminiError('fora do ar'))

    const result = await sendMessage(STUDENT_UID, 'Oi')

    expect(result.reply).toMatchObject({
      text: ASSISTANT_ERROR_TEXT,
      error: true,
    })
    expect(h.db.all(MESSAGES_PATH)).toHaveLength(2)
  })

  it('não entra em laço quando o Gemini só pede ferramentas', async () => {
    h.generate.mockResolvedValue(call('search_catalog', { query: 'x' }))

    const result = await sendMessage(STUDENT_UID, 'Oi')

    expect(result.reply.error).toBe(true)
    expect(h.generate).toHaveBeenCalledTimes(5)
  })
})

describe('listConversation: a conversa do aluno (RF-ASS-05)', () => {
  it('devolve as mensagens da mais antiga para a mais nova, com o aviso', async () => {
    putMessage(h.db, 'm1', {
      text: 'Primeira',
      createdAt: new Date(NOW.getTime() - 2000),
    })
    putMessage(h.db, 'm2', {
      sender: 'assistant',
      text: 'Segunda',
      createdAt: new Date(NOW.getTime() - 1000),
    })

    const result = await listConversation(STUDENT_UID)

    expect(result.disclaimer).toBe(ASSISTANT_DISCLAIMER)
    expect(result.items.map((item) => item.text)).toEqual([
      'Primeira',
      'Segunda',
    ])
  })
})
