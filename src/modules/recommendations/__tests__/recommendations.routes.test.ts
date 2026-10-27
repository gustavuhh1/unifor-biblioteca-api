import { afterAll, describe, expect, it, vi } from 'vitest'
import { FakeFirestore } from '../../../test-support/fake-firestore.js'
import { USER_ROLE } from '../../../shared/types/index.js'
import { recommendationsResponseSchema } from '../schemas/response.schemas.js'

vi.mock('../../../middlewares/auth.js', async () => {
  const { fakeAuthenticate } =
    await import('../../../test-support/route-harness.js')
  return { authenticate: fakeAuthenticate }
})
vi.mock('../../../config/firebase.js', () => ({
  getDb: () => new FakeFirestore(),
}))
const { serveRouter } = await import('../../../test-support/route-harness.js')
const { recommendationsRouter } = await import('../recommendations.routes.js')
const server = await serveRouter(recommendationsRouter)
afterAll(() => server.close())
const route = { method: 'GET', path: '/me/recommendations' } as const

describe('rota de recomendações: só o aluno (RF-ASS-03)', () => {
  it('sem sessão responde 401', async () => {
    expect((await server.call(route)).status).toBe(401)
  })
  it('bibliotecário recebe 403', async () => {
    expect(await server.call(route, USER_ROLE.librarian)).toMatchObject({
      status: 403,
      body: { code: 'forbidden' },
    })
  })
  it('aluno recebe 200 com o contrato documentado', async () => {
    const response = await server.call(route, USER_ROLE.student)
    expect(response.status).toBe(200)
    expect(recommendationsResponseSchema.safeParse(response.body).success).toBe(
      true,
    )
    expect(response.body).toMatchObject({ items: [], reasonText: null })
  })
})
