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

describe('cadastro do aluno (startSignup)', () => {
  it('cria o usuário, os dois índices e o token, e envia o código', async () => {
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

  it('cria a conta do Firebase desativada, com o e-mail interno', async () => {
    await startSignup(form)
    const uid = h.db.read('matriculaIndex', '2412858')!.uid

    expect(h.auth.createUser).toHaveBeenCalledWith({
      uid,
      email: '2412858@contas.uni-books.app',
      password: '12345678',
      disabled: true,
    })
  })

  it('nunca guarda o código nem a senha no banco', async () => {
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

  describe('unicidade de matrícula e e-mail', () => {
    async function activeStudent() {
      const uid = await signUp()
      h.db.put('users', uid, { ...h.db.read('users', uid)!, status: 'active' })
      return uid
    }

    it('recusa uma matrícula que já tem conta, dizendo o campo', async () => {
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

    it('recusa um e-mail que já tem conta, dizendo o campo', async () => {
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

    it('diz os dois campos quando os dois estão ocupados', async () => {
      await activeStudent()

      await expect(startSignup(form)).rejects.toMatchObject({
        code: 'signup_conflict',
        extra: { fields: [{ field: 'matricula' }, { field: 'email' }] },
      })
    })

    it('trata a matrícula de um bibliotecário como ocupada', async () => {
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

    it('compara o e-mail sem diferenciar maiúsculas', async () => {
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

  it('desfaz os documentos quando a conta do Firebase não pode ser criada', async () => {
    h.auth.createUser.mockRejectedValue(new Error('auth is down'))

    await expect(startSignup(form)).rejects.toThrow('auth is down')

    expect(h.db.all('users')).toEqual([])
    expect(h.db.all('matriculaIndex')).toEqual([])
    expect(h.db.all('emailIndex')).toEqual([])
    expect(h.db.all('emailTokens')).toEqual([])
    expect(h.sent).toEqual([])
  })

  describe('repetir o cadastro enquanto o e-mail não foi confirmado', () => {
    it('espera 60 segundos entre dois envios', async () => {
      await signUp()
      vi.setSystemTime(after(18))

      await expect(startSignup(form)).rejects.toMatchObject({
        status: 429,
        code: 'token_resend_too_soon',
        extra: { retryAfterSeconds: 42 },
      })
      expect(h.sent).toHaveLength(1)
    })

    it('troca o e-mail, a senha e o token', async () => {
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

    it('não aceita um e-mail que pertence a outra conta', async () => {
      await signUp()
      h.db.put('emailIndex', 'ocupado@edu.unifor.br', { uid: 'uid_other' })
      vi.setSystemTime(after(61))

      await expect(
        startSignup({ ...form, email: 'ocupado@edu.unifor.br' }),
      ).rejects.toMatchObject({ extra: { fields: [{ field: 'email' }] } })
    })
  })
})

describe('reenvio do token de confirmação (resendSignupToken)', () => {
  it('envia um token novo e invalida o antigo', async () => {
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

  it('responde 429 com os segundos que faltam quando pedido cedo demais', async () => {
    await signUp()
    vi.setSystemTime(after(10))

    await expect(resendSignupToken(form.matricula)).rejects.toMatchObject({
      status: 429,
      code: 'token_resend_too_soon',
      extra: { retryAfterSeconds: 50 },
    })
    expect(h.sent).toHaveLength(1)
  })

  it('não tem o que reenviar para matrícula desconhecida ou conta já confirmada', async () => {
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

describe('confirmação do e-mail (confirmSignup)', () => {
  it('ativa a conta, habilita no Firebase e devolve as opções do passkey', async () => {
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

  it('é de uso único: o mesmo token não confirma duas vezes', async () => {
    await signUp()
    const code = lastCode()
    await confirmSignup({ matricula: form.matricula, token: code })

    await expect(
      confirmSignup({ matricula: form.matricula, token: code }),
    ).rejects.toMatchObject({ status: 400, code: 'token_expired_or_used' })
  })

  it('recusa o token depois de 20 minutos', async () => {
    await signUp()
    vi.setSystemTime(after(20 * 60))

    await expect(
      confirmSignup({ matricula: form.matricula, token: lastCode() }),
    ).rejects.toMatchObject({ code: 'token_expired_or_used' })
    expect(h.auth.updateUser).not.toHaveBeenCalled()
  })

  it('aceita o token um segundo antes de vencer', async () => {
    await signUp()
    vi.setSystemTime(after(20 * 60 - 1))

    await expect(
      confirmSignup({ matricula: form.matricula, token: lastCode() }),
    ).resolves.toBeDefined()
  })

  it('conta cada código errado e bloqueia o token no quinto', async () => {
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

  it('não diferencia matrícula desconhecida de token antigo', async () => {
    await expect(
      confirmSignup({ matricula: '2513320', token: '123456' }),
    ).rejects.toMatchObject({ code: 'token_expired_or_used' })
  })

  it('deixa o token utilizável quando o Firebase falha ao habilitar a conta', async () => {
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
