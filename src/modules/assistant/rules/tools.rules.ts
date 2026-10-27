import { z } from 'zod'
import {
  ASSISTANT_TOOL,
  ASSISTANT_TOOLS,
  type AssistantTool,
} from '../assistant.constants.js'
import type { GeminiFunctionDeclaration } from '../gemini/gemini.client.js'
import { MAX_EDITIONS_PER_JOIN } from '../../queues/queues.constants.js'

// Ferramentas que o Gemini pode pedir (function calling) e a validação dos
// argumentos que ele manda. A API nunca confia no argumento sem validar.

const bookId = z.string().min(1).max(200)

// Argumentos de cada ferramenta.
const TOOL_ARGS = {
  [ASSISTANT_TOOL.searchCatalog]: z.object({
    query: z.string().trim().min(1).max(200),
  }),
  [ASSISTANT_TOOL.similarBooks]: z.object({ bookId }),
  [ASSISTANT_TOOL.recommendFromHistory]: z.object({}),
  [ASSISTANT_TOOL.proposeLoan]: z.object({ bookId }),
  [ASSISTANT_TOOL.proposeQueue]: z.object({
    bookIds: z.array(bookId).min(1).max(MAX_EDITIONS_PER_JOIN),
  }),
} satisfies Record<AssistantTool, z.ZodType>

// Um pedido de ferramenta já validado.
export type ToolCall =
  | { name: typeof ASSISTANT_TOOL.searchCatalog; args: { query: string } }
  | { name: typeof ASSISTANT_TOOL.similarBooks; args: { bookId: string } }
  | {
      name: typeof ASSISTANT_TOOL.recommendFromHistory
      args: Record<string, never>
    }
  | { name: typeof ASSISTANT_TOOL.proposeLoan; args: { bookId: string } }
  | { name: typeof ASSISTANT_TOOL.proposeQueue; args: { bookIds: string[] } }

const isTool = (name: string): name is AssistantTool =>
  (ASSISTANT_TOOLS as readonly string[]).includes(name)

// Confere o nome e os argumentos que o Gemini mandou. Devolve o pedido validado,
// ou undefined quando a ferramenta não existe ou o argumento é inválido.
export function parseToolCall(
  name: string,
  args: unknown,
): ToolCall | undefined {
  if (!isTool(name)) return undefined
  const parsed = TOOL_ARGS[name].safeParse(args ?? {})
  return parsed.success ? ({ name, args: parsed.data } as ToolCall) : undefined
}

// Declarações das ferramentas, no formato da Gemini API.
export const TOOL_DECLARATIONS: GeminiFunctionDeclaration[] = [
  {
    name: ASSISTANT_TOOL.searchCatalog,
    description:
      'Busca livros ativos do acervo por título, autor ou assunto. Devolve até 8 livros com id, autores, assuntos, ano, trecho da sinopse e disponibilidade.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Palavras da busca.' },
      },
      required: ['query'],
    },
  },
  {
    name: ASSISTANT_TOOL.similarBooks,
    description:
      'Livros do acervo parecidos com um livro (mesmo assunto ou autor). Use o bookId que veio de uma busca.',
    parameters: {
      type: 'object',
      properties: { bookId: { type: 'string' } },
      required: ['bookId'],
    },
  },
  {
    name: ASSISTANT_TOOL.recommendFromHistory,
    description:
      'Sugestões de livros pelo que o aluno já leu (livros devolvidos), cada uma com o título lido que motivou a sugestão.',
  },
  {
    name: ASSISTANT_TOOL.proposeLoan,
    description:
      'Prepara o pedido de empréstimo de um livro para o aluno confirmar no app. Não pede nada sozinho. Diz se uma regra bloqueia e por quê.',
    parameters: {
      type: 'object',
      properties: { bookId: { type: 'string' } },
      required: ['bookId'],
    },
  },
  {
    name: ASSISTANT_TOOL.proposeQueue,
    description:
      'Prepara a entrada na fila de uma ou mais edições do mesmo livro para o aluno confirmar no app. Não entra na fila sozinho. Diz se uma regra bloqueia e por quê.',
    parameters: {
      type: 'object',
      properties: {
        bookIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Edições do mesmo livro.',
        },
      },
      required: ['bookIds'],
    },
  },
]
