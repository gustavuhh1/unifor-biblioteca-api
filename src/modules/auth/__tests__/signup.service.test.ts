import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({
  db: undefined as unknown as FakeFirestore,
  auth: {
    createUser: vi.fn(),
    updateUser: vi.fn(),
    revokeRefreshTokens: vi.fn(),
  },
  sent: [] as { to: string; purpose: string; code: string }[],
}))

vi.mock('../../../config/firebase.js', () => ({
  getDb: () => h.db,
  getAdminAuth: () => h.auth,
}))
vi.mock('../mail/mailer.js', () => ({
  sendTokenEmail: vi.fn(async (input: (typeof h.sent)[number]) => {
    h.sent.push(input)
  }),
}))
vi.mock('../../../config/env.js', () => ({
  env: {
    AUTH_EMAIL_DOMAIN: 'contas.uni-books.app',
    PASSKEY_RP_ID: 'uni-books.app',
    PASSKEY_ANDROID_ORIGINS: [],
  },
}))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { confirmSignup, resendSignupToken, startSignup } =
  await import('../services/signup.service.js')

const START = new Date('2026-10-19T12:00:00Z')
const after = (seconds: number) => new Date(START.getTime() + seconds * 1000)

const form = {
  email: 'lucas@edu.unifor.br',
  matricula: '2412858',
  password: '12345678',
  passwordConfirmation: '12345678',
}

function lastCode(): string {
  return h.sent[h.sent.length - 1]!.code
}

function tokensOf(purpose = 'email_confirmation') {
  return h.db.all('emailTokens').filter((token) => token.purpose === purpose)
}

// Um aluno que se cadastrou e ainda não confirmou o e-mail.
async function signUp() {
  await startSignup(form)
  return h.db.read('matriculaIndex', form.matricula)!.uid as string
}

