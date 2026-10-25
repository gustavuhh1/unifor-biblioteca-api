import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
  send: vi.fn(),
}))

vi.mock('../../config/env.js', () => ({ env: h.env }))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: h.send }
  },
}))

const { mailMode, sendEmail } = await import('./email.js')

const MESSAGE = {
  to: 'lucas@edu.unifor.br',
  subject: 'Assunto',
  text: 'Texto',
  html: '<p>Texto</p>',
}

describe('modo de envio do e-mail (mailMode)', () => {
  it('envia pelo Resend quando há chave', () => {
    expect(mailMode({ RESEND_API_KEY: 'key' })).toBe('resend')
    expect(
      mailMode({
        RESEND_API_KEY: 'key',
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8085',
      }),
    ).toBe('resend')
  })

  it('escreve o token no console só no emulador e sem chave', () => {
    expect(mailMode({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8085' })).toBe(
      'console',
    )
  })

  it('não envia nem imprime nada contra o projeto real sem chave', () => {
    expect(mailMode({})).toBe('unavailable')
  })
})

describe('envio do e-mail (sendEmail)', () => {
  beforeEach(() => {
    for (const key of Object.keys(h.env)) delete h.env[key]
    h.send.mockReset()
  })

  it('devolve sent quando o Resend aceita, com o remetente da API', async () => {
    h.env.RESEND_API_KEY = 'key'
    h.env.EMAIL_FROM = 'Unifor Biblioteca <nao-responda@email.uni-books.app>'
    h.send.mockResolvedValue({ data: { id: 'e1' }, error: null })

    expect(await sendEmail(MESSAGE)).toBe('sent')
    expect(h.send).toHaveBeenCalledWith({
      from: 'Unifor Biblioteca <nao-responda@email.uni-books.app>',
      ...MESSAGE,
    })
  })

  it('devolve failed quando o Resend recusa, sem lançar erro', async () => {
    h.env.RESEND_API_KEY = 'key'
    h.env.EMAIL_FROM = 'from@email.uni-books.app'
    h.send.mockResolvedValue({ data: null, error: { name: 'rate_limit' } })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(await sendEmail(MESSAGE)).toBe('failed')
  })

  it('devolve failed quando a chamada ao Resend cai', async () => {
    h.env.RESEND_API_KEY = 'key'
    h.env.EMAIL_FROM = 'from@email.uni-books.app'
    h.send.mockRejectedValue(new Error('rede'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(await sendEmail(MESSAGE)).toBe('failed')
  })

  it('devolve unavailable sem chave contra o projeto real ou sem EMAIL_FROM', async () => {
    expect(await sendEmail(MESSAGE)).toBe('unavailable')

    h.env.RESEND_API_KEY = 'key'
    expect(await sendEmail(MESSAGE)).toBe('unavailable')
    expect(h.send).not.toHaveBeenCalled()
  })

  it('devolve console no emulador sem chave e não envia nada', async () => {
    h.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085'

    expect(await sendEmail(MESSAGE)).toBe('console')
    expect(h.send).not.toHaveBeenCalled()
  })
})
