import type { Request, Response } from 'express'
import { unauthorized } from '../../shared/errors.js'
import {
  actionParamsSchema,
  messageBodySchema,
} from './schemas/request.schemas.js'
import * as actions from './services/assistant-actions.service.js'
import * as chat from './services/assistant-chat.service.js'

// Cada handler valida a entrada com o schema, chama o serviço e responde. O erro
// de validação (ZodError) sobe para o handler de erros, que responde 400.

// O uid de quem está logado (as rotas passam antes pelo authenticate e requireRole).
function uidOf(req: Request): string {
  if (!req.user) throw unauthorized()
  return req.user.uid
}

// GET /me/assistant/messages: a conversa e o aviso de que a IA pode errar
// (RF-ASS-05).
export async function listMessages(req: Request, res: Response) {
  res.json(await chat.listConversation(uidOf(req)))
}

// POST /me/assistant/messages: pergunta ao Assistente (RF-ASS-01 a RF-ASS-04).
export async function sendMessage(req: Request, res: Response) {
  const { text } = messageBodySchema.parse(req.body)
  res.status(201).json(await chat.sendMessage(uidOf(req), text))
}

// POST /me/assistant/actions/:actionId/confirm: executa a ação (RF-ASS-04).
export async function confirmAction(req: Request, res: Response) {
  const { actionId } = actionParamsSchema.parse(req.params)
  res.json(await actions.confirmAction(uidOf(req), actionId))
}

// POST /me/assistant/actions/:actionId/cancel: desiste da ação (RF-ASS-04).
export async function cancelAction(req: Request, res: Response) {
  const { actionId } = actionParamsSchema.parse(req.params)
  res.json(await actions.cancelAction(uidOf(req), actionId))
}
