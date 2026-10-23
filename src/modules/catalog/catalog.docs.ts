import type { ZodType } from 'zod'
import { bearerAuth, jsonContent, registry } from '../../docs/registry.js'
import { errorResponseSchema } from '../../shared/error-response.js'
import {
  bookParamsSchema,
  createBookBodySchema,
  isbnParamsSchema,
  librarianListBooksQuerySchema,
  listBooksQuerySchema,
  updateBookBodySchema,
} from './schemas/request.schemas.js'
import {
  bookDetailSchema,
  bookListResponseSchema,
  bookMetadataLookupResponseSchema,
  bookRecordSchema,
  librarianBookListResponseSchema,
  syncBookResponseSchema,
} from './schemas/response.schemas.js'

const body = (schema: ZodType) => ({
  required: true,
  content: jsonContent(schema),
})
const error = (description: string) => ({
  description,
  content: jsonContent(errorResponseSchema),
})

const security = [{ [bearerAuth.name]: [] }]

const invalidData = error(
  'Dados inválidos (`validation_error`, com os campos errados).',
)
const noSession = error('Sem sessão ou sessão expirada (`unauthorized`).')
const notLibrarian = error(
  'Perfil errado (`forbidden`): só o bibliotecário usa esta rota.',
)
const bookNotFound = error(
  'O livro não existe ou foi removido do acervo (`book_not_found`).',
)
const metadataUnavailable = error(
  'Nenhuma fonte achou o ISBN e alguma não respondeu: rede, tempo esgotado, 429 ou 5xx (`book_metadata_unavailable`). Nada é alterado.',
)

// --- Busca e página do livro (aluno e bibliotecário) --------------------------

registry.registerPath({
  method: 'get',
  path: '/books',
  tags: ['Acervo'],
  summary: 'Busca livros no acervo',
  description:
    'Busca por título, subtítulo, autor, assunto e ISBN, ignorando acento e maiúsculas. Todos os termos de `q` precisam aparecer; `q` vazio lista tudo. Ordena por título. Livros removidos nunca aparecem; livros marcados como indisponíveis para novos pedidos aparecem. Roda em memória, com cache de cerca de 60 segundos por instância, e nunca consulta as fontes externas.',
  security,
  request: { query: listBooksQuerySchema },
  responses: {
    200: {
      description: 'Uma página de resultados, com o resumo de cada card.',
      content: jsonContent(bookListResponseSchema),
    },
    400: invalidData,
    401: noSession,
  },
})

registry.registerPath({
  method: 'get',
  path: '/books/{bookId}',
  tags: ['Acervo'],
  summary: 'Página do livro',
  description:
    'Campos de exibição, exemplares (registro, formato e situação), devolução prevista e fila. Para o aluno traz `action`, o que o botão fixo faz: `request` quando há exemplar disponível, `join_queue` quando não há, com `allowed` e, se bloqueado, `blockedReason` (`unavailable`, `overdue`, `same_title`, `loan_limit`, `queue_limit`, `not_queueable`). Para o bibliotecário `action` é null.',
  security,
  request: { params: bookParamsSchema },
  responses: {
    200: {
      description: 'O livro.',
      content: jsonContent(bookDetailSchema),
    },
    401: noSession,
    404: bookNotFound,
  },
})

// --- Gestão do acervo (bibliotecário) -----------------------------------------

registry.registerPath({
  method: 'get',
  path: '/librarian/books',
  tags: ['Acervo (bibliotecário)'],
  summary: 'Lista e busca o acervo',
  description:
    'A mesma busca de `GET /books`, com o filtro `all`, `no_isbn` (livros sem ISBN) ou `unavailable` (marcados como indisponíveis para novos pedidos). Só livros ativos. Cada item traz o registro completo, sem o texto de busca.',
  security,
  request: { query: librarianListBooksQuerySchema },
  responses: {
    200: {
      description: 'Uma página de registros completos.',
      content: jsonContent(librarianBookListResponseSchema),
    },
    400: invalidData,
    401: noSession,
    403: notLibrarian,
  },
})

registry.registerPath({
  method: 'get',
  path: '/librarian/books/isbn/{isbn}',
  tags: ['Acervo (bibliotecário)'],
  summary: 'Consulta um ISBN nas fontes externas',
  description:
    'Consulta a Open Library e a BrasilAPI ao mesmo tempo (5 s para cada) e combina as respostas: a Open Library vem primeiro em título, autores, capa e assuntos; a BrasilAPI traz a sinopse e preenche o que faltar. Só consulta: não grava nada. Devolve os dados já no formato do livro, para pré-preencher o cadastro, e as `sources` que responderam com dados. ISBN que nenhuma fonte conhece responde 200 com `found: false`, e o app avisa em vermelho para preencher à mão. Se nenhuma fonte achou e alguma não respondeu, responde 502. O ISBN aceita hífens e espaços.',
  security,
  request: { params: isbnParamsSchema },
  responses: {
    200: {
      description: 'ISBN encontrado ou não.',
      content: jsonContent(bookMetadataLookupResponseSchema),
    },
    400: invalidData,
    401: noSession,
    403: notLibrarian,
    502: metadataUnavailable,
  },
})

