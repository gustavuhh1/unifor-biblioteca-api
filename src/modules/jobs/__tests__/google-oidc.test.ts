import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  forgetGoogleKeys,
  googleKeys,
  verifyGoogleIdToken,
  type GoogleKey,
} from '../auth/google-oidc.js'

const EXPECTED = {
  audience: 'https://api.uni-books.app',
  email: 'unibooks-scheduler@estoque-pay.iam.gserviceaccount.com',
}
const NOW = new Date('2026-10-26T09:00:00Z')
const NOW_SECONDS = NOW.getTime() / 1000

// Uma chave RSA de teste no lugar da chave do Google.
function makeKey(kid: string) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  })
  const jwk = publicKey.export({ format: 'jwk' }) as GoogleKey
  return { privateKey, jwk: { ...jwk, kid } }
}

const part = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString('base64url')

// Um JWT assinado como o Google assina o token do Cloud Scheduler.
function makeToken(
  privateKey: KeyObject,
  options: {
    kid?: string
    alg?: string
    claims?: Record<string, unknown>
  } = {},
) {
  const header = part({ alg: options.alg ?? 'RS256', kid: options.kid ?? 'k1' })
  const payload = part({
    iss: 'https://accounts.google.com',
    aud: EXPECTED.audience,
    iat: NOW_SECONDS - 10,
    exp: NOW_SECONDS + 3600,
    email: EXPECTED.email,
    email_verified: true,
    ...options.claims,
  })
  const signature = sign(
    'RSA-SHA256',
    Buffer.from(`${header}.${payload}`),
    privateKey,
  )
  return `${header}.${payload}.${signature.toString('base64url')}`
}

const key = makeKey('k1')
type KeySource = (refresh: boolean) => Promise<readonly GoogleKey[]>

const verify = (token: string, keys: KeySource = async () => [key.jwk]) =>
  verifyGoogleIdToken(token, EXPECTED, keys, NOW)

describe('token OIDC do Cloud Scheduler (verifyGoogleIdToken, RF-SIS-05)', () => {
  it('aceita o token assinado pelo Google para a conta de serviço e a audiência certas', async () => {
    expect(await verify(makeToken(key.privateKey))).toBe('ok')
  })

  it('aceita o emissor sem o https', async () => {
    const token = makeToken(key.privateKey, {
      claims: { iss: 'accounts.google.com' },
    })

    expect(await verify(token)).toBe('ok')
  })

  it('token de outra conta de serviço vale, mas é other_identity', async () => {
    const token = makeToken(key.privateKey, {
      claims: { email: 'outra@estoque-pay.iam.gserviceaccount.com' },
    })

    expect(await verify(token)).toBe('other_identity')
  })

  it('e-mail não verificado ou ausente não vale como o da conta de serviço', async () => {
    const unverified = makeToken(key.privateKey, {
      claims: { email_verified: false },
    })
    const noEmail = makeToken(key.privateKey, { claims: { email: undefined } })

    expect(await verify(unverified)).toBe('other_identity')
    expect(await verify(noEmail)).toBe('other_identity')
  })

  it('recusa audiência diferente', async () => {
    const token = makeToken(key.privateKey, {
      claims: { aud: 'https://outra-api.example' },
    })

    expect(await verify(token)).toBe('invalid')
  })

  it('recusa emissor que não é o Google', async () => {
    const token = makeToken(key.privateKey, {
      claims: { iss: 'https://evil.example' },
    })

    expect(await verify(token)).toBe('invalid')
  })

  it('recusa token vencido, mas dá uma folga de 1 minuto ao relógio', async () => {
    const expired = makeToken(key.privateKey, {
      claims: { exp: NOW_SECONDS - 120 },
    })
    const barely = makeToken(key.privateKey, {
      claims: { exp: NOW_SECONDS - 30 },
    })

    expect(await verify(expired)).toBe('invalid')
    expect(await verify(barely)).toBe('ok')
  })

  it('recusa token emitido no futuro', async () => {
    const token = makeToken(key.privateKey, {
      claims: { iat: NOW_SECONDS + 600 },
    })

    expect(await verify(token)).toBe('invalid')
  })

  it('recusa assinatura de outra chave', async () => {
    const other = makeKey('k1')

    expect(await verify(makeToken(other.privateKey))).toBe('invalid')
  })

  it('recusa conteúdo alterado depois de assinado', async () => {
    const [header, , signature] = makeToken(key.privateKey).split('.')
    const forged = part({
      iss: 'https://accounts.google.com',
      aud: EXPECTED.audience,
      exp: NOW_SECONDS + 3600,
      email: EXPECTED.email,
      email_verified: true,
      extra: 'adulterado',
    })

    expect(await verify(`${header}.${forged}.${signature}`)).toBe('invalid')
  })

  it('só aceita RS256 (nunca "none" nem HS256)', async () => {
    for (const alg of ['none', 'HS256']) {
      expect(await verify(makeToken(key.privateKey, { alg }))).toBe('invalid')
    }
  })

  it('recusa kid que o Google não publica, depois de buscar as chaves de novo', async () => {
    const keys = vi.fn(async () => [key.jwk])

    const verdict = await verify(
      makeToken(key.privateKey, { kid: 'nova' }),
      keys,
    )

    expect(verdict).toBe('invalid')
    expect(keys).toHaveBeenNthCalledWith(1, false)
    expect(keys).toHaveBeenNthCalledWith(2, true)
  })

  it('o Google trocou a chave: busca de novo e aceita', async () => {
    const rotated = makeKey('k2')
    const keys = vi.fn(async (refresh: boolean) =>
      refresh ? [key.jwk, rotated.jwk] : [key.jwk],
    )

    const verdict = await verify(
      makeToken(rotated.privateKey, { kid: 'k2' }),
      keys,
    )

    expect(verdict).toBe('ok')
  })

  it('token malformado é invalid, sem lançar erro', async () => {
    for (const token of ['', 'abc', 'a.b', 'a.b.c.d', '...', 'x.y.z']) {
      expect(await verify(token)).toBe('invalid')
    }
  })

  it('falha ao buscar as chaves do Google é invalid, sem lançar erro', async () => {
    const keys = async () => {
      throw new Error('rede')
    }

    expect(await verify(makeToken(key.privateKey), keys)).toBe('invalid')
  })
})

describe('chaves públicas do Google (googleKeys)', () => {
  afterEach(() => {
    forgetGoogleKeys()
    vi.unstubAllGlobals()
  })

  const answer = (keys: object[]) =>
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ keys }) })

  it('busca uma vez e guarda por uma hora', async () => {
    const fetchMock = answer([key.jwk])
    vi.stubGlobal('fetch', fetchMock)

    await googleKeys(false, 1_000)
    const again = await googleKeys(false, 1_000 + 30 * 60_000)

    expect(again).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('busca de novo depois de uma hora ou quando pedem refresh', async () => {
    const fetchMock = answer([key.jwk])
    vi.stubGlobal('fetch', fetchMock)

    await googleKeys(false, 1_000)
    await googleKeys(false, 1_000 + 61 * 60_000)
    await googleKeys(true, 1_000 + 62 * 60_000)

    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('erro do Google lança, e quem chama trata como token inválido', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    )

    await expect(googleKeys(false)).rejects.toThrow('503')
  })
})
