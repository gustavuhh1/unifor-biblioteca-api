import { afterAll, describe, expect, it, vi } from 'vitest'
import type { RouteCall } from '../../../test-support/route-harness.js'

vi.mock('../../../middlewares/auth.js', async () => {
  const { fakeAuthenticate } =
    await import('../../../test-support/route-harness.js')
  return { authenticate: fakeAuthenticate }
})

const { serveRouter } = await import('../../../test-support/route-harness.js')
const { deskRouter } = await import('../desk.routes.js')

const server = await serveRouter(deskRouter)

afterAll(() => server.close())

// Todas as rotas do balcão são do bibliotecário (RF-AUT-12).
const librarianRoutes: RouteCall[] = [
  {
    method: 'POST',
    path: '/librarian/desk/lookup',
    body: { matricula: '2412858' },
  },
  { method: 'POST', path: '/librarian/loans/loan1/pickup' },
  { method: 'POST', path: '/librarian/loans/loan1/return' },
  { method: 'GET', path: '/librarian/pickups' },
  { method: 'GET', path: '/librarian/desk/summary' },
]

const label = (route: RouteCall) => `${route.method} ${route.path}`

describe('rotas do balcão: requireRole(librarian) (RF-AUT-12)', () => {
  it.each(librarianRoutes.map((route) => [label(route), route] as const))(
    '%s sem sessão responde 401',
    async (_name, route) => {
      expect((await server.call(route)).status).toBe(401)
    },
  )

  it.each(librarianRoutes.map((route) => [label(route), route] as const))(
    '%s com o aluno responde 403',
    async (_name, route) => {
      const { status, body } = await server.call(route, 'student')

      expect(status).toBe(403)
      expect(body.code).toBe('forbidden')
    },
  )
})

describe('validação da ficha (POST /librarian/desk/lookup)', () => {
  it.each([
    ['corpo vazio', {}],
    ['dois jeitos juntos', { qrToken: 'abc', matricula: '2412858' }],
    ['código mal formado', { pickupCode: '4821' }],
    ['matrícula curta', { matricula: '241' }],
  ])('%s responde 400', async (_name, body) => {
    const { status, body: response } = await server.call(
      { method: 'POST', path: '/librarian/desk/lookup', body },
      'librarian',
    )

    expect(status).toBe(400)
    expect(response.code).toBe('validation_error')
  })
})

describe('validação da lista Retiradas (GET /librarian/pickups)', () => {
  it.each(['24128588', 'abc', '24a'])(
    'matrícula %j responde 400',
    async (matricula) => {
      const { status, body } = await server.call(
        { method: 'GET', path: `/librarian/pickups?matricula=${matricula}` },
        'librarian',
      )

      expect(status).toBe(400)
      expect(body.code).toBe('validation_error')
    },
  )
})
