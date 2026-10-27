import { z } from 'zod'
import { QUESTION_MAX_LENGTH } from '../assistant.constants.js'

// Schemas de entrada do módulo do Assistente. As mensagens são em português.

// Corpo de POST /me/assistant/messages: a pergunta do aluno.
export const messageBodySchema = z
  .object({
    text: z
      .string('Escreva a sua pergunta.')
      .trim()
      .min(1, 'Escreva a sua pergunta.')
      .max(
        QUESTION_MAX_LENGTH,
        `A pergunta deve ter no máximo ${QUESTION_MAX_LENGTH} caracteres.`,
      )
      .meta({
        description: 'Ex.: "Tem algum livro de arquitetura de software?"',
      }),
  })
  .meta({ id: 'AssistantMessageBody' })

// Parâmetro :actionId das rotas de uma ação proposta.
export const actionParamsSchema = z.object({
  actionId: z.string().min(1).max(200),
})
