import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

const START = new Date('2026-10-19T12:00:00Z')

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

describe('getMe', () => {
  it('shows the profile, with null where the student has no name yet', async () => {
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

  it('never exposes the internal Firebase e-mail', async () => {
    expect(await getMe('uid_lucas')).not.toHaveProperty('authEmail')
  })

  it('answers 404 for an account without a profile document', async () => {
    await expect(getMe('uid_nobody')).rejects.toMatchObject({
      status: 404,
      code: 'profile_not_found',
    })
  })
})

describe('updateFullName', () => {
  it('saves the name with the normalized name and the initials', async () => {
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

describe('logout', () => {
  it('revokes the refresh tokens of the user', async () => {
    await logout('uid_lucas')

    expect(h.auth.revokeRefreshTokens).toHaveBeenCalledWith('uid_lucas')
  })
})
