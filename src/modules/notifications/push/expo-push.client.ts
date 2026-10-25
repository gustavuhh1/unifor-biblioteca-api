import { z } from 'zod'

// Cliente do Expo Push (RF-AVI-02), pela API HTTP do Expo com o fetch do Node, sem
// SDK novo. Cada mensagem vai a um token; a resposta traz um "ticket" por mensagem,
// na mesma ordem.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

// Tempo máximo da chamada ao Expo.
const PUSH_TIMEOUT_MS = 5000

// O Expo aceita até 100 mensagens por chamada.
const MAX_MESSAGES_PER_CALL = 100

export interface PushMessage {
  to: string
  title: string
  body: string
  // Vai junto para o app abrir a tela certa (valores sempre texto).
  data: Record<string, string>
}

// O que aconteceu com uma mensagem: `ok` (o Expo aceitou), `invalid_token` (o
// aparelho não está mais registrado no Expo) ou `failed` (qualquer outro erro).
export type PushTicketStatus = 'ok' | 'invalid_token' | 'failed'

const responseSchema = z.object({
  data: z.array(
    z.object({
      status: z.string(),
      details: z.object({ error: z.string().optional() }).optional(),
    }),
  ),
})

// Traduz um ticket do Expo.
function statusOf(ticket: {
  status: string
  details?: { error?: string | undefined } | undefined
}): PushTicketStatus {
  if (ticket.status === 'ok') return 'ok'
  return ticket.details?.error === 'DeviceNotRegistered'
    ? 'invalid_token'
    : 'failed'
}

// Manda até 100 mensagens e devolve o resultado de cada uma, na mesma ordem. Nunca
// lança erro: se o Expo não responder, todas ficam `failed`.
async function sendChunk(
  messages: readonly PushMessage[],
): Promise<PushTicketStatus[]> {
  const allFailed = messages.map((): PushTicketStatus => 'failed')
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(messages.map((m) => ({ ...m, sound: 'default' }))),
      signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
    })
    if (!response.ok) return allFailed

    const { data } = responseSchema.parse(await response.json())
    return messages.map((_, index) => {
      const ticket = data[index]
      return ticket ? statusOf(ticket) : 'failed'
    })
  } catch (error) {
    console.error(
      'O Expo Push não respondeu:',
      error instanceof Error ? error.name : 'erro desconhecido',
    )
    return allFailed
  }
}

// Manda as mensagens ao Expo, em levas de 100, e devolve o resultado de cada uma
// na mesma ordem.
export async function sendPush(
  messages: readonly PushMessage[],
): Promise<PushTicketStatus[]> {
  const results: PushTicketStatus[] = []
  for (let i = 0; i < messages.length; i += MAX_MESSAGES_PER_CALL) {
    results.push(
      ...(await sendChunk(messages.slice(i, i + MAX_MESSAGES_PER_CALL))),
    )
  }
  return results
}
