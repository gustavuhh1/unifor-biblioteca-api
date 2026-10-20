import type { BookStatus, CopyStatus, DataSource, Timestamps } from './enums.js'

// Documentos do acervo (docs/modelo-de-dados-firestore.md, seções 2.6 a 2.8).

// works/{workId}: a obra (o título), que reúne as edições.
export interface Work extends Timestamps {
  title: string
  authors: string[]
  // Edições da obra, ativas e removidas.
  bookIds: string[]
  // Edições ativas (não removidas).
  editionCount: number
}

// Dados da última consulta ao Google Books.
export interface GoogleBooksInfo {
  volumeId: string | null
  lastSyncedAt: Date | null
  // false quando o ISBN não foi encontrado.
  found: boolean
}

// books/{bookId}: a edição que aparece no acervo ("livro" nas telas).
export interface Book extends Timestamps {
  workId: string
  // Só dígitos (ISBN-13 ou ISBN-10). Pode faltar.
  isbn?: string
  title: string
  subtitle?: string
  authors: string[]
  translators?: string[]
  publisher?: string
  publicationPlace?: string
  // Texto livre: "2. ed.", "revisada".
  edition?: string
  year?: number
  language: string
  materialType: string
  series?: string
  // Pode ser vazio.
  subjects: string[]
  synopsis?: string
  // Sem ela, o app gera a capa.
  coverUrl?: string | null
  // De 1 a 6: cor da capa gerada.
  coverTone: number
  // CDU, Cutter, estante e local são dados do projeto, não do Google Books.
  cdu: string
  cutter: string
  shelf: string
  location: string
  googleBooks?: GoogleBooksInfo
  dataSource: DataSource
  // Exemplares não retirados do acervo.
  copiesTotal: number
  copiesAvailable: number
  // Lugares waiting + your_turn desta edição.
  queueLength: number
  // Menor dueAt entre os exemplares emprestados.
  nextReturnAt?: Date
  unavailableForNewRequests: boolean
  unavailableSetAt?: Date
  unavailableSetBy?: string
  status: BookStatus
  removedAt?: Date
  removedBy?: string
  // Título, subtítulo, autores, assuntos e ISBN em minúsculas e sem acento.
  searchText: string
  createdBy?: string
}

// copies/{copyId}: cada exemplar físico.
export interface Copy extends Timestamps {
  bookId: string
  // Cópia de books.workId, para consultas.
  workId: string
  // Número de registro, único.
  registration: string
  acquisitionYear?: number
  format: string
  libraryCode: string
  status: CopyStatus
  // Preenchido em reserved (pedido) e on_loan.
  currentLoanId?: string
  // Preenchido em reserved pela vez da fila.
  reservedForQueueEntryId?: string
  // Cópia de loans.dueAt quando on_loan.
  dueAt?: Date
}
