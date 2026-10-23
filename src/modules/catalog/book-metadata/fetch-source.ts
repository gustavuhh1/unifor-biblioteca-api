import {
  BOOK_METADATA_TIMEOUT_MS,
  BOOK_METADATA_USER_AGENT,
} from '../catalog.constants.js'

// Peças trocáveis dos clientes das fontes, para os testes não usarem a rede.
export interface SourceClientOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

// Resultado de uma chamada GET a uma fonte, sem exceção: o JSON da resposta, o
// status de uma resposta que não é 2xx, ou falha (rede, tempo esgotado, JSON
// inválido).
export type FetchOutcome =
  | { kind: 'ok'; body: unknown }
  | { kind: 'status'; status: number }
  | { kind: 'failed' }

// Registra só o nome da fonte e o motivo (status ou nome do erro).
export function logSourceFailure(source: string, reason: string): void {
  console.warn(`${source} indisponível (${reason}).`)
}

// Faz um GET que aceita JSON, com o User-Agent do app e o tempo máximo de cada
// chamada (RNF-CON-03). Nunca lança: qualquer falha volta como resultado.
export async function fetchSource(
  source: string,
  url: string,
  options: SourceClientOptions,
): Promise<FetchOutcome> {
  const { fetchImpl = fetch, timeoutMs = BOOK_METADATA_TIMEOUT_MS } = options
  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: 'application/json',
        'user-agent': BOOK_METADATA_USER_AGENT,
      },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) return { kind: 'status', status: response.status }
    return { kind: 'ok', body: await response.json() }
  } catch (error) {
    logSourceFailure(source, error instanceof Error ? error.name : 'erro')
    return { kind: 'failed' }
  }
}
