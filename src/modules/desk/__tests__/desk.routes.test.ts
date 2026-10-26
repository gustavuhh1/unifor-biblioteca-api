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

const routes: RouteCall[] = [
  { method: 'GET', path: '/librarian/dashboard' },
  { method: 'GET', path: '/librarian/pickups' },
  { method: 'GET', path: '/librarian/students/lookup?identifier=2412858' },
  { method: 'POST', path: '/librarian/loans/loan1/pickup' },
  { method: 'POST', path: '/librarian/loans/loan1/return' },
]

describe('proteção das rotas do balcão', () => {
  it.each(
    routes.map((route) => [`${route.method} ${route.path}`, route] as const),
  )('%s sem sessão responde 401', async (_label, route) => {
    expect((await server.call(route)).status).toBe(401)
  })

  it.each(
    routes.map((route) => [`${route.method} ${route.path}`, route] as const),
  )('%s com perfil aluno responde 403', async (_label, route) => {
    const response = await server.call(route, 'student')
    expect(response.status).toBe(403)
    expect(response.body.code).toBe('forbidden')
  })
})

describe('validação da busca do balcão', () => {
  it('rejeita matrícula parcial no filtro de retiradas', async () => {
    const response = await server.call(
      { method: 'GET', path: '/librarian/pickups?matricula=123' },
      'librarian',
    )
    expect(response.status).toBe(400)
    expect(response.body.code).toBe('validation_error')
  })

  it('rejeita identificador que não é matrícula, código nem token de QR', async () => {
    const response = await server.call(
      {
        method: 'GET',
        path: '/librarian/students/lookup?identifier=invalido%2Fcom%2Fbarra',
      },
      'librarian',
    )
    expect(response.status).toBe(400)
    expect(response.body.code).toBe('validation_error')
  })
})
