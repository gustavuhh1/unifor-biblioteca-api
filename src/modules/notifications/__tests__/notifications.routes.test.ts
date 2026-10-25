import { afterAll, describe, expect, it, vi } from 'vitest'
import type { RouteCall } from '../../../test-support/route-harness.js'

vi.mock('../../../middlewares/auth.js', async () => {
  const { fakeAuthenticate } =
    await import('../../../test-support/route-harness.js')
  return { authenticate: fakeAuthenticate }
})

const { serveRouter } = await import('../../../test-support/route-harness.js')
const { notificationsRouter } = await import('../notifications.routes.js')

const server = await serveRouter(notificationsRouter)

afterAll(() => server.close())

const routes: RouteCall[] = [
  { method: 'GET', path: '/me/notifications' },
  { method: 'POST', path: '/me/notifications/read-all' },
  {
    method: 'PATCH',
    path: '/me/notification-prefs',
    body: { dueReminders: false },
  },
  {
    method: 'PUT',
    path: '/me/devices/device1',
    body: { platform: 'android' },
  },
  { method: 'DELETE', path: '/me/devices/device1' },
]

const label = (route: RouteCall) => `${route.method} ${route.path}`
const cases = routes.map((route) => [label(route), route] as const)

describe('rotas de avisos: só o aluno (RF-AVI-01 a RF-AVI-03)', () => {
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

describe('validação das rotas de avisos', () => {
  it('PATCH /me/notification-prefs recusa desligar "Sua vez na fila" com 400', async () => {
    const { status, body } = await server.call(
      {
        method: 'PATCH',
        path: '/me/notification-prefs',
        body: { queueTurn: false },
      },
      'student',
    )

    expect(status).toBe(400)
    expect(body.code).toBe('validation_error')
  })

  it('PUT /me/devices/:deviceId recusa plataforma desconhecida com 400', async () => {
    const { status } = await server.call(
      {
        method: 'PUT',
        path: '/me/devices/device1',
        body: { platform: 'windows' },
      },
      'student',
    )

    expect(status).toBe(400)
  })
})
