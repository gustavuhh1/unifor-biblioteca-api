// Static seed data: docs/modelo-de-dados-firestore.md, sections 6.1 to 6.5.
// Dates are "AAAA-MM-DD" (America/Fortaleza) and are only the example of the
// documented day: the builder turns each one into an offset from BASE_DATE and
// applies it to the day the seed runs. Nothing here is computed.

// The documented "today" (section 6): Thursday, 15/10/2026.
export const BASE_DATE = '2026-10-15'
export const NOW_TIME = '12:00'

export const AUTH_EMAIL_DOMAIN = 'contas.uni-books.app'

export type Role = 'student' | 'librarian'

export interface UserSpec {
  key: string
  role: Role
  matricula: string
  fullName: string
  email: string
  course?: string
  deskLabel?: string
}

// Section 6.1. The uid of each account is `uid_<key>` (section 6.4).
export const USERS: UserSpec[] = [
  {
    key: 'ana',
    role: 'librarian',
    matricula: '0900001',
    fullName: 'Ana Souza',
    email: 'ana.souza@unifor.br',
    deskLabel: 'Balcão · Biblioteca (Praça Central)',
  },
  {
    key: 'lucas',
    role: 'student',
    matricula: '2412858',
    fullName: 'Lucas Almeida',
    email: 'lucas.almeida@edu.unifor.br',
    course: 'Ciência da Computação',
  },
  {
    key: 'marina',
    role: 'student',
    matricula: '2513320',
    fullName: 'Marina Castro',
    email: 'marina.castro@edu.unifor.br',
    course: 'Sistemas de Informação',
  },
  {
    key: 'beatriz',
    role: 'student',
    matricula: '2311052',
    fullName: 'Beatriz Nogueira',
    email: 'beatriz.nogueira@edu.unifor.br',
  },
  {
    key: 'rafael',
    role: 'student',
    matricula: '2210478',
    fullName: 'Rafael Teixeira',
    email: 'rafael.teixeira@edu.unifor.br',
  },
  {
    key: 'anabeatriz',
    role: 'student',
    matricula: '2311047',
    fullName: 'Ana Beatriz Lima',
    email: 'ana.lima@edu.unifor.br',
  },
  {
    key: 'carlos',
    role: 'student',
    matricula: '2210933',
    fullName: 'Carlos Eduardo Sá',
    email: 'carlos.sa@edu.unifor.br',
  },
  {
    key: 'pedromartins',
    role: 'student',
    matricula: '2412001',
    fullName: 'Pedro Martins',
    email: 'pedro.martins@edu.unifor.br',
  },
  {
    key: 'pedrohenrique',
    role: 'student',
    matricula: '2410221',
    fullName: 'Pedro Henrique Lima',
    email: 'pedro.hlima@edu.unifor.br',
  },
  {
    key: 'julia',
    role: 'student',
    matricula: '2320876',
    fullName: 'Júlia Martins',
    email: 'julia.martins@edu.unifor.br',
  },
  {
    key: 'camila',
    role: 'student',
    matricula: '2214567',
    fullName: 'Camila Rocha',
    email: 'camila.rocha@edu.unifor.br',
  },
  {
    key: 'diego',
    role: 'student',
    matricula: '2511903',
    fullName: 'Diego Alves',
    email: 'diego.alves@edu.unifor.br',
  },
]

export interface CopySpec {
  registration: string
}

export interface BookSpec {
  key: string
  workId: string
  title: string
  subtitle?: string
  authors: string[]
  translators?: string[]
  publisher?: string
  publicationPlace?: string
  edition?: string
  year?: number
  series?: string
  isbn?: string
  subjects: string[]
  synopsis?: string
  cdu: string
  cutter: string
  unavailableForNewRequests?: boolean
  copies: CopySpec[]
}

const SOFTWARE = ['Desenvolvimento de software', 'Programação']

