import type { ZodType } from 'zod'
import { bearerAuth, registry } from '../../docs/registry.js'
import { errorResponseSchema } from '../../shared/error-response.js'
import {
  customTokenResponseSchema,
  matriculaBodySchema,
  meResponseSchema,
  messageResponseSchema,
  passkeyCreationOptionsSchema,
  passkeyListResponseSchema,
  passkeyLoginVerifyBodySchema,
  passkeyParamsSchema,
  passkeyRegisterBodySchema,
  passkeyRequestOptionsSchema,
  passkeySummarySchema,
  passwordResetBodySchema,
  signupConfirmBodySchema,
  signupConfirmResponseSchema,
  signupPendingResponseSchema,
  signupStartBodySchema,
  updateMeBodySchema,
} from './auth.schemas.js'

const json = (schema: ZodType) => ({ 'application/json': { schema } })
const body = (schema: ZodType) => ({ required: true, content: json(schema) })
const error = (description: string) => ({
  description,
  content: json(errorResponseSchema),
})

const security = [{ [bearerAuth.name]: [] }]

const invalidData = error(
  'Dados inválidos (`validation_error`, com os campos errados).',
)
const noSession = error('Sem sessão ou sessão expirada (`unauthorized`).')
const notStudent = error(
  'Perfil errado (`forbidden`): só o aluno usa esta rota.',
)
const tokenFailed = error(
  'Token errado, vencido ou já usado (`token_invalid`, `token_expired_or_used`, `token_attempts_exceeded`).',
)
const tooSoon = error(
  'Novo token pedido antes de 60 segundos (`token_resend_too_soon`, com `retryAfterSeconds`).',
)

// --- Sign-up -----------------------------------------------------------------

registry.registerPath({
  method: 'post',
  path: '/auth/signup/start',
  tags: ['Acesso'],
  summary: 'Inicia o cadastro do aluno',
  description:
    'Valida o e-mail institucional (`@edu.unifor.br`), a matrícula (7 dígitos) e a senha (só números, mínimo 8). Cria a conta desativada e envia o token de 6 dígitos (vale 20 minutos). ' +
    'Repetir a chamada com a mesma matrícula, enquanto o e-mail não foi confirmado, troca o e-mail e a senha.',
  request: { body: body(signupStartBodySchema) },
  responses: {
    202: {
      description: 'Cadastro criado; o token foi enviado ao e-mail.',
      content: json(signupPendingResponseSchema),
    },
    400: invalidData,
    409: error(
      'Matrícula ou e-mail já cadastrados (`signup_conflict`, com os campos repetidos).',
    ),
    429: tooSoon,
    502: error(
      'Falha ao enviar o e-mail (`email_delivery_failed`). O cadastro fica pendente e pode ser reenviado.',
    ),
  },
})

registry.registerPath({
  method: 'post',
  path: '/auth/signup/confirm',
  tags: ['Acesso'],
  summary: 'Confirma o e-mail com o token',
  description:
    'Confere o token, ativa a conta e devolve as opções para o celular criar o passkey.',
  request: { body: body(signupConfirmBodySchema) },
  responses: {
    200: {
      description: 'E-mail confirmado.',
      content: json(signupConfirmResponseSchema),
    },
    400: error('Dados inválidos ou token errado, vencido ou já usado.'),
  },
})

registry.registerPath({
  method: 'post',
  path: '/auth/signup/resend',
  tags: ['Acesso'],
  summary: 'Reenvia o token de confirmação',
  request: { body: body(matriculaBodySchema) },
  responses: {
    202: {
      description: 'Novo token enviado; o anterior deixa de valer.',
      content: json(signupPendingResponseSchema),
    },
    400: invalidData,
    404: error(
      'Não há cadastro aguardando confirmação para a matrícula (`signup_not_found`).',
    ),
    429: tooSoon,
    502: error('Falha ao enviar o e-mail (`email_delivery_failed`).'),
  },
})

// --- Password -----------------------------------------------------------------

registry.registerPath({
  method: 'post',
  path: '/auth/password/recover',
  tags: ['Acesso'],
  summary: 'Pede o token de recuperação de senha',
  description:
    'Para aluno e bibliotecário. A API acha o e-mail da conta pela matrícula e responde sempre a mesma mensagem (200), exista a conta ou não e mesmo dentro dos 60 segundos desde o último token. Nesse caso só não envia outro e-mail.',
  request: { body: body(matriculaBodySchema) },
  responses: {
    200: {
      description: 'Mensagem genérica.',
      content: json(messageResponseSchema),
    },
    400: invalidData,
  },
})

