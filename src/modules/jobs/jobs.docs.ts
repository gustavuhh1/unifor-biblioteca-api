import { jsonContent, registry, schedulerAuth } from '../../docs/registry.js'
import { errorResponseSchema } from '../../shared/error-response.js'
import { jobParamsSchema } from './schemas/request.schemas.js'
import { jobRunSchema } from './schemas/response.schemas.js'

// Swagger das rotinas agendadas (RF-SIS-05, RF-EMP-06, RF-FIL-07). Fica pronto antes
// do código da rota. Só o Cloud Scheduler chama: o token é o OIDC da conta de
// serviço dele, não a sessão de um aluno nem de um bibliotecário.

const error = (description: string) => ({
  description,
  content: jsonContent(errorResponseSchema),
})

registry.registerPath({
  method: 'post',
  path: '/jobs/{job}',
  tags: ['Rotinas (Cloud Scheduler)'],
  summary: 'Roda uma rotina agendada',
  description:
    'Chamada só pelo **Cloud Scheduler**, com o token OIDC da conta de serviço `unibooks-scheduler` (audiência `https://api.uni-books.app`); nenhuma outra identidade serve, nem a de um bibliotecário. Cada execução é registrada em `jobRuns`. Rodar a mesma rotina duas vezes seguidas não repete o trabalho: cada documento é conferido de novo na própria transação. As rotinas:\n\n' +
    '- `expire_pickups` (a cada 15 min): pedido `awaiting_pickup` com o prazo vencido vira `expired`, o exemplar vai para o 1º da fila ou volta à estante e o aluno recebe "Seu pedido expirou" (RF-EMP-06).\n' +
    '- `advance_queues` (a cada 5 min): quem passou das 24h para confirmar a vez vira `missed` e o próximo da fila ganha a vez (RF-FIL-07).\n' +
    '- `due_reminders` (todo dia, 8h): lembrete 2 dias antes e no dia do vencimento, aviso de atraso e aviso de último dia para retirar o pedido (RF-SIS-05).\n' +
    '- `accrue_fines` (todo dia, 6h): cria a multa `accruing` do empréstimo que passou a ter dia útil de atraso (RF-MUL-01).\n' +
    '- `refresh_holidays` (segunda, 3h): busca na FeriadosAPI os feriados do ano atual e do próximo, se faltarem (RF-SIS-01).',
  security: [{ [schedulerAuth.name]: [] }],
  request: { params: jobParamsSchema },
  responses: {
    200: {
      description: 'A rotina terminou.',
      content: jsonContent(jobRunSchema),
    },
    400: error('Rotina desconhecida (`validation_error`).'),
    401: error(
      'Sem token do Google, ou token inválido (`scheduler_unauthorized`).',
    ),
    403: error('Token do Google de outra conta de serviço (`forbidden`).'),
    500: error(
      'A rotina falhou (`job_failed`); o erro fica em `jobRuns` e o Scheduler tenta de novo conforme a configuração dele.',
    ),
  },
})
