import { afterAll, describe, expect, it, vi } from 'vitest'

vi.mock('../../../middlewares/auth.js', async () => {
  const { fakeAuthenticate } =
    await import('../../../test-support/route-harness.js')
  return { authenticate: fakeAuthenticate }
})

vi.mock('../services/library-info.service.js', () => ({
  getLibraryInfo: async () => ({ officialRulesUrl: 'https://exemplo' }),
}))

const { serveRouter } = await import('../../../test-support/route-harness.js')
const { libraryRouter } = await import('../library.routes.js')

const server = await serveRouter(libraryRouter)

afterAll(() => server.close())

const route = { method: 'GET', path: '/library/info' } as const

describe('rota das Regras da biblioteca (RF-PER-02)', () => {
  it('GET /library/info sem sessão responde 401', async () => {
    const { status, body } = await server.call(route)

    expect(status).toBe(401)
    expect(body.code).toBe('unauthorized')
  })

  it('GET /library/info responde 200 ao aluno', async () => {
    expect((await server.call(route, 'student')).status).toBe(200)
  })

  it('GET /library/info responde 200 também ao bibliotecário', async () => {
    expect((await server.call(route, 'librarian')).status).toBe(200)
  })
})
