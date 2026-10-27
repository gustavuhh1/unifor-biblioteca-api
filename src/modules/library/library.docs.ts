import { bearerAuth, jsonContent, registry } from '../../docs/registry.js'
import { errorResponseSchema } from '../../shared/error-response.js'
import { libraryInfoResponseSchema } from './schemas/response.schemas.js'

// Swagger da rota das Regras da biblioteca (RF-PER-02). Fica pronto antes do
// código da rota.

const error = (description: string) => ({
  description,
  content: jsonContent(errorResponseSchema),
})

const security = [{ [bearerAuth.name]: [] }]

registry.registerPath({
  method: 'get',
  path: '/library/info',
  tags: ['Biblioteca'],
  summary: 'Regras da biblioteca',
  description:
    'Horários, contatos, link da página oficial e os números das regras (limites, prazos e multa), lidos de `settings/library`. Mudar um valor lá muda a tela sem novo build do app. Vale para qualquer perfil logado. Campo ausente ou inválido no documento cai no padrão do projeto. A regra de perda ou dano da obra é texto fixo do app: a API não controla reposição.',
  security,
  responses: {
    200: {
      description: 'Horários, contatos, link oficial e números das regras.',
      content: jsonContent(libraryInfoResponseSchema),
    },
    401: error('Sem sessão ou sessão expirada (`unauthorized`).'),
    403: error(
      'Conta sem perfil ou desativada (`profile_not_found`, `account_disabled`).',
    ),
  },
})
