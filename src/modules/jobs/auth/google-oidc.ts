import { createPublicKey, verify, type JsonWebKey } from 'node:crypto'
import { z } from 'zod'
import {
  GOOGLE_CERTS_TIMEOUT_MS,
  GOOGLE_CERTS_TTL_MS,
  GOOGLE_CERTS_URL,
  GOOGLE_ISSUERS,
  TOKEN_CLOCK_TOLERANCE_SECONDS,
} from '../jobs.constants.js'

// Confere o token OIDC que o Cloud Scheduler manda (RNF-SEG-02 vale para o app; aqui
// é a outra porta de entrada). O Google assina o token (JWT) com uma chave privada
// e publica as chaves públicas; a API confere a assinatura RS256 com elas e lê
// quem é o emissor, para quem foi emitido e de qual conta de serviço. Feito com o
// `crypto` do Node e o `fetch`, sem biblioteca nova.

// Uma chave pública do Google no formato JWK.
export interface GoogleKey extends JsonWebKey {
  kid: string
}

const keysSchema = z.object({
  keys: z.array(
    z.looseObject({ kid: z.string(), kty: z.string(), n: z.string() }),
  ),
})

// O que se espera do token.
export interface ExpectedToken {
  // Para quem o token foi emitido (a audiência definida no job do Scheduler).
  audience: string
  // E-mail da conta de serviço do Scheduler.
  email: string
}

// Por que o token foi recusado: `invalid` (não vale) ou `other_identity` (vale, mas
// é de outra conta).
export type TokenVerdict = 'ok' | 'invalid' | 'other_identity'

const header = z.object({ alg: z.string(), kid: z.string() })
const claims = z.object({
  iss: z.string(),
  aud: z.string(),
  exp: z.number(),
  iat: z.number().optional(),
  email: z.string().optional(),
  email_verified: z.boolean().optional(),
})

// Lê uma parte do JWT (base64url com JSON).
function decodePart(part: string): unknown {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
}

// Confere um token do Google. `keys` devolve as chaves públicas atuais (e, com
// `refresh`, busca de novo, para o caso de o Google ter trocado a chave). Nunca
// lança erro: token malformado é `invalid`.
export async function verifyGoogleIdToken(
  token: string,
  expected: ExpectedToken,
  keys: (refresh: boolean) => Promise<readonly GoogleKey[]>,
  now: Date = new Date(),
): Promise<TokenVerdict> {
  try {
    const [rawHeader, rawPayload, signature, ...rest] = token.split('.')
    if (!rawHeader || !rawPayload || !signature || rest.length > 0) {
      return 'invalid'
    }
    const { alg, kid } = header.parse(decodePart(rawHeader))
    if (alg !== 'RS256') return 'invalid'

    let key = (await keys(false)).find((candidate) => candidate.kid === kid)
    key ??= (await keys(true)).find((candidate) => candidate.kid === kid)
    if (!key) return 'invalid'

    const signed = Buffer.from(`${rawHeader}.${rawPayload}`)
    const valid = verify(
      'RSA-SHA256',
      signed,
      createPublicKey({ key, format: 'jwk' }),
      Buffer.from(signature, 'base64url'),
    )
    if (!valid) return 'invalid'

    const payload = claims.parse(decodePart(rawPayload))
    const nowSeconds = now.getTime() / 1000
    if (!(GOOGLE_ISSUERS as readonly string[]).includes(payload.iss)) {
      return 'invalid'
    }
    if (payload.aud !== expected.audience) return 'invalid'
    if (payload.exp + TOKEN_CLOCK_TOLERANCE_SECONDS < nowSeconds) {
      return 'invalid'
    }
    if (
      payload.iat !== undefined &&
      payload.iat - TOKEN_CLOCK_TOLERANCE_SECONDS > nowSeconds
    ) {
      return 'invalid'
    }
    return payload.email === expected.email && payload.email_verified === true
      ? 'ok'
      : 'other_identity'
  } catch {
    return 'invalid'
  }
}

let cached: { keys: readonly GoogleKey[]; expiresAt: number } | undefined

// As chaves públicas do Google, guardadas por uma hora. Com `refresh`, busca de
// novo. Falha de rede lança erro, e quem chama trata a chamada como inválida.
export async function googleKeys(
  refresh: boolean,
  nowMs: number = Date.now(),
): Promise<readonly GoogleKey[]> {
  if (!refresh && cached && cached.expiresAt > nowMs) return cached.keys
  const response = await fetch(GOOGLE_CERTS_URL, {
    signal: AbortSignal.timeout(GOOGLE_CERTS_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Google certs answered ${response.status}`)
  const { keys } = keysSchema.parse(await response.json())
  cached = {
    keys: keys as unknown as GoogleKey[],
    expiresAt: nowMs + GOOGLE_CERTS_TTL_MS,
  }
  return cached.keys
}

// Descarta as chaves guardadas (para os testes).
export function forgetGoogleKeys(): void {
  cached = undefined
}