// Sections 6.2 and 6.5, in the order of table 6.2 (the order sets `coverTone`).
// The four books at the end exist only to carry the open fines (section 6.5):
// "only the essentials", so no authors, CDU or Cutter were documented.
export const BOOKS: BookSpec[] = [
  {
    key: 'codigo_limpo',
    workId: 'codigo-limpo--martin',
    title: 'Código Limpo',
    subtitle: 'habilidades práticas do agile software',
    authors: ['Robert C. Martin'],
    translators: ['Leandro Chu'],
    publisher: 'Alta Books',
    publicationPlace: 'Rio de Janeiro',
    edition: 'revisada',
    year: 2011,
    series: '(Robert C. Martin)',
    isbn: '9788576082675',
    subjects: ['Desenvolvimento de software', 'Linguagem de programação'],
    synopsis: 'Mostra como escrever código fácil de ler e de manter...',
    cdu: '005.1',
    cutter: 'M386c',
    copies: [
      { registration: '46122' },
      { registration: '223223' },
      { registration: '223323' },
    ],
  },
  {
    key: 'refatoracao',
    workId: 'refatoracao--fowler',
    title: 'Refatoração',
    authors: ['Martin Fowler'],
    publisher: 'Novatec',
    edition: '2. ed.',
    year: 2020,
    isbn: '9788575227244',
    subjects: SOFTWARE,
    cdu: '005.1',
    cutter: 'F787r',
    copies: [
      { registration: '51734' },
      { registration: '51735' },
      { registration: '51736' },
    ],
  },
  {
    key: 'arquitetura_limpa',
    workId: 'arquitetura-limpa--martin',
    title: 'Arquitetura Limpa',
    authors: ['Robert C. Martin'],
    subjects: SOFTWARE,
    cdu: '005.1',
    cutter: 'M386a',
    unavailableForNewRequests: true,
    copies: [{ registration: '80101' }],
  },
  {
    key: 'codificador_limpo',
    workId: 'o-codificador-limpo--martin',
    title: 'O Codificador Limpo',
    authors: ['Robert C. Martin'],
    year: 2012,
    subjects: SOFTWARE,
    cdu: '005.1',
    cutter: 'M386co',
    copies: [{ registration: '80111' }, { registration: '80112' }],
  },
  {
    key: 'padroes_de_projeto',
    workId: 'padroes-de-projeto--gamma',
    title: 'Padrões de Projeto',
    authors: ['Gamma et al.'],
    subjects: SOFTWARE,
    cdu: '005.1',
    cutter: 'G192p',
    copies: [{ registration: '51902' }],
  },
  {
    key: 'calculo_vol1',
    workId: 'calculo-vol-1--stewart',
    title: 'Cálculo, Vol. 1',
    authors: ['James Stewart'],
    subjects: ['Matemática', 'Cálculo'],
    cdu: '515',
    cutter: 'S849c',
    copies: [{ registration: '80121' }],
  },
  {
    key: 'calculo_vol2',
    workId: 'calculo-vol-2--stewart',
    title: 'Cálculo, Vol. 2',
    authors: ['James Stewart'],
    subjects: ['Matemática', 'Cálculo'],
    cdu: '515',
    cutter: 'S849c',
    copies: [{ registration: '80131' }],
  },
  {
    key: 'engenharia_de_software',
    workId: 'engenharia-de-software--sommerville',
    title: 'Engenharia de Software',
    authors: ['Ian Sommerville'],
    subjects: SOFTWARE,
    cdu: '005.1',
    cutter: 'S697e',
    copies: [{ registration: '80141' }],
  },
  {
    key: 'redes_de_computadores',
    workId: 'redes-de-computadores--tanenbaum',
    title: 'Redes de Computadores',
    authors: ['Andrew S. Tanenbaum'],
    subjects: ['Redes de computadores'],
    cdu: '004.7',
    cutter: 'T164r',
    copies: [{ registration: '80151' }],
  },
  {
    key: 'estruturas_de_dados',
    workId: 'estruturas-de-dados--goodrich',
    title: 'Estruturas de Dados e Algoritmos',
    authors: ['Goodrich', 'Tamassia'],
    subjects: SOFTWARE,
    cdu: '005.1',
    cutter: 'G655e',
    copies: [{ registration: '80161' }],
  },
  {
    key: 'algoritmos_3a',
    workId: 'algoritmos--cormen',
    title: 'Algoritmos',
    authors: ['Thomas H. Cormen'],
    publisher: 'Elsevier',
    edition: '3. ed.',
    year: 2012,
    isbn: '9788535236996',
    subjects: SOFTWARE,
    cdu: '005.1',
    cutter: 'C811a',
    copies: [{ registration: '60411' }, { registration: '60412' }],
  },
  {
    key: 'algoritmos_4a',
    workId: 'algoritmos--cormen',
    title: 'Algoritmos',
    authors: ['Thomas H. Cormen'],
    publisher: 'GEN LTC',
    edition: '4. ed.',
    year: 2024,
    subjects: SOFTWARE,
    cdu: '005.1',
    cutter: 'C811a',
    copies: [{ registration: '71880' }, { registration: '71881' }],
  },
  {
    key: 'code_complete',
    workId: 'code-complete--mcconnell',
    title: 'Code Complete',
    authors: ['Steve McConnell'],
    year: 2005,
    subjects: SOFTWARE,
    cdu: '005.1',
    cutter: 'M478c',
    copies: [{ registration: '80171' }],
  },
  {
    key: 'fisica_basica_vol2',
    workId: 'fisica-basica-vol-2',
    title: 'Física Básica, Vol. 2',
    authors: [],
    subjects: [],
    cdu: '',
    cutter: '',
    copies: [{ registration: '80181' }],
  },
  {
    key: 'contabilidade_introdutoria',
    workId: 'contabilidade-introdutoria',
    title: 'Contabilidade Introdutória',
    authors: [],
    subjects: [],
    cdu: '',
    cutter: '',
    copies: [{ registration: '80182' }],
  },
  {
    key: 'direito_civil_parte_geral',
    workId: 'direito-civil-parte-geral',
    title: 'Direito Civil: Parte Geral',
    authors: [],
    subjects: [],
    cdu: '',
    cutter: '',
    copies: [{ registration: '80183' }],
  },
  {
    key: 'anatomia_humana',
    workId: 'anatomia-humana',
    title: 'Anatomia Humana',
    authors: [],
    subjects: [],
    cdu: '',
    cutter: '',
    copies: [{ registration: '80184' }],
  },
]

