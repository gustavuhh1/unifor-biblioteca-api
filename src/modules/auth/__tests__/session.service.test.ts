import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { START } from '../../../test-support/clock.js'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({
  db: undefined as unknown as FakeFirestore,
  auth: { revokeRefreshTokens: vi.fn() },
}))

vi.mock('../../../config/firebase.js', () => ({
  getDb: () => h.db,
  getAdminAuth: () => h.auth,
}))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { getMe, logout, updateFullName } =
  await import('../services/session.service.js')

beforeEach(() => {
  h.db = new Fake()
  h.auth.revokeRefreshTokens.mockReset().mockResolvedValue(undefined)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  h.db.put('users', 'uid_lucas', {
    role: 'student',
    status: 'active',
    matricula: '2412858',
    email: 'lucas@edu.unifor.br',
    authEmail: '2412858@contas.uni-books.app',
    entryYear: 2024,
    activeLoanCount: 0,
    activeQueueCount: 0,
    openFineTotalCents: 0,
    booksReadByYear: {},
    notificationPrefs: { queueTurn: true },
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('dados de quem está logado (getMe)', () => {
  it('mostra o perfil, com null onde o aluno ainda não tem nome', async () => {
    const me = await getMe('uid_lucas')

    expect(me).toMatchObject({
      uid: 'uid_lucas',
      role: 'student',
      status: 'active',
      matricula: '2412858',
      email: 'lucas@edu.unifor.br',
      fullName: null,
      initials: null,
      course: null,
      entryYear: 2024,
      deskLabel: null,
      onboardingSeenAt: null,
    })
  })

  it('nunca expõe o e-mail interno do Firebase', async () => {
    expect(await getMe('uid_lucas')).not.toHaveProperty('authEmail')
  })

  it('responde 404 para conta sem documento de perfil', async () => {
    await expect(getMe('uid_nobody')).rejects.toMatchObject({
      status: 404,
      code: 'profile_not_found',
    })
  })
})

describe('nome completo do aluno (updateFullName)', () => {
  it('grava o nome com o nome normalizado e as iniciais', async () => {
    const me = await updateFullName('uid_lucas', 'João da Conceição Almeida')

    expect(me).toMatchObject({
      fullName: 'João da Conceição Almeida',
      initials: 'JA',
    })
    expect(h.db.read('users', 'uid_lucas')).toMatchObject({
      fullName: 'João da Conceição Almeida',
      fullNameNormalized: 'joao da conceicao almeida',
      initials: 'JA',
      updatedAt: START,
    })
  })
})

describe('encerramento da sessão (logout)', () => {
  it('revoga os refresh tokens do usuário', async () => {
    await logout('uid_lucas')

    expect(h.auth.revokeRefreshTokens).toHaveBeenCalledWith('uid_lucas')
  })
})