registry.registerPath({
  method: 'post',
  path: '/librarian/books',
  tags: ['Acervo (bibliotecário)'],
  summary: 'Cadastra um livro e os exemplares',
  description:
    'Numa transação: cria a obra (ou acrescenta a edição à obra do mesmo título e primeiro autor), o livro e os exemplares (todos `available`). CDU, Cutter e estante são sempre informados à mão. Com ISBN, consulta as fontes externas (Open Library e BrasilAPI) antes de gravar: se elas acharam, grava `externalMetadata` e `dataSource` fica `external` quando título, autores, editora e sinopse estão como elas mandaram, ou `mixed` se foram alterados à mão. Se nenhuma achou, ou não responderam, o cadastro segue e `dataSource` é `manual` (`externalMetadata.found: false`). Sem ISBN, `dataSource` é `manual`. O registro de cada exemplar é único.',
  security,
  request: { body: body(createBookBodySchema) },
  responses: {
    201: {
      description: 'Livro cadastrado.',
      content: jsonContent(bookRecordSchema),
    },
    400: invalidData,
    401: noSession,
    403: notLibrarian,
    409: error(
      'Registro de exemplar já existe ou está repetido no corpo (`registration_taken`, com os campos).',
    ),
  },
})

registry.registerPath({
  method: 'patch',
  path: '/librarian/books/{bookId}',
  tags: ['Acervo (bibliotecário)'],
  summary: 'Edita um livro',
  description:
    'Muda só os campos enviados (pelo menos um); `null` apaga um campo opcional. `workId`, contadores, `status` e exemplares não são editáveis. `unavailableForNewRequests` marca ou desmarca o livro como "Indisponível para novos pedidos": pedidos, empréstimos e filas que já existem não mudam. Se o livro era `external` e algum campo de origem externa muda, `dataSource` passa a `mixed`.',
  security,
  request: { params: bookParamsSchema, body: body(updateBookBodySchema) },
  responses: {
    200: {
      description: 'Livro atualizado.',
      content: jsonContent(bookRecordSchema),
    },
    400: invalidData,
    401: noSession,
    403: notLibrarian,
    404: bookNotFound,
  },
})

registry.registerPath({
  method: 'post',
  path: '/librarian/books/{bookId}/sync',
  tags: ['Acervo (bibliotecário)'],
  summary: 'Atualiza um livro pelas fontes externas',
  description:
    'Usa o ISBN salvo e consulta a Open Library e a BrasilAPI. Troca só título, subtítulo, autores, editora, ano, sinopse, capa e assuntos, e só os que as fontes trouxeram; CDU, Cutter, estante, idioma e exemplares nunca mudam. ISBN que nenhuma fonte conhece grava só `externalMetadata.found: false`. Se nenhuma achou e alguma não respondeu, responde 502 sem alterar o livro. `changedFields` lista o que mudou.',
  security,
  request: { params: bookParamsSchema },
  responses: {
    200: {
      description: 'Livro depois da atualização, com os campos que mudaram.',
      content: jsonContent(syncBookResponseSchema),
    },
    401: noSession,
    403: notLibrarian,
    404: bookNotFound,
    422: error('O livro não tem ISBN (`isbn_required`).'),
    502: metadataUnavailable,
  },
})

registry.registerPath({
  method: 'delete',
  path: '/librarian/books/{bookId}',
  tags: ['Acervo (bibliotecário)'],
  summary: 'Remove um livro do acervo',
  description:
    'Só remove se nenhum exemplar estiver reservado ou emprestado e a fila estiver vazia. O livro sai da busca, os exemplares ficam como `withdrawn` e o histórico de empréstimos é mantido. Se não der, responde 409 com `suggestion: "mark_unavailable"`.',
  security,
  request: { params: bookParamsSchema },
  responses: {
    204: { description: 'Livro removido.' },
    401: noSession,
    403: notLibrarian,
    404: bookNotFound,
    409: error(
      'Há exemplar reservado ou emprestado, ou fila (`book_in_circulation`, com `suggestion: "mark_unavailable"`).',
    ),
  },
})
