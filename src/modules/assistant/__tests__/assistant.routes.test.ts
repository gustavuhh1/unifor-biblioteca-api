import { afterAll, describe, expect, it, vi } from 'vitest'
import type { RouteCall } from '../../../test-support/route-harness.js'

vi.mock('../../../middlewares/auth.js', async () => {
  const { fakeAuthenticate } =
    await import('../../../test-support/route-harness.js')
  return { authenticate: fakeAuthenticate }
})

const { serveRouter } = await import('../../../test-support/route-harness.js')
const { assistantRouter } = await import('../assistant.routes.js')

const server = await serveRouter(assistantRouter)

afterAll(() => server.close())

const routes: RouteCall[] = [
  { method: 'GET', path: '/me/assistant/messages' },
  { method: 'POST', path: '/me/assistant/messages', body: { text: 'Oi' } },
  { method: 'POST', path: '/me/assistant/actions/a1/confirm' },
  { method: 'POST', path: '/me/assistant/actions/a1/cancel' },
]

const label = (route: RouteCall) => `${route.method} ${route.path}`
const cases = routes.map((route) => [label(route), route] as const)

describe('rotas do Assistente: só o aluno (RF-ASS-06)', () => {
  it.each(cases)('%s sem sessão responde 401', async (_name, route) => {
    expect((await server.call(route)).status).toBe(401)
  })

  it.each(cases)(
    '%s com o bibliotecário responde 403',
    async (_name, route) => {
      const { status, body } = await server.call(route, 'librarian')

      expect(status).toBe(403)
      expect(body.code).toBe('forbidden')
    },
  )

  it('recusa pergunta vazia com 400', async () => {
    const { status, body } = await server.call(
      { method: 'POST', path: '/me/assistant/messages', body: { text: '  ' } },
      'student',
    )

    expect(status).toBe(400)
    expect(body.code).toBe('validation_error')
  })
})