beforeEach(() => {
  h.db = new Fake()
  h.sent.length = 0
  h.auth.createUser.mockReset().mockResolvedValue({})
  h.auth.updateUser.mockReset().mockResolvedValue({})
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('startSignup', () => {
  it('creates the user, both indexes and the token, and sends the code', async () => {
    const result = await startSignup(form)

    expect(result).toEqual({
      status: 'pending_email',
      resendAvailableInSeconds: 60,
    })
    const index = h.db.read('matriculaIndex', '2412858')!
    const uid = index.uid as string
    expect(index.role).toBe('student')
    expect(h.db.read('emailIndex', 'lucas@edu.unifor.br')!.uid).toBe(uid)

    const user = h.db.read('users', uid)!
    expect(user).toMatchObject({
      role: 'student',
      matricula: '2412858',
      email: 'lucas@edu.unifor.br',
      authEmail: '2412858@contas.uni-books.app',
      status: 'pending_email',
      entryYear: 2024,
      activeLoanCount: 0,
      activeQueueCount: 0,
      openFineTotalCents: 0,
    })
    expect(user).not.toHaveProperty('fullName')
    expect(user).not.toHaveProperty('initials')

    expect(h.sent).toHaveLength(1)
    expect(h.sent[0]).toMatchObject({
      to: 'lucas@edu.unifor.br',
      purpose: 'email_confirmation',
    })
  })

  it('creates the Firebase account disabled, with the internal e-mail', async () => {
    await startSignup(form)
    const uid = h.db.read('matriculaIndex', '2412858')!.uid

    expect(h.auth.createUser).toHaveBeenCalledWith({
      uid,
      email: '2412858@contas.uni-books.app',
      password: '12345678',
      disabled: true,
    })
  })

  it('never keeps the code or the password in the database', async () => {
    await startSignup(form)
    const documents = [
      ...h.db.all('emailTokens'),
      ...h.db.all('users'),
      ...h.db.all('matriculaIndex'),
      ...h.db.all('emailIndex'),
    ]

    // Nenhum campo guarda o código nem a senha, e nenhum tem o nome deles.
    for (const document of documents) {
      expect(Object.values(document)).not.toContain(lastCode())
      expect(Object.values(document)).not.toContain(form.password)
      expect(Object.keys(document)).not.toEqual(
        expect.arrayContaining(['code']),
      )
      expect(Object.keys(document)).not.toEqual(
        expect.arrayContaining(['password']),
      )
    }
    const [token] = tokensOf()
    expect(token).toMatchObject({ attempts: 0, sentTo: 'lucas@edu.unifor.br' })
    expect(token!.codeHash).toMatch(/^[0-9a-f]{64}$/)
    expect(token!.expiresAt).toEqual(after(20 * 60))
  })

  describe('uniqueness', () => {
    async function activeStudent() {
      const uid = await signUp()
      h.db.put('users', uid, { ...h.db.read('users', uid)!, status: 'active' })
      return uid
    }

    it('refuses a matrícula that already has an account, naming the field', async () => {
      await activeStudent()
      h.auth.createUser.mockClear()
      h.sent.length = 0

      await expect(
        startSignup({ ...form, email: 'outro@edu.unifor.br' }),
      ).rejects.toMatchObject({
        status: 409,
        code: 'signup_conflict',
        extra: {
          fields: [
            { field: 'matricula', message: 'Esta matrícula já tem cadastro.' },
          ],
        },
      })
      expect(h.auth.createUser).not.toHaveBeenCalled()
      expect(h.sent).toEqual([])
      expect(h.db.read('emailIndex', 'outro@edu.unifor.br')).toBeUndefined()
    })

    it('refuses an e-mail that already has an account, naming the field', async () => {
      await activeStudent()

      await expect(
        startSignup({ ...form, matricula: '2513320' }),
      ).rejects.toMatchObject({
        status: 409,
        extra: {
          fields: [{ field: 'email', message: 'Este e-mail já tem cadastro.' }],
        },
      })
      expect(h.db.read('matriculaIndex', '2513320')).toBeUndefined()
      expect(h.db.all('users')).toHaveLength(1)
    })

    it('names both fields when both are taken', async () => {
      await activeStudent()

      await expect(startSignup(form)).rejects.toMatchObject({
        code: 'signup_conflict',
        extra: { fields: [{ field: 'matricula' }, { field: 'email' }] },
      })
    })

    it('treats a librarian matrícula as taken', async () => {
      h.db.put('matriculaIndex', '1000001', {
        uid: 'uid_ana',
        role: 'librarian',
      })
      h.db.put('users', 'uid_ana', { role: 'librarian', status: 'active' })

      await expect(
        startSignup({ ...form, matricula: '1000001' }),
      ).rejects.toMatchObject({
        extra: { fields: [{ field: 'matricula' }] },
      })
    })

    it('compares the e-mail without caring about case', async () => {
      await activeStudent()

      await expect(
        startSignup({
          ...form,
          matricula: '2513320',
          email: 'lucas@edu.unifor.br',
        }),
      ).rejects.toMatchObject({ extra: { fields: [{ field: 'email' }] } })
    })
  })

  it('undoes the documents when the Firebase account cannot be created', async () => {
    h.auth.createUser.mockRejectedValue(new Error('auth is down'))

    await expect(startSignup(form)).rejects.toThrow('auth is down')

    expect(h.db.all('users')).toEqual([])
    expect(h.db.all('matriculaIndex')).toEqual([])
    expect(h.db.all('emailIndex')).toEqual([])
    expect(h.db.all('emailTokens')).toEqual([])
    expect(h.sent).toEqual([])
  })

  describe('repeating the sign-up while the e-mail is not confirmed', () => {
    it('waits 60 seconds between two sends', async () => {
      await signUp()
      vi.setSystemTime(after(18))

      await expect(startSignup(form)).rejects.toMatchObject({
        status: 429,
        code: 'token_resend_too_soon',
        extra: { retryAfterSeconds: 42 },
      })
      expect(h.sent).toHaveLength(1)
    })

    it('replaces the e-mail, the password and the token', async () => {
      const uid = await signUp()
      const firstCode = lastCode()
      vi.setSystemTime(after(61))

      await startSignup({
        ...form,
        email: 'novo@edu.unifor.br',
        password: '87654321',
        passwordConfirmation: '87654321',
      })

      expect(h.db.read('users', uid)!.email).toBe('novo@edu.unifor.br')
      expect(h.db.read('emailIndex', 'lucas@edu.unifor.br')).toBeUndefined()
      expect(h.db.read('emailIndex', 'novo@edu.unifor.br')!.uid).toBe(uid)
      expect(h.db.all('users')).toHaveLength(1)
      expect(h.auth.updateUser).toHaveBeenCalledWith(uid, {
        password: '87654321',
      })
      expect(h.auth.createUser).toHaveBeenCalledTimes(1)
      expect(h.sent[1]).toMatchObject({ to: 'novo@edu.unifor.br' })

      const tokens = tokensOf()
      expect(tokens).toHaveLength(2)
      expect(tokens.filter((token) => !token.invalidatedAt)).toHaveLength(1)

      // O primeiro código não vale mais.
      await expect(
        confirmSignup({ matricula: form.matricula, token: firstCode }),
      ).rejects.toMatchObject({ code: 'token_invalid' })
    })

    it('does not take an e-mail that belongs to another account', async () => {
      await signUp()
      h.db.put('emailIndex', 'ocupado@edu.unifor.br', { uid: 'uid_other' })
      vi.setSystemTime(after(61))

      await expect(
        startSignup({ ...form, email: 'ocupado@edu.unifor.br' }),
      ).rejects.toMatchObject({ extra: { fields: [{ field: 'email' }] } })
    })
  })
})

describe('resendSignupToken', () => {
  it('sends a new token and invalidates the old one', async () => {
    await signUp()
    const firstCode = lastCode()
    vi.setSystemTime(after(60))

    const result = await resendSignupToken(form.matricula)

    expect(result.resendAvailableInSeconds).toBe(60)
    expect(h.sent).toHaveLength(2)
    expect(h.sent[1]).toMatchObject({ to: 'lucas@edu.unifor.br' })
    const tokens = tokensOf()
    expect(tokens.filter((token) => token.invalidatedAt)).toHaveLength(1)
    await expect(
      confirmSignup({ matricula: form.matricula, token: firstCode }),
    ).rejects.toBeDefined()
  })

  it('answers 429 with the seconds left when asked too soon', async () => {
    await signUp()
    vi.setSystemTime(after(10))

    await expect(resendSignupToken(form.matricula)).rejects.toMatchObject({
      status: 429,
      code: 'token_resend_too_soon',
      extra: { retryAfterSeconds: 50 },
    })
    expect(h.sent).toHaveLength(1)
  })

  it('has nothing to resend for an unknown matrícula or a confirmed account', async () => {
    await expect(resendSignupToken('2513320')).rejects.toMatchObject({
      status: 404,
      code: 'signup_not_found',
    })

    const uid = await signUp()
    h.db.put('users', uid, { ...h.db.read('users', uid)!, status: 'active' })
    vi.setSystemTime(after(120))
    await expect(resendSignupToken(form.matricula)).rejects.toMatchObject({
      code: 'signup_not_found',
    })
  })
})

describe('confirmSignup', () => {
  it('activates the account, enables it in Firebase and returns the passkey options', async () => {
    const uid = await signUp()
    vi.setSystemTime(after(5 * 60))

    const result = await confirmSignup({
      matricula: form.matricula,
      token: lastCode(),
    })

    const user = h.db.read('users', uid)!
    expect(user.status).toBe('active')
    expect(user.emailVerifiedAt).toEqual(after(5 * 60))
    expect(h.auth.updateUser).toHaveBeenCalledWith(uid, { disabled: false })
    expect(tokensOf()[0]!.usedAt).toEqual(after(5 * 60))

    expect(result.passkeyOptions.rp.id).toBe('uni-books.app')
    expect(result.passkeyOptions.user.name).toBe('2412858')
    const [challenge] = h.db.all('passkeyChallenges')
    expect(challenge).toMatchObject({
      challenge: result.passkeyOptions.challenge,
      purpose: 'registration',
      uid,
    })
    expect(challenge!.expiresAt).toEqual(after(5 * 60 + 5 * 60))
  })

  it('is single use: the same token cannot confirm twice', async () => {
    await signUp()
    const code = lastCode()
    await confirmSignup({ matricula: form.matricula, token: code })

    await expect(
      confirmSignup({ matricula: form.matricula, token: code }),
    ).rejects.toMatchObject({ status: 400, code: 'token_expired_or_used' })
  })

  it('refuses the token after 20 minutes', async () => {
    await signUp()
    vi.setSystemTime(after(20 * 60))

    await expect(
      confirmSignup({ matricula: form.matricula, token: lastCode() }),
    ).rejects.toMatchObject({ code: 'token_expired_or_used' })
    expect(h.auth.updateUser).not.toHaveBeenCalled()
  })

  it('accepts the token one second before it expires', async () => {
    await signUp()
    vi.setSystemTime(after(20 * 60 - 1))

    await expect(
      confirmSignup({ matricula: form.matricula, token: lastCode() }),
    ).resolves.toBeDefined()
  })

  it('counts each wrong code, and locks the token at the fifth', async () => {
    await signUp()
    const right = lastCode()
    const wrong = right === '000000' ? '111111' : '000000'

    await expect(
      confirmSignup({ matricula: form.matricula, token: wrong }),
    ).rejects.toMatchObject({
      code: 'token_invalid',
      message: 'Token incorreto. Você ainda tem 4 tentativas.',
    })
    expect(tokensOf()[0]!.attempts).toBe(1)

    for (let i = 0; i < 4; i++) {
      await expect(
        confirmSignup({ matricula: form.matricula, token: wrong }),
      ).rejects.toMatchObject({ code: 'token_invalid' })
    }
    expect(tokensOf()[0]!.attempts).toBe(5)

    // Agora até o código certo é recusado.
    await expect(
      confirmSignup({ matricula: form.matricula, token: right }),
    ).rejects.toMatchObject({ code: 'token_attempts_exceeded' })
    expect(h.db.read('matriculaIndex', form.matricula)).toBeDefined()
    expect(h.auth.updateUser).not.toHaveBeenCalled()
  })

  it('does not tell an unknown matrícula from an old token', async () => {
    await expect(
      confirmSignup({ matricula: '2513320', token: '123456' }),
    ).rejects.toMatchObject({ code: 'token_expired_or_used' })
  })

  it('leaves the token usable when Firebase fails to enable the account', async () => {
    await signUp()
    const code = lastCode()
    h.auth.updateUser.mockRejectedValueOnce(new Error('auth is down'))

    await expect(
      confirmSignup({ matricula: form.matricula, token: code }),
    ).rejects.toThrow('auth is down')
    expect(tokensOf()[0]!.usedAt).toBeUndefined()

    await expect(
      confirmSignup({ matricula: form.matricula, token: code }),
    ).resolves.toBeDefined()
  })
})
