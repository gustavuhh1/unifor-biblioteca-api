import {
  bearerAuth,
  jsonBody,
  jsonContent,
  registry,
} from '../../docs/registry.js'
import { errorResponseSchema } from '../../shared/error-response.js'
import { bookParamsSchema } from '../catalog/schemas/request.schemas.js'
import {
  folderBodySchema,
  folderBookParamsSchema,
  folderParamsSchema,
  savedListQuerySchema,
} from './schemas/request.schemas.js'
import {
  folderSchema,
  foldersResponseSchema,
  savedBookSchema,
  savedBooksResponseSchema,
} from './schemas/response.schemas.js'

// Swagger das rotas de Salvos do aluno (RF-SAL-01 a RF-SAL-03). Fica pronto antes
// do código das rotas. Todas são só do aluno e só mexem nos Salvos de quem está
// logado.

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
const folderNotFound = error('A pasta não existe (`folder_not_found`).')
const bookNotFound = error(
  'O livro não existe ou foi removido do acervo (`book_not_found`).',
)

const tags = ['Salvos (aluno)']

registry.registerPath({
  method: 'get',
  path: '/me/saved',
  tags,
  summary: 'Livros salvos: "Todos os salvos" ou os de uma pasta',
  description:
    'Lista os livros salvos do aluno, os salvos há menos tempo primeiro, no formato do card do acervo (com a disponibilidade de agora) mais `savedAt` e `folderIds`. Com `folderId`, só os livros daquela pasta. Livros removidos do acervo não aparecem (RF-SAL-01, RF-SAL-03).',
  security,
  request: { query: savedListQuerySchema },
  responses: {
    200: {
      description: 'Os livros salvos.',
      content: jsonContent(savedBooksResponseSchema),
    },
    400: invalidData,
    401: noSession,
    403: notStudent,
    404: folderNotFound,
  },
})

registry.registerPath({
  method: 'put',
  path: '/me/saved/{bookId}',
  tags,
  summary: 'Salva um livro em "Todos os salvos"',
  description:
    'Botão Salvar da página do livro. Salvar de novo um livro já salvo não muda nada (mantém `savedAt` e as pastas), então o app pode chamar sem conferir antes (RF-SAL-01).',
  security,
  request: { params: bookParamsSchema },
  responses: {
    200: {
      description: 'O livro salvo.',
      content: jsonContent(savedBookSchema),
    },
    401: noSession,
    403: notStudent,
    404: bookNotFound,
  },
})

registry.registerPath({
  method: 'delete',
  path: '/me/saved/{bookId}',
  tags,
  summary: 'Tira um livro de "Todos os salvos"',
  description:
    'O livro sai também de todas as pastas em que estava, e a contagem de cada pasta cai. Se o livro não estava salvo, nada muda (RF-SAL-01).',
  security,
  request: { params: bookParamsSchema },
  responses: {
    204: { description: 'O livro não está mais salvo.' },
    401: noSession,
    403: notStudent,
  },
})

registry.registerPath({
  method: 'get',
  path: '/me/folders',
  tags,
  summary: 'Pastas de Salvos',
  description:
    'Lista as pastas do aluno, da mais antiga para a mais nova, com a contagem de livros de cada uma, e devolve em `savedCount` quantos livros há em "Todos os salvos" (RF-SAL-02).',
  security,
  responses: {
    200: {
      description: 'As pastas e a contagem de "Todos os salvos".',
      content: jsonContent(foldersResponseSchema),
    },
    401: noSession,
    403: notStudent,
  },
})

registry.registerPath({
  method: 'post',
  path: '/me/folders',
  tags,
  summary: 'Cria uma pasta',
  description:
    'O nome tem de 1 a 30 caracteres (espaços nas pontas são ignorados). A pasta nasce vazia (RF-SAL-02).',
  security,
  request: { body: jsonBody(folderBodySchema) },
  responses: {
    201: { description: 'A pasta criada.', content: jsonContent(folderSchema) },
    400: invalidData,
    401: noSession,
    403: notStudent,
  },
})

registry.registerPath({
  method: 'patch',
  path: '/me/folders/{folderId}',
  tags,
  summary: 'Renomeia uma pasta',
  description: 'Mesma regra de nome da criação (RF-SAL-02).',
  security,
  request: {
    params: folderParamsSchema,
    body: jsonBody(folderBodySchema),
  },
  responses: {
    200: {
      description: 'A pasta com o nome novo.',
      content: jsonContent(folderSchema),
    },
    400: invalidData,
    401: noSession,
    403: notStudent,
    404: folderNotFound,
  },
})

registry.registerPath({
  method: 'delete',
  path: '/me/folders/{folderId}',
  tags,
  summary: 'Apaga uma pasta',
  description:
    'Os livros da pasta **não** saem de "Todos os salvos": só perdem a ligação com a pasta (RF-SAL-02).',
  security,
  request: { params: folderParamsSchema },
  responses: {
    204: { description: 'A pasta foi apagada.' },
    401: noSession,
    403: notStudent,
    404: folderNotFound,
  },
})

registry.registerPath({
  method: 'put',
  path: '/me/folders/{folderId}/books/{bookId}',
  tags,
  summary: 'Coloca um livro salvo numa pasta',
  description:
    'O livro precisa estar em "Todos os salvos" (senão `book_not_saved`). Colocar de novo um livro que já está na pasta não muda nada. Um livro pode estar em várias pastas (RF-SAL-03).',
  security,
  request: { params: folderBookParamsSchema },
  responses: {
    200: {
      description: 'O livro salvo, com as pastas atualizadas.',
      content: jsonContent(savedBookSchema),
    },
    401: noSession,
    403: notStudent,
    404: error('A pasta não existe (`folder_not_found`).'),
    409: error('O livro não está salvo (`book_not_saved`).'),
  },
})

registry.registerPath({
  method: 'delete',
  path: '/me/folders/{folderId}/books/{bookId}',
  tags,
  summary: 'Tira um livro de uma pasta',
  description:
    'O livro continua em "Todos os salvos". Se ele não estava na pasta, nada muda (RF-SAL-03).',
  security,
  request: { params: folderBookParamsSchema },
  responses: {
    204: { description: 'O livro não está mais na pasta.' },
    401: noSession,
    403: notStudent,
    404: folderNotFound,
  },
})
