// Um Firestore em memória, pequeno, que imita a parte do Admin SDK que o módulo
// de acesso usa, para testar os serviços sem o emulador. Guarda os valores
// `Date` como estão e executa uma transação guardando as escritas e aplicando-as
// só se a função terminar sem erro.

import { FieldValue } from 'firebase-admin/firestore'

type Data = Record<string, unknown>
type Op =
  | { kind: 'set'; path: string; data: Data }
  | { kind: 'update'; path: string; data: Data }
  | { kind: 'delete'; path: string }

// Diz se o valor é o FieldValue.delete() do Firestore (apagar o campo).
function isDeleteSentinel(value: unknown): boolean {
  return value instanceof FieldValue && value.isEqual(FieldValue.delete())
}

// Documento lido, como o DocumentSnapshot do Firestore.
export class FakeSnapshot {
  constructor(
    readonly ref: FakeDocRef,
    private readonly stored: Data | undefined,
  ) {}
  get id() {
    return this.ref.id
  }
  get exists() {
    return this.stored !== undefined
  }
  data() {
    return this.stored
  }
  get(field: string): unknown {
    return this.stored?.[field]
  }
}

// Referência a um documento, como o DocumentReference do Firestore.
export class FakeDocRef {
  constructor(
    private readonly store: FakeFirestore,
    readonly collectionName: string,
    readonly id: string,
  ) {}
  get path() {
    return `${this.collectionName}/${this.id}`
  }
  async get() {
    return this.store.snapshot(this)
  }
  async set(data: Data) {
    this.store.apply({ kind: 'set', path: this.path, data })
  }
  async update(data: Data) {
    this.store.apply({ kind: 'update', path: this.path, data })
  }
  async delete() {
    this.store.apply({ kind: 'delete', path: this.path })
  }
}

type Operator = '==' | 'in' | 'array-contains' | '<' | '<=' | '>' | '>='
type Filter = { field: string; op: Operator; value: unknown }

// Valor comparável: datas viram milissegundos.
const comparable = (value: unknown) =>
  value instanceof Date ? value.getTime() : value

// Diz se o valor do campo passa no filtro (igualdade, "está na lista", "a lista
// contém" ou uma
// comparação de ordem). Campo ausente nunca passa numa comparação de ordem.
function matches(actual: unknown, { op, value }: Filter): boolean {
  if (op === 'in') return (value as unknown[]).includes(actual)
  if (op === 'array-contains') {
    return Array.isArray(actual) && actual.includes(value)
  }
  if (op === '==') return actual === value
  if (actual === undefined) return false
  const left = comparable(actual) as number
  const right = comparable(value) as number
  switch (op) {
    case '<':
      return left < right
    case '<=':
      return left <= right
    case '>':
      return left > right
    case '>=':
      return left >= right
  }
}

// Consulta com where, orderBy e limit, como a Query do Firestore.
export class FakeQuery {
  constructor(
    private readonly store: FakeFirestore,
    private readonly collectionName: string,
    private readonly filters: Filter[] = [],
    private readonly order?: { field: string; direction: 'asc' | 'desc' },
    private readonly max?: number,
  ) {}
  where(field: string, op: Operator, value: unknown) {
    return new FakeQuery(
      this.store,
      this.collectionName,
      [...this.filters, { field, op, value }],
      this.order,
      this.max,
    )
  }
  orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
    return new FakeQuery(
      this.store,
      this.collectionName,
      this.filters,
      { field, direction },
      this.max,
    )
  }
  limit(max: number) {
    return new FakeQuery(
      this.store,
      this.collectionName,
      this.filters,
      this.order,
      max,
    )
  }
  async get() {
    let docs = this.store
      .idsOf(this.collectionName)
      .map((id) => this.store.snapshot(this.store.doc(this.collectionName, id)))
      .filter((snap) =>
        this.filters.every((filter) => matches(snap.get(filter.field), filter)),
      )
    if (this.order) {
      const { field, direction } = this.order
      const key = (snap: FakeSnapshot) => {
        const value = snap.get(field)
        return value instanceof Date ? value.getTime() : (value as number)
      }
      docs = docs.sort((a, b) =>
        direction === 'asc' ? key(a) - key(b) : key(b) - key(a),
      )
    }
    if (this.max !== undefined) docs = docs.slice(0, this.max)
    return { docs }
  }
  // Contagem, como a agregação count() do Firestore.
  count() {
    return {
      get: async () => {
        const { docs } = await this.get()
        return { data: () => ({ count: docs.length }) }
      },
    }
  }
}

class FakeCollection extends FakeQuery {
  constructor(
    private readonly db: FakeFirestore,
    private readonly name: string,
  ) {
    super(db, name)
  }
  doc(id?: string) {
    return this.db.doc(this.name, id ?? this.db.newId())
  }
}

class FakeTransaction {
  readonly ops: Op[] = []
  constructor(private readonly db: FakeFirestore) {}
  async get(target: FakeDocRef | FakeQuery) {
    return target instanceof FakeDocRef
      ? this.db.snapshot(target)
      : target.get()
  }
  async getAll(...refs: FakeDocRef[]) {
    return refs.map((ref) => this.db.snapshot(ref))
  }
  set(ref: FakeDocRef, data: Data) {
    this.ops.push({ kind: 'set', path: ref.path, data })
  }
  update(ref: FakeDocRef, data: Data) {
    this.ops.push({ kind: 'update', path: ref.path, data })
  }
  delete(ref: FakeDocRef) {
    this.ops.push({ kind: 'delete', path: ref.path })
  }
}

// O banco em memória; use os métodos "apoio para os testes" para montar e ler dados.
export class FakeFirestore {
  private readonly docs = new Map<string, Data>()
  private counter = 0

  newId() {
    this.counter += 1
    return `auto${this.counter}`
  }
  doc(collectionName: string, id: string) {
    return new FakeDocRef(this, collectionName, id)
  }
  collection(name: string) {
    return new FakeCollection(this, name)
  }
  idsOf(collectionName: string) {
    return [...this.docs.keys()]
      .filter((path) => path.startsWith(`${collectionName}/`))
      .map((path) => path.slice(collectionName.length + 1))
  }
  snapshot(ref: FakeDocRef) {
    const stored = this.docs.get(ref.path)
    return new FakeSnapshot(ref, stored ? { ...stored } : undefined)
  }
  apply(op: Op) {
    if (op.kind === 'set') this.docs.set(op.path, { ...op.data })
    else if (op.kind === 'delete') this.docs.delete(op.path)
    else {
      const current = this.docs.get(op.path)
      if (!current) throw new Error(`No document to update at ${op.path}`)
      const next = { ...current }
      for (const [field, value] of Object.entries(op.data)) {
        if (isDeleteSentinel(value)) delete next[field]
        else next[field] = value
      }
      this.docs.set(op.path, next)
    }
  }
  async runTransaction<T>(fn: (tx: FakeTransaction) => Promise<T>) {
    const tx = new FakeTransaction(this)
    const result = await fn(tx)
    tx.ops.forEach((op) => this.apply(op))
    return result
  }

  // --- apoio para os testes ---
  put(collectionName: string, id: string, data: object) {
    this.docs.set(`${collectionName}/${id}`, { ...data } as Data)
  }
  read(collectionName: string, id: string): Data | undefined {
    return this.docs.get(`${collectionName}/${id}`)
  }
  all(collectionName: string): Data[] {
    return this.idsOf(collectionName).map((id) =>
      this.docs.get(`${collectionName}/${id}`)!,
    )
  }
}
