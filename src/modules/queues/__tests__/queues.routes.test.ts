import { afterAll, describe, expect, it, vi } from 'vitest'
import type { RouteCall } from '../../../test-support/route-harness.js'

vi.mock('../../../middlewares/auth.js', async () => {
  const { fakeAuthenticate } =
    await import('../../../test-support/route-harness.js')
  return { authenticate: fakeAuthenticate }
})

const { serveRouter } = await import('../../../test-support/route-harness.js')
const { queuesRouter } = await import('../queues.routes.js')

const server = await serveRouter(queuesRouter)

afterAll(() => server.close())

// Rotas do aluno (RF-FIL-01 a RF-FIL-06, RF-FIL-08).
const studentRoutes: RouteCall[] = [
  { method: 'GET', path: '/books/book1/queue/preview' },
  { method: 'POST', path: '/queues', body: { bookIds: ['book1'] } },
  { method: 'GET', path: '/me/queues' },
  { method: 'POST', path: '/queues/qe1/leave' },
  { method: 'POST', path: '/queues/qe1/confirm' },
]

// Rotas do bibliotecário (RF-BAL-06, RF-BAL-07).
const librarianRoutes: RouteCall[] = [
  { method: 'GET', path: '/librarian/books/book1/queue' },
  {
    method: 'POST',
    path: '/librarian/books/book1/queue',
    body: { matricula: '2311052' },
  },
  {
    method: 'PATCH',
    path: '/librarian/queues/qe1/position',
    body: { position: 2 },
  },
  { method: 'POST', path: '/librarian/queues/qe1/resend' },
  {
    method: 'POST',
    path: '/librarian/queues/qe1/remove',
    body: { reason: 'Trancou o curso' },
  },
]

const label = (route: RouteCall) => `${route.method} ${route.path}`

describe('rotas de fila do aluno exigem sessão de aluno', () => {
  it.each(studentRoutes.map((route) => [label(route), route] as const))(
    '%s sem sessão responde 401',
    async (_name, route) => {
      const { status, body } = await server.call(route)

      expect(status).toBe(401)
      expect(body.code).toBe('unauthorized')
    },
  )

  it.each(studentRoutes.map((route) => [label(route), route] as const))(
    '%s com o bibliotecário responde 403',
    async (_name, route) => {
      const { status, body } = await server.call(route, 'librarian')

      expect(status).toBe(403)
      expect(body.code).toBe('forbidden')
    },
  )
})

describe('rotas de fila do bibliotecário: requireRole(librarian)', () => {
  it.each(librarianRoutes.map((route) => [label(route), route] as const))(
    '%s sem sessão responde 401',
    async (_name, route) => {
      const { status, body } = await server.call(route)

      expect(status).toBe(401)
      expect(body.code).toBe('unauthorized')
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

describe('validação da entrada antes de chegar ao banco', () => {
  it('POST /queues sem edições responde 400 com o campo errado', async () => {
    const { status, body } = await server.call(
      { method: 'POST', path: '/queues', body: { bookIds: [] } },
      'student',
    )

    expect(status).toBe(400)
    expect(body.code).toBe('validation_error')
  })

  it('POST /queues com a mesma edição repetida responde 400', async () => {
    const { status } = await server.call(
      { method: 'POST', path: '/queues', body: { bookIds: ['a', 'a'] } },
      'student',
    )

    expect(status).toBe(400)
  })

  it('remover da fila sem motivo responde 400', async () => {
    const { status, body } = await server.call(
      {
        method: 'POST',
        path: '/librarian/queues/qe1/remove',
        body: { reason: '   ' },
      },
      'librarian',
    )

    expect(status).toBe(400)
    expect(body.code).toBe('validation_error')
  })

  it('mover para a posição 0 responde 400', async () => {
    const { status } = await server.call(
      {
        method: 'PATCH',
        path: '/librarian/queues/qe1/position',
        body: { position: 0 },
      },
      'librarian',
    )

    expect(status).toBe(400)
  })

  it('adicionar com matrícula de 6 dígitos responde 400', async () => {
    const { status } = await server.call(
      {
        method: 'POST',
        path: '/librarian/books/book1/queue',
        body: { matricula: '123456' },
      },
      'librarian',
    )

    expect(status).toBe(400)
  })
})
