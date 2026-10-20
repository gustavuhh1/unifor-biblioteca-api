import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { START, after } from '../../../test-support/clock.js'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({
  db: undefined as unknown as FakeFirestore,
  auth: {
    createUser: vi.fn(),
    updateUser: vi.fn(),
    revokeRefreshTokens: vi.fn(),
  },
  sendEmail: vi.fn(),
  sent: [] as { to: string; purpose: string; code: string }[],
}))

vi.mock('../../../config/firebase.js', () => ({
  getDb: () => h.db,
  getAdminAuth: () => h.auth,
}))
vi.mock('../mail/mailer.js', () => ({ sendTokenEmail: h.sendEmail }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { RECOVERY_MESSAGE } = await import('../auth.constants.js')
const { requestPasswordRecovery, resetPassword } =
  await import('../services/password.service.js')

function addUser(
  uid: string,
  matricula: string,
  overrides: Record<string, unknown> = {},
) {
  h.db.put('matriculaIndex', matricula, { uid, role: 'student' })
  h.db.put('users', uid, {
    role: 'student',
    matricula,
    email: `${matricula}@edu.unifor.br`,
    status: 'active',
    ...overrides,
  })
}

const lastCode = () => h.sent[h.sent.length - 1]!.code
const tokens = () => h.db.all('emailTokens')

const resetBody = (token: string, matricula = '2412858') => ({
  matricula,
  token,
  password: '87654321',
  passwordConfirmation: '87654321',
})

beforeEach(() => {
  h.db = new Fake()
  h.sent.length = 0
  h.auth.updateUser.mockReset().mockResolvedValue({})
  h.auth.revokeRefreshTokens.mockReset().mockResolvedValue(undefined)
  h.sendEmail.mockReset().mockImplementation(async (input) => {
    h.sent.push(input)
  })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  addUser('uid_lucas', '2412858')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('pedido de recuperação de senha (requestPasswordRecovery)', () => {
  it('envia um token ao e-mail da conta e responde a mensagem genérica', async () => {
    const result = await requestPasswordRecovery('2412858')

    expect(result).toEqual({ message: RECOVERY_MESSAGE })
    expect(h.sent).toHaveLength(1)
    expect(h.sent[0]).toMatchObject({
      to: '2412858@edu.unifor.br',
      purpose: 'password_reset',
    })
    expect(tokens()[0]).toMatchObject({
      uid: 'uid_lucas',
      purpose: 'password_reset',
      sentTo: '2412858@edu.unifor.br',
    })
  })

  it('funciona para bibliotecário', async () => {
    addUser('uid_ana', '1000001', {
      role: 'librarian',
      email: 'ana@unifor.br',
    })

    await requestPasswordRecovery('1000001')

    expect(h.sent[0]).toMatchObject({ to: 'ana@unifor.br' })
  })

  it('dá a mesma resposta, sem enviar nada, quando a conta não existe', async () => {
    const unknown = await requestPasswordRecovery('2513320')
    const known = await requestPasswordRecovery('2412858')

    expect(unknown).toEqual(known)
    expect(h.sent).toHaveLength(1)
    expect(h.db.all('emailTokens')).toHaveLength(1)
  })

  it('não envia nada a uma conta que ainda não confirmou o e-mail', async () => {
    addUser('uid_marina', '2513320', { status: 'pending_email' })

    const result = await requestPasswordRecovery('2513320')

    expect(result).toEqual({ message: RECOVERY_MESSAGE })
    expect(h.sent).toEqual([])
  })

  it('não envia um segundo e-mail em 60 segundos, mas responde igual', async () => {
    const first = await requestPasswordRecovery('2412858')
    vi.setSystemTime(after(25))

    const tooSoon = await requestPasswordRecovery('2412858')

    expect(tooSoon).toEqual(first)
    expect(tooSoon).toEqual({ message: RECOVERY_MESSAGE })
    expect(h.sent).toHaveLength(1)
    expect(tokens()).toHaveLength(1)
    expect(tokens()[0]!.invalidatedAt).toBeUndefined()

    vi.setSystemTime(after(60))
    await expect(requestPasswordRecovery('2412858')).resolves.toEqual(first)
    expect(h.sent).toHaveLength(2)
  })

  it('responde exatamente igual para uma conta, uma matrícula desconhecida e um pedido cedo demais', async () => {
    const unknown = await requestPasswordRecovery('2999999')
    const known = await requestPasswordRecovery('2412858')
    const tooSoon = await requestPasswordRecovery('2412858')

    expect(JSON.stringify(known)).toBe(JSON.stringify(unknown))
    expect(JSON.stringify(tooSoon)).toBe(JSON.stringify(unknown))
  })

  it('mantém a resposta genérica quando o e-mail não pode ser enviado', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.sendEmail.mockRejectedValue(new Error('resend is down'))

    await expect(requestPasswordRecovery('2412858')).resolves.toEqual({
      message: RECOVERY_MESSAGE,
    })
  })

  it('mantém o token de confirmação separado do de recuperação', async () => {
    h.db.put('emailTokens', 'old', {
      uid: 'uid_lucas',
      purpose: 'email_confirmation',
      createdAt: START,
    })

    await requestPasswordRecovery('2412858')

    expect(h.db.read('emailTokens', 'old')!.invalidatedAt).toBeUndefined()
  })
})

describe('redefinição de senha (resetPassword)', () => {
  it('define a nova senha, revoga as sessões e usa o token', async () => {
    await requestPasswordRecovery('2412858')
    vi.setSystemTime(after(120))

    await resetPassword(resetBody(lastCode()))

    expect(h.auth.updateUser).toHaveBeenCalledWith('uid_lucas', {
      password: '87654321',
    })
    expect(h.auth.revokeRefreshTokens).toHaveBeenCalledWith('uid_lucas')
    expect(tokens()[0]!.usedAt).toEqual(after(120))
    expect(h.db.all('auditLog')).toMatchObject([
      { action: 'password_reset', actorUid: 'uid_lucas', actorRole: 'student' },
    ])
  })

  it('é de uso único: o token não redefine a senha duas vezes', async () => {
    await requestPasswordRecovery('2412858')
    const code = lastCode()
    await resetPassword(resetBody(code))
    h.auth.updateUser.mockClear()

    await expect(resetPassword(resetBody(code))).rejects.toMatchObject({
      status: 400,
      code: 'token_expired_or_used',
    })
    expect(h.auth.updateUser).not.toHaveBeenCalled()
  })

  it('recusa o token depois de 20 minutos', async () => {
    await requestPasswordRecovery('2412858')
    vi.setSystemTime(after(20 * 60))

    await expect(resetPassword(resetBody(lastCode()))).rejects.toMatchObject({
      code: 'token_expired_or_used',
    })
    expect(h.auth.updateUser).not.toHaveBeenCalled()
  })

  it('bloqueia o token depois de cinco códigos errados', async () => {
    await requestPasswordRecovery('2412858')
    const right = lastCode()
    const wrong = right === '000000' ? '111111' : '000000'

    for (let i = 0; i < 5; i++) {
      await expect(resetPassword(resetBody(wrong))).rejects.toMatchObject({
        code: 'token_invalid',
      })
    }
    expect(tokens()[0]!.attempts).toBe(5)

    await expect(resetPassword(resetBody(right))).rejects.toMatchObject({
      code: 'token_attempts_exceeded',
    })
    expect(h.auth.updateUser).not.toHaveBeenCalled()
    expect(h.db.all('auditLog')).toEqual([])
  })

  it('recusa um token que um pedido mais novo substituiu', async () => {
    await requestPasswordRecovery('2412858')
    const first = lastCode()
    vi.setSystemTime(after(61))
    await requestPasswordRecovery('2412858')

    await expect(resetPassword(resetBody(first))).rejects.toMatchObject({
      code: 'token_invalid',
    })
  })

  it('responde uma matrícula desconhecida como um token vencido', async () => {
    await expect(
      resetPassword(resetBody('123456', '2513320')),
    ).rejects.toMatchObject({ code: 'token_expired_or_used' })
  })

  it('não aceita um token de confirmação para redefinir a senha', async () => {
    h.db.put('emailTokens', 'confirm', {
      uid: 'uid_lucas',
      purpose: 'email_confirmation',
      codeHash: 'x',
      salt: 'y',
      expiresAt: after(600),
      attempts: 0,
      createdAt: START,
    })

    await expect(resetPassword(resetBody('123456'))).rejects.toMatchObject({
      code: 'token_expired_or_used',
    })
  })
})
