import express, {
  type Request,
  type RequestHandler,
  type Router,
} from 'express'
import type { AddressInfo } from 'node:net'
import { errorHandler, notFoundHandler } from '../middlewares/error-handler.js'
import { unauthorized } from '../shared/errors.js'
import { userRoleSchema } from '../shared/user-role.js'

// Nome do cabeçalho com que o teste diz qual perfil está logado.
export const TEST_ROLE_HEADER = 'x-test-role'

// Substituto do `authenticate` nos testes de rota: sem o cabeçalho de perfil não
// há sessão (401); com ele, o usuário é daquele perfil. O `authenticate` de verdade
// é testado em middlewares/auth.test.ts.
export const fakeAuthenticate: RequestHandler = (req, _res, next) => {
  const role = userRoleSchema.safeParse(req.header(TEST_ROLE_HEADER))
  if (!role.success) throw unauthorized()
  ;(req as Request).user = { uid: 'uid-teste', role: role.data }
  next()
}

// Uma rota a chamar no teste.
export interface RouteCall {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  body?: unknown
}

// Sobe o router num servidor local, numa porta livre, com os handlers de 404 e de
// erros da API, e devolve como chamar uma rota e como encerrar.
export async function serveRouter(router: Router) {
  const app = express()
  app.use(express.json())
  app.use(router)
  app.use(notFoundHandler)
  app.use(errorHandler)

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const started = app.listen(0, () => resolve(started))
  })
  const { port } = server.address() as AddressInfo

  return {
    // Endereço do servidor, para quem precisa montar a própria chamada (cabeçalho
    // de autorização diferente do de perfil).
    baseUrl: `http://127.0.0.1:${port}`,
    // Chama a rota como o perfil dado (ou sem sessão) e devolve o status e o corpo.
    async call(route: RouteCall, role?: 'student' | 'librarian') {
      const response = await fetch(`http://127.0.0.1:${port}${route.path}`, {
        method: route.method,
        headers: {
          'content-type': 'application/json',
          ...(role ? { [TEST_ROLE_HEADER]: role } : {}),
        },
        ...(route.body === undefined
          ? {}
          : { body: JSON.stringify(route.body) }),
      })
      return {
        status: response.status,
        body: (await response.json()) as { code?: string },
      }
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
      }),
  }
}
