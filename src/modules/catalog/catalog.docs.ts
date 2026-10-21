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
  bookRecordSchema,
  googleBookLookupResponseSchema,
  librarianBookListResponseSchema,
  syncGoogleResponseSchema,
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
const googleUnavailable = error(
  'O Google Books não respondeu: rede, tempo esgotado, 4xx ou 5xx (`google_books_unavailable`). Nada é alterado.',
)

// --- Busca e página do livro (aluno e bibliotecário) --------------------------

registry.registerPath({
  method: 'get',
  path: '/books',
  tags: ['Acervo'],
  summary: 'Busca livros no acervo',
  description:
    'Busca por título, subtítulo, autor, assunto e ISBN, ignorando acento e maiúsculas. Todos os termos de `q` precisam aparecer; `q` vazio lista tudo. Ordena por título. Livros removidos nunca aparecem; livros marcados como indisponíveis para novos pedidos aparecem. Roda em memória, com cache de cerca de 60 segundos por instância, e nunca consulta o Google Books.',
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
  path: '/librarian/google-books/{isbn}',
  tags: ['Acervo (bibliotecário)'],
  summary: 'Consulta um ISBN no Google Books',
  description:
    'Só consulta: não grava nada. Devolve os dados já no formato do livro, para pré-preencher o cadastro, e o `volumeId`, que o cadastro devolve em `POST /librarian/books`. ISBN que o Google Books não conhece responde 200 com `found: false`, e o app avisa em vermelho para preencher à mão. O ISBN aceita hífens e espaços.',
  security,
  request: { params: isbnParamsSchema },
  responses: {
    200: {
      description: 'ISBN encontrado ou não.',
      content: jsonContent(googleBookLookupResponseSchema),
    },
    400: invalidData,
    401: noSession,
    403: notLibrarian,
    502: googleUnavailable,
  },
})

registry.registerPath({
  method: 'post',
  path: '/librarian/books',
  tags: ['Acervo (bibliotecário)'],
  summary: 'Cadastra um livro e os exemplares',
  description:
    'Numa transação: cria a obra (ou acrescenta a edição à obra do mesmo título e primeiro autor), o livro e os exemplares (todos `available`). CDU, Cutter e estante são sempre informados à mão. Com `volumeId` (da consulta ao Google Books) grava os dados do Google e `dataSource` fica `google_books` se nada foi alterado à mão, ou `mixed`. ISBN sem `volumeId` grava `googleBooks.found: false`. Sem nada do Google, `dataSource` é `manual`. O registro de cada exemplar é único.',
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
    'Muda só os campos enviados (pelo menos um); `null` apaga um campo opcional. `workId`, contadores, `status` e exemplares não são editáveis. `unavailableForNewRequests` marca ou desmarca o livro como "Indisponível para novos pedidos": pedidos, empréstimos e filas que já existem não mudam. Se o livro era `google_books` e algum campo de origem Google muda, `dataSource` passa a `mixed`.',
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
  path: '/librarian/books/{bookId}/sync-google',
  tags: ['Acervo (bibliotecário)'],
  summary: 'Atualiza um livro pelo Google Books',
  description:
    'Usa o ISBN salvo. Troca só título, subtítulo, autores, editora, ano, sinopse, capa, assuntos e idioma, e só os que o Google trouxe; CDU, Cutter, estante e exemplares nunca mudam. ISBN que o Google não conhece grava só `googleBooks.found: false`. Falha do Google responde 502 sem alterar o livro. `changedFields` lista o que mudou.',
  security,
  request: { params: bookParamsSchema },
  responses: {
    200: {
      description: 'Livro depois da atualização, com os campos que mudaram.',
      content: jsonContent(syncGoogleResponseSchema),
    },
    401: noSession,
    403: notLibrarian,
    404: bookNotFound,
    422: error('O livro não tem ISBN (`isbn_required`).'),
    502: googleUnavailable,
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