export interface LoanSpec {
  id: string
  student: string
  book: string
  copy: string
  status: 'awaiting_pickup' | 'active' | 'returned'
  // awaiting_pickup: when the order was made and its pickup deadline.
  requestedAt?: [date: string, time: string]
  pickupDeadline?: [date: string, time: string]
  pickupCode?: string
  queueEntry?: string
  // active and returned: when it was picked up (due = +14 days, +14 if renewed).
  pickedUpOn?: string
  renewedOn?: string
  returnedAt?: [date: string, time: string]
  fine?: string
  // Reminder already sent ("enviado ontem", docs/regras-e-decisoes.md).
  due2DaysReminderAt?: [date: string, time: string]
}

// Sections 6.3 and 6.5. Pickup codes not documented are filled in by the builder.
export const LOANS: LoanSpec[] = [
  {
    id: 'loan_lucas_engenharia',
    student: 'lucas',
    book: 'engenharia_de_software',
    copy: '80141',
    status: 'active',
    pickedUpOn: '2026-10-02',
    due2DaysReminderAt: ['2026-10-14', '09:00'],
  },
  {
    id: 'loan_lucas_redes',
    student: 'lucas',
    book: 'redes_de_computadores',
    copy: '80151',
    status: 'active',
    pickedUpOn: '2026-10-06',
  },
  {
    id: 'loan_lucas_estruturas',
    student: 'lucas',
    book: 'estruturas_de_dados',
    copy: '80161',
    status: 'active',
    pickedUpOn: '2026-10-09',
  },
  {
    id: 'loan_ret4821',
    student: 'lucas',
    book: 'codigo_limpo',
    copy: '46122',
    status: 'awaiting_pickup',
    pickupCode: 'RET-4821',
    queueEntry: 'qe_lucas_codigo_limpo',
    requestedAt: ['2026-10-15', '09:30'],
    pickupDeadline: ['2026-10-19', '21:55'],
  },
  {
    id: 'loan_beatriz_padroes',
    student: 'beatriz',
    book: 'padroes_de_projeto',
    copy: '51902',
    status: 'awaiting_pickup',
    pickupCode: 'RET-4817',
    requestedAt: ['2026-10-13', '12:00'],
    pickupDeadline: ['2026-10-15', '21:55'],
  },
  {
    id: 'loan_rafael_calculo2',
    student: 'rafael',
    book: 'calculo_vol2',
    copy: '80131',
    status: 'awaiting_pickup',
    pickupCode: 'RET-4809',
    requestedAt: ['2026-10-14', '12:00'],
    pickupDeadline: ['2026-10-16', '21:55'],
  },
  {
    id: 'loan_marina_calculo1',
    student: 'marina',
    book: 'calculo_vol1',
    copy: '80121',
    status: 'active',
    pickedUpOn: '2026-09-26',
    fine: 'fine_marina_calculo1',
  },
  {
    id: 'loan_pedromartins_arquitetura',
    student: 'pedromartins',
    book: 'arquitetura_limpa',
    copy: '80101',
    status: 'active',
    pickedUpOn: '2026-10-07',
  },
  {
    id: 'loan_julia_codigo_limpo',
    student: 'julia',
    book: 'codigo_limpo',
    copy: '223223',
    status: 'active',
    pickedUpOn: '2026-09-30',
    renewedOn: '2026-10-07',
  },
  {
    id: 'loan_camila_codigo_limpo',
    student: 'camila',
    book: 'codigo_limpo',
    copy: '223323',
    status: 'active',
    pickedUpOn: '2026-10-06',
    renewedOn: '2026-10-08',
  },
  {
    id: 'loan_diego_refatoracao',
    student: 'diego',
    book: 'refatoracao',
    copy: '51736',
    status: 'active',
    pickedUpOn: '2026-10-08',
  },
  {
    id: 'loan_marina_code_complete',
    student: 'marina',
    book: 'code_complete',
    copy: '80171',
    status: 'active',
    pickedUpOn: '2026-10-05',
  },
  {
    id: 'loan_marina_algoritmos',
    student: 'marina',
    book: 'algoritmos_3a',
    copy: '60411',
    status: 'active',
    pickedUpOn: '2026-10-03',
  },
  {
    id: 'loan_pedrohenrique_algoritmos',
    student: 'pedrohenrique',
    book: 'algoritmos_3a',
    copy: '60412',
    status: 'active',
    pickedUpOn: '2026-10-13',
  },
  {
    id: 'loan_anabeatriz_algoritmos',
    student: 'anabeatriz',
    book: 'algoritmos_4a',
    copy: '71880',
    status: 'active',
    pickedUpOn: '2026-10-07',
  },
  {
    id: 'loan_rafael_algoritmos',
    student: 'rafael',
    book: 'algoritmos_4a',
    copy: '71881',
    status: 'active',
    pickedUpOn: '2026-10-09',
  },
  // Returned loans behind the four open fines (section 6.5).
  {
    id: 'loan_pedrohenrique_fisica',
    student: 'pedrohenrique',
    book: 'fisica_basica_vol2',
    copy: '80181',
    status: 'returned',
    pickedUpOn: '2026-09-21',
    returnedAt: ['2026-10-13', '12:00'],
    fine: 'fine_pedrohenrique_fisica',
  },
  {
    id: 'loan_julia_contabilidade',
    student: 'julia',
    book: 'contabilidade_introdutoria',
    copy: '80182',
    status: 'returned',
    pickedUpOn: '2026-09-23',
    returnedAt: ['2026-10-09', '12:00'],
    fine: 'fine_julia_contabilidade',
  },
  {
    id: 'loan_camila_direito',
    student: 'camila',
    book: 'direito_civil_parte_geral',
    copy: '80183',
    status: 'returned',
    pickedUpOn: '2026-09-14',
    returnedAt: ['2026-10-02', '12:00'],
    fine: 'fine_camila_direito',
  },
  {
    id: 'loan_diego_anatomia',
    student: 'diego',
    book: 'anatomia_humana',
    copy: '80184',
    status: 'returned',
    pickedUpOn: '2026-09-11',
    returnedAt: ['2026-09-30', '12:00'],
    fine: 'fine_diego_anatomia',
  },
]

