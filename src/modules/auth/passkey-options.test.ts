import { generateRegistrationOptions } from '@simplewebauthn/server'
import { describe, expect, it } from 'vitest'
import {
  RP_NAME,
  buildAuthenticationOptionsInput,
  buildExpectedOrigins,
  buildRegistrationOptionsInput,
  challengeFromClientData,
} from './passkey-options.js'

const ANDROID = 'android:apk-key-hash:AbC-_123'

describe('buildExpectedOrigins', () => {
  it('accepts the web origin of the RP ID', () => {
    expect(buildExpectedOrigins('uni-books.app', [])).toEqual([
      'https://uni-books.app',
    ])
  })

  it('adds the origins of the Android app', () => {
    expect(buildExpectedOrigins('uni-books.app', [ANDROID])).toEqual([
      'https://uni-books.app',
      ANDROID,
    ])
  })
})

describe('buildRegistrationOptionsInput', () => {
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

  it('names the RP and the user without using the e-mail', () => {
    const options = buildRegistrationOptionsInput(input)

    expect(options.rpID).toBe('uni-books.app')
    expect(options.rpName).toBe(RP_NAME)
    expect(options.userName).toBe('2412858')
    expect(options.userDisplayName).toBe('Lucas Almeida')
    expect(new TextDecoder().decode(options.userID)).toBe('uid_lucas')
  })

  it('shows the matrícula when the student has no name yet', () => {
    const { fullName, ...withoutName } = input
    void fullName

    expect(buildRegistrationOptionsInput(withoutName).userDisplayName).toBe(
      '2412858',
    )
  })

  it('asks for a discoverable key with user verification (biometrics or PIN)', () => {
    expect(buildRegistrationOptionsInput(input).authenticatorSelection).toEqual(
      { residentKey: 'required', userVerification: 'required' },
    )
  })

  it('excludes the passkeys the account already has', () => {
    expect(buildRegistrationOptionsInput(input).excludeCredentials).toEqual([
      { id: 'cred-1', transports: ['internal', 'hybrid'] },
      { id: 'cred-2' },
    ])
  })

  it('turns into options with a new challenge each time', async () => {
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

describe('buildAuthenticationOptionsInput', () => {
  it('lists the passkeys of the matrícula and requires user verification', () => {
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

  it('has no credentials for a matrícula without passkeys', () => {
    expect(
      buildAuthenticationOptionsInput({
        rpId: 'uni-books.app',
        credentials: [],
      }).allowCredentials,
    ).toEqual([])
  })
})

describe('challengeFromClientData', () => {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')

  it('reads the challenge the phone signed', () => {
    const clientData = encode({
      type: 'webauthn.create',
      challenge: 'abc-123_xyz',
      origin: 'https://uni-books.app',
    })

    expect(challengeFromClientData(clientData)).toBe('abc-123_xyz')
  })

  it('returns nothing for data that is not a client data JSON', () => {
    expect(challengeFromClientData('not base64 json')).toBeUndefined()
    expect(challengeFromClientData(encode({ type: 'webauthn.get' }))).toBe(
      undefined,
    )
    expect(challengeFromClientData(encode({ challenge: 42 }))).toBeUndefined()
    expect(challengeFromClientData(encode({ challenge: '' }))).toBeUndefined()
    expect(challengeFromClientData(encode(null))).toBeUndefined()
  })
})
