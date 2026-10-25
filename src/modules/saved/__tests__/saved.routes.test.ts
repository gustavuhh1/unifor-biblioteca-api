import { afterAll, describe, expect, it, vi } from 'vitest'
import type { RouteCall } from '../../../test-support/route-harness.js'

vi.mock('../../../middlewares/auth.js', async () => {
  const { fakeAuthenticate } =
    await import('../../../test-support/route-harness.js')
  return { authenticate: fakeAuthenticate }
})

const { serveRouter } = await import('../../../test-support/route-harness.js')
const { savedRouter } = await import('../saved.routes.js')

const server = await serveRouter(savedRouter)

afterAll(() => server.close())

const routes: RouteCall[] = [
  { method: 'GET', path: '/me/saved' },
  { method: 'PUT', path: '/me/saved/book1' },
  { method: 'DELETE', path: '/me/saved/book1' },
  { method: 'GET', path: '/me/folders' },
  { method: 'POST', path: '/me/folders', body: { name: 'TCC' } },
  { method: 'PATCH', path: '/me/folders/f1', body: { name: 'TCC' } },
  { method: 'DELETE', path: '/me/folders/f1' },
  { method: 'PUT', path: '/me/folders/f1/books/book1' },
  { method: 'DELETE', path: '/me/folders/f1/books/book1' },
]

const label = (route: RouteCall) => `${route.method} ${route.path}`
const cases = routes.map((route) => [label(route), route] as const)

describe('rotas de Salvos: só o aluno (RF-SAL-01 a RF-SAL-03)', () => {
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
})
