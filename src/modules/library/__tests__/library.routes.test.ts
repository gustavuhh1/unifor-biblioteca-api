import { afterAll, describe, expect, it, vi } from 'vitest'
import { FakeFirestore } from '../../../test-support/fake-firestore.js'
import { USER_ROLE } from '../../../shared/types/index.js'
import { libraryInfoSchema } from '../schemas/response.schemas.js'

vi.mock('../../../middlewares/auth.js', async () => {
  const { fakeAuthenticate } =
    await import('../../../test-support/route-harness.js')
  return { authenticate: fakeAuthenticate }
})
vi.mock('../../../config/firebase.js', () => ({
  getDb: () => new FakeFirestore(),
}))
const { serveRouter } = await import('../../../test-support/route-harness.js')
const { libraryRouter } = await import('../library.routes.js')
const server = await serveRouter(libraryRouter)
afterAll(() => server.close())
const route = { method: 'GET', path: '/library/info' } as const

describe('rota das regras da biblioteca (RF-PER-02)', () => {
  it('sem sessão responde 401', async () => {
    expect((await server.call(route)).status).toBe(401)
  })
  it.each(Object.values(USER_ROLE))(
    'com o perfil %s responde 200 com o contrato documentado',
    async (role) => {
      const response = await server.call(route, role)
      expect(response.status).toBe(200)
      expect(libraryInfoSchema.safeParse(response.body).success).toBe(true)
    },
  )
})
