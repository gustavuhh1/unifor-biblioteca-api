import { generateRegistrationOptions } from '@simplewebauthn/server'
import { describe, expect, it } from 'vitest'
import { RP_NAME } from '../auth.constants.js'
import {
  buildAuthenticationOptionsInput,
  buildExpectedOrigins,
  buildRegistrationOptionsInput,
  challengeFromClientData,
} from '../rules/passkey-options.rules.js'

const ANDROID = 'android:apk-key-hash:AbC-_123'

describe('origens aceitas (buildExpectedOrigins)', () => {
  it('aceita a origem web do RP ID', () => {
    expect(buildExpectedOrigins('uni-books.app', [])).toEqual([
      'https://uni-books.app',
    ])
  })

  it('acrescenta as origens do app Android', () => {
    expect(buildExpectedOrigins('uni-books.app', [ANDROID])).toEqual([
      'https://uni-books.app',
      ANDROID,
    ])
  })
})

describe('opções de criação do passkey (buildRegistrationOptionsInput)', () => {
  const input = {
    rpId: 'uni-books.app',
    uid: 'uid_lucas',
    matricula: '2412858',
    fullName: 'Lucas Almeida',
    existingCredentials: [
      { id: 'cred-1', transports: ['internal', 'hybrid'] },
      { id: 'cred-2' },
    ],
  }

  it('nomeia o RP e o usuário sem usar o e-mail', () => {
    const options = buildRegistrationOptionsInput(input)

    expect(options.rpID).toBe('uni-books.app')
    expect(options.rpName).toBe(RP_NAME)
    expect(options.userName).toBe('2412858')
    expect(options.userDisplayName).toBe('Lucas Almeida')
    expect(new TextDecoder().decode(options.userID)).toBe('uid_lucas')
  })

  it('mostra a matrícula quando o aluno ainda não tem nome', () => {
    const { fullName, ...withoutName } = input
    void fullName

    expect(buildRegistrationOptionsInput(withoutName).userDisplayName).toBe(
      '2412858',
    )
  })

  it('pede chave descobrível com verificação do usuário (biometria ou PIN)', () => {
    expect(buildRegistrationOptionsInput(input).authenticatorSelection).toEqual(
      { residentKey: 'required', userVerification: 'required' },
    )
  })

  it('exclui os passkeys que a conta já tem', () => {
    expect(buildRegistrationOptionsInput(input).excludeCredentials).toEqual([
      { id: 'cred-1', transports: ['internal', 'hybrid'] },
      { id: 'cred-2' },
    ])
  })

  it('vira opções com um desafio novo a cada vez', async () => {
    const first = await generateRegistrationOptions(
      buildRegistrationOptionsInput(input),
    )
    const second = await generateRegistrationOptions(
      buildRegistrationOptionsInput(input),
    )

    expect(first.rp).toEqual({ id: 'uni-books.app', name: RP_NAME })
    expect(first.pubKeyCredParams.map((param) => param.alg)).toEqual([
      -7, -257, -8,
    ])
    expect(first.user.name).toBe('2412858')
    expect(first.excludeCredentials?.map((c) => c.id)).toEqual([
      'cred-1',
      'cred-2',
    ])
    expect(first.challenge).not.toBe(second.challenge)
    expect(Buffer.from(first.challenge, 'base64url')).toHaveLength(32)
  })
})

describe('opções do login com passkey (buildAuthenticationOptionsInput)', () => {
  it('lista os passkeys da matrícula e exige a verificação do usuário', () => {
    const options = buildAuthenticationOptionsInput({
      rpId: 'uni-books.app',
      credentials: [{ id: 'cred-1', transports: ['internal'] }],
    })

    expect(options).toEqual({
      rpID: 'uni-books.app',
      allowCredentials: [{ id: 'cred-1', transports: ['internal'] }],
      userVerification: 'required',
    })
  })

  it('não tem credenciais para uma matrícula sem passkeys', () => {
    expect(
      buildAuthenticationOptionsInput({
        rpId: 'uni-books.app',
        credentials: [],
      }).allowCredentials,
    ).toEqual([])
  })
})

describe('desafio dentro do clientDataJSON (challengeFromClientData)', () => {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')

  it('lê o desafio que o celular assinou', () => {
    const clientData = encode({
      type: 'webauthn.create',
      challenge: 'abc-123_xyz',
      origin: 'https://uni-books.app',
    })

    expect(challengeFromClientData(clientData)).toBe('abc-123_xyz')
  })

  it('não devolve nada para um dado que não é um clientDataJSON', () => {
    expect(challengeFromClientData('not base64 json')).toBeUndefined()
    expect(challengeFromClientData(encode({ type: 'webauthn.get' }))).toBe(
      undefined,
    )
    expect(challengeFromClientData(encode({ challenge: 42 }))).toBeUndefined()
    expect(challengeFromClientData(encode({ challenge: '' }))).toBeUndefined()
    expect(challengeFromClientData(encode(null))).toBeUndefined()
  })
})
