import { afterAll, describe, expect, it, vi } from 'vitest'
import type { RouteCall } from '../../../test-support/route-harness.js'

vi.mock('../../../middlewares/auth.js', async () => {
  const { fakeAuthenticate } =
    await import('../../../test-support/route-harness.js')
  return { authenticate: fakeAuthenticate }
})

const { serveRouter } = await import('../../../test-support/route-harness.js')
const { finesRouter } = await import('../fines.routes.js')

const server = await serveRouter(finesRouter)

afterAll(() => server.close())

const studentRoutes: RouteCall[] = [{ method: 'GET', path: '/me/fines' }]

const librarianRoutes: RouteCall[] = [
  { method: 'GET', path: '/librarian/fines' },
  { method: 'POST', path: '/librarian/fines/fine1/pay' },
]

const label = (route: RouteCall) => `${route.method} ${route.path}`

describe('rotas de multa do aluno (RF-MUL-03)', () => {
  it.each(studentRoutes.map((route) => [label(route), route] as const))(
    '%s sem sessão responde 401',
    async (_name, route) => {
      expect((await server.call(route)).status).toBe(401)
    },
  )

  it.each(studentRoutes.map((route) => [label(route), route] as const))(
    '%s com o bibliotecário responde 403',
    async (_name, route) => {
      expect((await server.call(route, 'librarian')).status).toBe(403)
    },
  )
})

describe('aba Multas: requireRole(librarian) (RF-BAL-09)', () => {
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

describe('o aluno não consegue pagar multa pelo app (RF-MUL-03)', () => {
  it('POST /librarian/fines/:id/pay com o aluno é 403, e não existe outra rota de pagamento', async () => {
    const pay = await server.call(
      { method: 'POST', path: '/librarian/fines/fine1/pay' },
      'student',
    )
    const studentPay = await server.call(
      { method: 'POST', path: '/me/fines/fine1/pay' },
      'student',
    )

    expect(pay.status).toBe(403)
    // O router de multas não tem a rota: o app real devolve 404 do notFoundHandler.
    expect(studentPay.status).toBe(404)
  })
})

describe('validação da entrada na aba Multas', () => {
  it('aba que não existe responde 400', async () => {
    const { status, body } = await server.call(
      { method: 'GET', path: '/librarian/fines?status=pending' },
      'librarian',
    )

    expect(status).toBe(400)
    expect(body.code).toBe('validation_error')
  })
})