registry.registerPath({
  method: 'post',
  path: '/auth/password/reset',
  tags: ['Acesso'],
  summary: 'Define a nova senha com o token',
  description:
    'Confere o token e grava a nova senha (só números, mínimo 8). Os refresh tokens da conta são revogados.',
  request: { body: body(passwordResetBodySchema) },
  responses: {
    204: { description: 'Senha alterada.' },
    400: tokenFailed,
  },
})

// --- Passkey ------------------------------------------------------------------

registry.registerPath({
  method: 'post',
  path: '/auth/passkey/register',
  tags: ['Acesso'],
  summary: 'Registra o passkey criado pelo celular',
  description:
    'Sem sessão: o desafio, emitido para a conta no fim do cadastro ou em `POST /auth/passkeys`, identifica quem registra. Guarda só a chave pública.',
  request: { body: body(passkeyRegisterBodySchema) },
  responses: {
    201: {
      description: 'Passkey registrado.',
      content: json(passkeySummarySchema),
    },
    400: error(
      'Dados inválidos, desafio vencido ou resposta recusada (`passkey_challenge_invalid`, `passkey_registration_failed`).',
    ),
    409: error(
      'O aparelho já tem este passkey (`passkey_already_registered`).',
    ),
  },
})

registry.registerPath({
  method: 'post',
  path: '/auth/passkey/login/options',
  tags: ['Acesso'],
  summary: 'Pede o desafio do login com passkey',
  description:
    'Devolve um desafio novo e os passkeys da matrícula. Matrícula sem passkey ou sem conta recebe a mesma resposta, com a lista vazia.',
  request: { body: body(matriculaBodySchema) },
  responses: {
    200: {
      description: 'Opções para o celular.',
      content: json(passkeyRequestOptionsSchema),
    },
    400: invalidData,
  },
})

registry.registerPath({
  method: 'post',
  path: '/auth/passkey/login/verify',
  tags: ['Acesso'],
  summary: 'Confere o passkey e devolve o custom token',
  description:
    'O app troca o custom token pela sessão com `signInWithCustomToken`.',
  request: { body: body(passkeyLoginVerifyBodySchema) },
  responses: {
    200: {
      description: 'Assinatura válida.',
      content: json(customTokenResponseSchema),
    },
    400: invalidData,
    401: error('Passkey recusado (`passkey_login_failed`).'),
  },
})

registry.registerPath({
  method: 'get',
  path: '/auth/passkeys',
  tags: ['Acesso'],
  summary: 'Lista os passkeys do aluno',
  security,
  responses: {
    200: {
      description: 'Aparelhos cadastrados.',
      content: json(passkeyListResponseSchema),
    },
    401: noSession,
    403: notStudent,
  },
})

registry.registerPath({
  method: 'post',
  path: '/auth/passkeys',
  tags: ['Acesso'],
  summary: 'Pede as opções para criar um passkey neste aparelho',
  description:
    'O registro termina em `POST /auth/passkey/register`. O aparelho que já tem um passkey da conta recusa criar outro.',
  security,
  responses: {
    200: {
      description: 'Opções para o celular.',
      content: json(passkeyCreationOptionsSchema),
    },
    401: noSession,
    403: notStudent,
  },
})

registry.registerPath({
  method: 'delete',
  path: '/auth/passkeys/{id}',
  tags: ['Acesso'],
  summary: 'Remove um passkey do aluno',
  security,
  request: { params: passkeyParamsSchema },
  responses: {
    204: { description: 'Passkey removido.' },
    401: noSession,
    403: notStudent,
    404: error('Passkey não encontrado (`passkey_not_found`).'),
  },
})

// --- Session -------------------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/me',
  tags: ['Acesso'],
  summary: 'Dados de quem está logado',
  security,
  responses: {
    200: { description: 'Perfil da conta.', content: json(meResponseSchema) },
    401: noSession,
    403: error(
      'Conta sem perfil ou desativada (`profile_not_found`, `account_disabled`).',
    ),
  },
})

registry.registerPath({
  method: 'patch',
  path: '/me',
  tags: ['Acesso'],
  summary: 'Informa o nome completo do aluno',
  description:
    'Nome e sobrenome, de 3 a 100 caracteres. Grava também o nome normalizado e as iniciais.',
  security,
  request: { body: body(updateMeBodySchema) },
  responses: {
    200: { description: 'Perfil atualizado.', content: json(meResponseSchema) },
    400: invalidData,
    401: noSession,
    403: notStudent,
  },
})

registry.registerPath({
  method: 'post',
  path: '/auth/logout',
  tags: ['Acesso'],
  summary: 'Encerra a sessão',
  description:
    'Revoga os refresh tokens do usuário no Firebase. O app também sai do Firebase.',
  security,
  responses: {
    204: { description: 'Sessão encerrada.' },
    401: noSession,
  },
})
