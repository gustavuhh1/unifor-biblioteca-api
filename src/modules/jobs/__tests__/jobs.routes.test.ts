import { afterAll, describe, expect, it } from 'vitest'

const { serveRouter } = await import('../../../test-support/route-harness.js')
const { jobsRouter } = await import('../jobs.routes.js')
const server = await serveRouter(jobsRouter)

afterAll(() => server.close())

describe('proteção das rotas internas', () => {
  it('não executa job sem o token OIDC do Scheduler', async () => {
    const response = await server.call({
      method: 'POST',
      path: '/internal/jobs/expire_pickups',
    })
    expect(response.status).toBe(401)
    expect(response.body.code).toBe('unauthorized')
  })
})