export interface QueueSpec {
  id: string
  student: string
  book: string
  status: 'waiting' | 'fulfilled'
  order: number
  joinedOn: string
  // Lucas's turn in Código Limpo: started at 09:12 today, confirmed at 09:30.
  loan?: string
}

// Sections 6.3 and 6.5. `joinedAt` is at 10:00 (section 6.4 example).
export const QUEUE_ENTRIES: QueueSpec[] = [
  {
    id: 'qe_anabeatriz_arquitetura',
    student: 'anabeatriz',
    book: 'arquitetura_limpa',
    status: 'waiting',
    order: 1000,
    joinedOn: '2026-10-02',
  },
  {
    id: 'qe_lucas_arquitetura',
    student: 'lucas',
    book: 'arquitetura_limpa',
    status: 'waiting',
    order: 2000,
    joinedOn: '2026-10-08',
  },
  {
    id: 'qe_carlos_arquitetura',
    student: 'carlos',
    book: 'arquitetura_limpa',
    status: 'waiting',
    order: 3000,
    joinedOn: '2026-10-10',
  },
  {
    id: 'qe_marina_arquitetura',
    student: 'marina',
    book: 'arquitetura_limpa',
    status: 'waiting',
    order: 4000,
    joinedOn: '2026-10-09',
  },
  {
    id: 'qe_beatriz_engenharia',
    student: 'beatriz',
    book: 'engenharia_de_software',
    status: 'waiting',
    order: 1000,
    joinedOn: '2026-10-05',
  },
  {
    id: 'qe_diego_engenharia',
    student: 'diego',
    book: 'engenharia_de_software',
    status: 'waiting',
    order: 2000,
    joinedOn: '2026-10-13',
  },
  {
    id: 'qe_lucas_codigo_limpo',
    student: 'lucas',
    book: 'codigo_limpo',
    status: 'fulfilled',
    order: 1000,
    joinedOn: '2026-10-09',
    loan: 'loan_ret4821',
  },
  {
    id: 'qe_carlos_codigo_limpo',
    student: 'carlos',
    book: 'codigo_limpo',
    status: 'waiting',
    order: 2000,
    joinedOn: '2026-10-10',
  },
]

