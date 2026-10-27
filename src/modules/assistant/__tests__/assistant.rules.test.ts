import { describe, expect, it } from 'vitest'
import { DEFAULT_LOAN_RULES } from '../../../shared/library.js'
import { DEFAULT_REQUEST_LIMITS } from '../../../shared/rules/request-eligibility.js'
import type {
  AssistantActionRecord,
  AssistantMessageRecord,
  LoanRecord,
} from '../../../shared/types/index.js'
import { makeBook } from '../../catalog/__tests__/book.fixtures.js'
import { makeLoanRecord } from '../../loans/__tests__/loan.fixtures.js'
import { ASSISTANT_TOOLS, SYNOPSIS_MAX_LENGTH } from '../assistant.constants.js'
import { buildSystemInstruction } from '../rules/app-guide.rules.js'
import {
  blockedMessageOf,
  toActionResponse,
  toGeminiHistory,
  toMessageResponse,
} from '../rules/assistant-view.rules.js'
import { toToolBook } from '../rules/catalog-view.rules.js'
import { readingHistoryOf } from '../rules/reading-history.rules.js'
import { parseToolCall, TOOL_DECLARATIONS } from '../rules/tools.rules.js'

const AT = new Date('2026-10-15T15:00:00Z')

describe('buildSystemInstruction: guia do app (RF-ASS-01)', () => {
  const settings = { ...DEFAULT_LOAN_RULES, ...DEFAULT_REQUEST_LIMITS }

  it('usa os números de settings/library, sem número fixo no texto', () => {
    const text = buildSystemInstruction({
      ...settings,
      loanDays: 21,
      maxActiveLoans: 4,
      fineCentsPerBusinessDay: 350,
    })

    expect(text).toContain('O empréstimo dura 21 dias')
    expect(text).toContain('até 4 livros ao mesmo tempo')
    expect(text).toContain('R$ 3,50 por dia útil')
  })

  it('manda pedir a confirmação no cartão e nunca dizer que já fez', () => {
    const text = buildSystemInstruction(settings)

    expect(text).toContain('Nunca diga que o pedido ou a fila já foram feitos')
    expect(text).toContain('Nunca peça matrícula')
  })
})

describe('parseToolCall: argumentos que o Gemini manda', () => {
  it('aceita a ferramenta conhecida com argumento válido', () => {
    expect(parseToolCall('search_catalog', { query: ' arquitetura ' })).toEqual(
      {
        name: 'search_catalog',
        args: { query: 'arquitetura' },
      },
    )
    expect(parseToolCall('recommend_from_history', undefined)).toEqual({
      name: 'recommend_from_history',
      args: {},
    })
  })

  it('recusa ferramenta desconhecida e argumento inválido', () => {
    expect(parseToolCall('delete_everything', {})).toBeUndefined()
    expect(parseToolCall('propose_queue', { bookIds: [] })).toBeUndefined()
    expect(parseToolCall('propose_loan', { bookId: 42 })).toBeUndefined()
  })

  it('declara exatamente as ferramentas do módulo', () => {
    expect(TOOL_DECLARATIONS.map((tool) => tool.name)).toEqual([
      ...ASSISTANT_TOOLS,
    ])
  })
})

describe('toToolBook: o livro que vai ao Gemini (RF-ASS-07)', () => {
  it('leva só dados do acervo e corta a sinopse longa', () => {
    const book = makeBook({ id: 'b1', synopsis: 'x'.repeat(1000) })

    const tool = toToolBook(book)

    expect(Object.keys(tool).sort()).toEqual(
      [
        'authors',
        'bookId',
        'copiesAvailable',
        'queueLength',
        'subjects',
        'synopsis',
        'title',
        'unavailableForNewRequests',
        'year',
      ].sort(),
    )
    expect(tool.synopsis).toHaveLength(SYNOPSIS_MAX_LENGTH)
    expect(tool.synopsis?.endsWith('…')).toBe(true)
  })
})

describe('readingHistoryOf: histórico para as sugestões (RF-ASS-03)', () => {
  it('lista os devolvidos do mais recente para o mais antigo e as obras já pegas', () => {
    const loans: LoanRecord[] = [
      makeLoanRecord('l1', {
        bookId: 'antigo',
        workId: 'w1',
        status: 'returned',
        returnedAt: new Date('2026-09-01T12:00:00Z'),
      }),
      makeLoanRecord('l2', {
        bookId: 'recente',
        workId: 'w2',
        status: 'returned',
        returnedAt: new Date('2026-10-01T12:00:00Z'),
      }),
      makeLoanRecord('l3', { bookId: 'aberto', workId: 'w3' }),
    ]

    const history = readingHistoryOf(loans)

    expect(history.returnedBookIds).toEqual(['recente', 'antigo'])
    expect([...history.borrowedWorkIds].sort()).toEqual(['w1', 'w2', 'w3'])
  })
})

describe('conversões da conversa e das ações', () => {
  const book = makeBook({ id: 'b1' })
  const books = new Map([['b1', book]])
  const action: AssistantActionRecord = {
    id: 'a1',
    type: 'request_loan',
    bookIds: ['b1', 'removido'],
    status: 'blocked',
    blockedReason: 'overdue',
    preview: {},
    expiresAt: AT,
    createdAt: AT,
    updatedAt: AT,
  }

  it('o motivo de bloqueio usa o mesmo texto do pedido', () => {
    expect(blockedMessageOf('overdue')).toContain('livro em atraso')
  })

  it('a ação traz o motivo, o texto e só os livros que ainda estão no acervo', () => {
    const response = toActionResponse(action, books)

    expect(response.books.map((b) => b.id)).toEqual(['b1'])
    expect(response.blockedReason).toBe('overdue')
    expect(response.blockedMessage).toBe(blockedMessageOf('overdue'))
    expect(response.preview).toEqual({
      pickupDeadline: null,
      activeLoansAfter: null,
      queuePosition: null,
    })
  })

  it('a mensagem traz os cartões e a ação', () => {
    const message: AssistantMessageRecord = {
      id: 'm1',
      sender: 'assistant',
      text: 'Achei',
      suggestedBookIds: ['b1'],
      actionId: 'a1',
      createdAt: AT,
      updatedAt: AT,
    }

    const response = toMessageResponse(
      message,
      books,
      new Map([['a1', action]]),
    )

    expect(response.suggestedBooks.map((b) => b.id)).toEqual(['b1'])
    expect(response.action?.id).toBe('a1')
    expect(response.error).toBe(false)
  })

  it('o histórico do Gemini troca os papéis e deixa as respostas com erro de fora', () => {
    const messages: AssistantMessageRecord[] = [
      { id: '1', sender: 'student', text: 'Oi', createdAt: AT, updatedAt: AT },
      {
        id: '2',
        sender: 'assistant',
        text: 'Falhou',
        error: true,
        createdAt: AT,
        updatedAt: AT,
      },
      {
        id: '3',
        sender: 'assistant',
        text: 'Olá',
        createdAt: AT,
        updatedAt: AT,
      },
    ]

    expect(toGeminiHistory(messages)).toEqual([
      { role: 'user', parts: [{ text: 'Oi' }] },
      { role: 'model', parts: [{ text: 'Olá' }] },
    ])
  })
})
