import { generateKeyPairSync, sign } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GoogleKey } from '../auth/google-oidc.js'

const h = vi.hoisted(() => ({
  keys: [] as unknown[],
  runJob: vi.fn(),
}))

vi.mock('../auth/google-oidc.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth/google-oidc.js')>()),
  googleKeys: async () => h.keys,
}))
vi.mock('../services/job-run.service.js', () => ({ runJob: h.runJob }))

const { serveRouter } = await import('../../../test-support/route-harness.js')
const { jobsRouter } = await import('../jobs.routes.js')
const { schedulerEmail } = await import('../rules/scheduler.rules.js')
const { env } = await import('../../../config/env.js')

const server = await serveRouter(jobsRouter)
afterAll(() => server.close())

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
})
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1' } as GoogleKey

const part = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString('base64url')

// O token que o Cloud Scheduler mandaria, assinado pela chave de teste.
function schedulerToken(claims: Record<string, unknown> = {}) {
  const now = Date.now() / 1000
  const header = part({ alg: 'RS256', kid: 'k1' })
  const payload = part({
    iss: 'https://accounts.google.com',
    aud: 'https://api.uni-books.app',
    iat: now - 10,
    exp: now + 3600,
    email: schedulerEmail(env.GOOGLE_CLOUD_PROJECT),
    email_verified: true,
    ...claims,
  })
  const signature = sign(
    'RSA-SHA256',
    Buffer.from(`${header}.${payload}`),
    privateKey,
  )
  return `${header}.${payload}.${signature.toString('base64url')}`
}

const call = (path: string, token?: string) =>
  fetch(`${server.baseUrl}${path}`, {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })

beforeEach(() => {
  h.keys = [jwk]
  h.runJob.mockReset().mockResolvedValue({
    runId: 'run1',
    job: 'accrue_fines',
    status: 'ok',
    processed: 2,
    startedAt: '2026-10-26T09:00:00.000Z',
    finishedAt: '2026-10-26T09:00:01.000Z',
  })
})

describe('POST /jobs/:job: só o Cloud Scheduler (RF-SIS-05)', () => {
  it('sem token responde 401 e não roda nada', async () => {
    const response = await call('/jobs/accrue_fines')

    expect(response.status).toBe(401)
    expect(((await response.json()) as { code: string }).code).toBe(
      'scheduler_unauthorized',
    )
    expect(h.runJob).not.toHaveBeenCalled()
  })

  it('token que não é do Google responde 401', async () => {
    const response = await call('/jobs/accrue_fines', 'um-id-token-do-firebase')

    expect(response.status).toBe(401)
    expect(h.runJob).not.toHaveBeenCalled()
  })

  it('token de outra audiência responde 401', async () => {
    const token = schedulerToken({ aud: 'https://outra-api.example' })

    expect((await call('/jobs/accrue_fines', token)).status).toBe(401)
  })

  it('token vencido responde 401', async () => {
    const token = schedulerToken({ exp: Date.now() / 1000 - 600 })

    expect((await call('/jobs/accrue_fines', token)).status).toBe(401)
  })

  it('token válido de outra conta de serviço responde 403', async () => {
    const token = schedulerToken({
      email: 'outra@estoque-pay.iam.gserviceaccount.com',
    })

    const response = await call('/jobs/accrue_fines', token)

    expect(response.status).toBe(403)
    expect(((await response.json()) as { code: string }).code).toBe('forbidden')
    expect(h.runJob).not.toHaveBeenCalled()
  })

  it('o Google fora do ar para buscar as chaves: 401, sem derrubar a API', async () => {
    h.keys = []

    expect((await call('/jobs/accrue_fines', schedulerToken())).status).toBe(
      401,
    )
  })

  it('token do Scheduler roda a rotina pedida e devolve o resultado', async () => {
    const response = await call('/jobs/accrue_fines', schedulerToken())

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      runId: 'run1',
      job: 'accrue_fines',
      status: 'ok',
      processed: 2,
    })
    expect(h.runJob).toHaveBeenCalledWith('accrue_fines')
  })

  it('rotina desconhecida responde 400', async () => {
    const response = await call('/jobs/apagar_tudo', schedulerToken())

    expect(response.status).toBe(400)
    expect(h.runJob).not.toHaveBeenCalled()
  })
})
