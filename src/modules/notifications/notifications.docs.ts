import {
  bearerAuth,
  jsonBody,
  jsonContent,
  registry,
} from '../../docs/registry.js'
import { errorResponseSchema } from '../../shared/error-response.js'
import {
  deviceBodySchema,
  deviceParamsSchema,
  notificationPrefsBodySchema,
} from './schemas/request.schemas.js'
import {
  deviceSchema,
  notificationPrefsSchema,
  notificationsResponseSchema,
} from './schemas/response.schemas.js'

// Swagger das rotas de avisos do aluno (RF-AVI-01 a RF-AVI-04). Fica pronto antes
// do código das rotas. O envio por push e por e-mail não tem rota: sai sozinho
// quando algo gera um aviso (sua vez, retirada, devolução, multa...).

const error = (description: string) => ({
  description,
  content: jsonContent(errorResponseSchema),
})

const security = [{ [bearerAuth.name]: [] }]

const invalidData = error(
  'Dados inválidos (`validation_error`, com os campos errados).',
)
const noSession = error('Sem sessão ou sessão expirada (`unauthorized`).')
const notStudent = error(
  'Perfil errado (`forbidden`): só o aluno usa esta rota.',
)

const tags = ['Avisos (aluno)']

registry.registerPath({
  method: 'get',
  path: '/me/notifications',
  tags,
  summary: 'Notificações do aluno',
  description:
    'Lista os avisos de dentro do app (sua vez, prazo, atraso, devolução, fila...), os mais novos primeiro, até 100. `unreadCount` conta os não lidos da lista, para o número do sino. Os avisos sempre aparecem aqui, mesmo que o push ou o e-mail estejam desligados ou tenham falhado (RF-AVI-01, RF-AVI-04).',
  security,
  responses: {
    200: {
      description: 'Os avisos do aluno.',
      content: jsonContent(notificationsResponseSchema),
    },
    401: noSession,
    403: notStudent,
  },
})

registry.registerPath({
  method: 'post',
  path: '/me/notifications/read-all',
  tags,
  summary: 'Marca todas as notificações como lidas',
  description:
    'Preenche `readAt` nos avisos que ainda não foram lidos. Sem avisos novos, nada muda (RF-AVI-01).',
  security,
  responses: {
    204: { description: 'Todos os avisos estão lidos.' },
    401: noSession,
    403: notStudent,
  },
})

registry.registerPath({
  method: 'patch',
  path: '/me/notification-prefs',
  tags,
  summary: 'Liga e desliga avisos e canais',
  description:
    'Muda só as chaves enviadas. `queueTurn` (Sua vez na fila) e `overdueAndFines` (Atraso e multa) ficam sempre ligados: a API recusa `false` nelas (`validation_error`). `channelPush` e `channelEmail` ligam e desligam os canais. As preferências também vêm em `GET /me`. Os avisos dentro do app aparecem sempre; as preferências só decidem o push e o e-mail (RF-AVI-03).',
  security,
  request: { body: jsonBody(notificationPrefsBodySchema) },
  responses: {
    200: {
      description: 'As preferências depois da mudança.',
      content: jsonContent(notificationPrefsSchema),
    },
    400: invalidData,
    401: noSession,
    403: notStudent,
  },
})

registry.registerPath({
  method: 'put',
  path: '/me/devices/{deviceId}',
  tags,
  summary: 'Registra ou atualiza o aparelho para o push',
  description:
    'O app chama ao abrir, com o ID de instalação (`deviceId`) e o token do Expo. Só o Android recebe push: no iPhone o token é ignorado e os avisos ficam dentro do app. Chamar de novo atualiza `lastSeenAt` e, se o token mudou, volta a ligar o push do aparelho (RF-AVI-02).',
  security,
  request: { params: deviceParamsSchema, body: jsonBody(deviceBodySchema) },
  responses: {
    200: {
      description: 'O aparelho registrado.',
      content: jsonContent(deviceSchema),
    },
    400: invalidData,
    401: noSession,
    403: notStudent,
  },
})

registry.registerPath({
  method: 'delete',
  path: '/me/devices/{deviceId}',
  tags,
  summary: 'Remove o aparelho (para de receber push)',
  description:
    'O app chama ao sair da conta. Aparelho que não estava registrado: nada muda (RF-AVI-02).',
  security,
  request: { params: deviceParamsSchema },
  responses: {
    204: { description: 'O aparelho não recebe mais push.' },
    401: noSession,
    403: notStudent,
  },
})