export interface FineSpec {
  id: string
  loan: string
  status: 'accruing' | 'open'
  // Open fines are frozen: their days (and amounts) stay fixed (section 6.5).
  businessDaysLate?: number
}

export const FINES: FineSpec[] = [
  {
    id: 'fine_marina_calculo1',
    loan: 'loan_marina_calculo1',
    status: 'accruing',
  },
  {
    id: 'fine_pedrohenrique_fisica',
    loan: 'loan_pedrohenrique_fisica',
    status: 'open',
    businessDaysLate: 5,
  },
  {
    id: 'fine_julia_contabilidade',
    loan: 'loan_julia_contabilidade',
    status: 'open',
    businessDaysLate: 2,
  },
  {
    id: 'fine_camila_direito',
    loan: 'loan_camila_direito',
    status: 'open',
    businessDaysLate: 4,
  },
  {
    id: 'fine_diego_anatomia',
    loan: 'loan_diego_anatomia',
    status: 'open',
    businessDaysLate: 3,
  },
]

// Lucas's saved books and folders (section 6.5): the first folder holds three books.
export const LUCAS_FOLDERS = [
  {
    id: 'folder_ler_depois',
    name: 'Ler depois',
    books: ['refatoracao', 'codificador_limpo', 'algoritmos_3a'],
  },
  { id: 'folder_amei', name: 'Amei!!!', books: [] as string[] },
  { id: 'folder_tcc', name: 'TCC', books: [] as string[] },
]
