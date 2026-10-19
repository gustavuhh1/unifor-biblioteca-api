import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({
  db: undefined as unknown as FakeFirestore,
  auth: { createCustomToken: vi.fn() },
}))

vi.mock('../../../config/firebase.js', () => ({
  getDb: () => h.db,
  getAdminAuth: () => h.auth,
}))
vi.mock('../../../config/env.js', () => ({
  env: {
    PASSKEY_RP_ID: 'uni-books.app',
    PASSKEY_ANDROID_ORIGINS: ['android:apk-key-hash:AbC-_123'],
  },
}))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const {
  createLoginOptions,
  createRegistrationOptions,
  listPasskeys,
  removePasskey,
  verifyLogin,
  verifyRegistration,
} = await import('../services/passkey.service.js')

const START = new Date('2026-10-19T12:00:00Z')
const after = (seconds: number) => new Date(START.getTime() + seconds * 1000)

function addStudent(uid: string, matricula: string, role = 'student') {
  h.db.put('matriculaIndex', matricula, { uid, role })
  h.db.put('users', uid, { role, matricula, status: 'active' })
}

function addPasskey(id: string, uid: string, extra = {}) {
  h.db.put('passkeys', id, {
    uid,
    publicKey: 'a2V5',
    signCount: 0,
    deviceName: 'Galaxy A54',
    createdAt: START,
    ...extra,
  })
}

const clientData = (challenge: string) =>
  Buffer.from(JSON.stringify({ challenge })).toString('base64url')

function loginBody(challenge: string, credentialId = 'cred-1') {
  return {
    response: {
      id: credentialId,
      rawId: credentialId,
      type: 'public-key' as const,
      clientExtensionResults: {},
      response: {
        clientDataJSON: clientData(challenge),
        authenticatorData: 'x',
        signature: 'y',
      },
    },
  }
}

function registerBody(challenge: string) {
  return {
    deviceName: 'Galaxy A54',
    response: {
      id: 'cred-new',
      rawId: 'cred-new',
      type: 'public-key' as const,
      clientExtensionResults: {},
      response: {
        clientDataJSON: clientData(challenge),
        attestationObject: 'x',
      },
    },
  }
}

function addChallenge(
  challenge: string,
  overrides: Record<string, unknown> = {},
) {
  h.db.put('passkeyChallenges', `ch-${challenge}`, {
    challenge,
    purpose: 'authentication',
    uid: 'uid_lucas',
    expiresAt: after(300),
    createdAt: START,
    ...overrides,
  })
}

beforeEach(() => {
  h.db = new Fake()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  addStudent('uid_lucas', '2412858')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createRegistrationOptions', () => {
  it('stores a challenge for the account that lasts 5 minutes', async () => {
    const options = await createRegistrationOptions('uid_lucas')

    expect(h.db.all('passkeyChallenges')).toMatchObject([
      {
        challenge: options.challenge,
        purpose: 'registration',
        uid: 'uid_lucas',
        expiresAt: after(5 * 60),
      },
    ])
  })

  it('makes the phone refuse a second passkey on a device that has one', async () => {
    addPasskey('cred-1', 'uid_lucas', { transports: ['internal'] })
    addPasskey('cred-other', 'uid_marina')

    const options = await createRegistrationOptions('uid_lucas')

    expect(options.excludeCredentials).toEqual([
      { id: 'cred-1', type: 'public-key', transports: ['internal'] },
    ])
  })
})

describe('createLoginOptions', () => {
  it('lists the passkeys of the matrícula and stores a challenge for its owner', async () => {
    addPasskey('cred-1', 'uid_lucas')

    const options = await createLoginOptions('2412858')

    expect(options.rpId).toBe('uni-books.app')
    expect(options.allowCredentials?.map((c) => c.id)).toEqual(['cred-1'])
    expect(options.userVerification).toBe('required')
    expect(h.db.all('passkeyChallenges')).toMatchObject([
      {
        challenge: options.challenge,
        purpose: 'authentication',
        uid: 'uid_lucas',
      },
    ])
  })

  it('gives a new challenge on every request', async () => {
    addPasskey('cred-1', 'uid_lucas')

    const first = await createLoginOptions('2412858')
    const second = await createLoginOptions('2412858')

    expect(first.challenge).not.toBe(second.challenge)
  })

  it('answers an unknown matrícula, a librarian and a student without passkeys the same way', async () => {
    addStudent('uid_ana', '1000001', 'librarian')
    addPasskey('cred-ana', 'uid_ana')
    addStudent('uid_marina', '2513320')

    const answers = await Promise.all(
      ['2999999', '1000001', '2513320'].map(createLoginOptions),
    )

    for (const options of answers) {
      expect(options.allowCredentials).toEqual([])
      expect(options.rpId).toBe('uni-books.app')
    }
    expect(h.db.all('passkeyChallenges')).toEqual([])
  })
})

describe('verifyLogin', () => {
  it('refuses a challenge the API never issued', async () => {
    await expect(verifyLogin(loginBody('made-up'))).rejects.toMatchObject({
      status: 401,
      code: 'passkey_login_failed',
    })
  })

  it('refuses client data without a challenge', async () => {
    const body = loginBody('x')
    body.response.response.clientDataJSON = 'not json'

    await expect(verifyLogin(body)).rejects.toMatchObject({ status: 401 })
  })

  it('refuses an expired challenge', async () => {
    addPasskey('cred-1', 'uid_lucas')
    addChallenge('old', { expiresAt: after(-1) })

    await expect(verifyLogin(loginBody('old'))).rejects.toMatchObject({
      code: 'passkey_login_failed',
    })
    expect(h.db.read('passkeyChallenges', 'ch-old')!.usedAt).toBeUndefined()
  })

  it('refuses a challenge made for registration', async () => {
    addPasskey('cred-1', 'uid_lucas')
    addChallenge('reg', { purpose: 'registration' })

    await expect(verifyLogin(loginBody('reg'))).rejects.toMatchObject({
      code: 'passkey_login_failed',
    })
  })

  it('spends the challenge even when the response is wrong, so it works once', async () => {
    addPasskey('cred-1', 'uid_lucas')
    addChallenge('c1')

    await expect(verifyLogin(loginBody('c1'))).rejects.toMatchObject({
      code: 'passkey_login_failed',
    })
    expect(h.db.read('passkeyChallenges', 'ch-c1')!.usedAt).toEqual(START)

    // O mesmo desafio não pode ser tentado de novo.
    await expect(verifyLogin(loginBody('c1'))).rejects.toMatchObject({
      code: 'passkey_login_failed',
    })
  })

  it('refuses a passkey that belongs to another account', async () => {
    addPasskey('cred-1', 'uid_marina')
    addChallenge('c2')

    await expect(verifyLogin(loginBody('c2'))).rejects.toMatchObject({
      code: 'passkey_login_failed',
    })
    expect(h.auth.createCustomToken).not.toHaveBeenCalled()
  })

  it('refuses a passkey that does not exist', async () => {
    addChallenge('c3')

    await expect(
      verifyLogin(loginBody('c3', 'cred-missing')),
    ).rejects.toMatchObject({ code: 'passkey_login_failed' })
  })

  it('refuses a signature that does not verify, without issuing a token', async () => {
    addPasskey('cred-1', 'uid_lucas')
    addChallenge('c4')

    await expect(verifyLogin(loginBody('c4'))).rejects.toMatchObject({
      code: 'passkey_login_failed',
    })
    expect(h.auth.createCustomToken).not.toHaveBeenCalled()
    expect(h.db.read('passkeys', 'cred-1')!.lastUsedAt).toBeUndefined()
  })
})

describe('verifyRegistration', () => {
  it('refuses a challenge the API never issued', async () => {
    await expect(
      verifyRegistration(registerBody('made-up')),
    ).rejects.toMatchObject({
      status: 400,
      code: 'passkey_challenge_invalid',
    })
  })

  it('refuses an authentication challenge', async () => {
    addChallenge('login-challenge')

    await expect(
      verifyRegistration(registerBody('login-challenge')),
    ).rejects.toMatchObject({ code: 'passkey_challenge_invalid' })
  })

  it('spends the registration challenge even when the response is wrong', async () => {
    addChallenge('r1', { purpose: 'registration' })

    await expect(verifyRegistration(registerBody('r1'))).rejects.toMatchObject({
      code: 'passkey_registration_failed',
    })
    expect(h.db.read('passkeyChallenges', 'ch-r1')!.usedAt).toEqual(START)
    expect(h.db.all('passkeys')).toEqual([])

    await expect(verifyRegistration(registerBody('r1'))).rejects.toMatchObject({
      code: 'passkey_challenge_invalid',
    })
  })
})

describe('listPasskeys', () => {
  it('lists only the devices of the account, newest first, without the key', async () => {
    addPasskey('cred-old', 'uid_lucas', {
      deviceName: 'Pixel 7',
      createdAt: after(-1000),
      lastUsedAt: after(-500),
    })
    addPasskey('cred-new', 'uid_lucas')
    addPasskey('cred-other', 'uid_marina')

    const { passkeys } = await listPasskeys('uid_lucas')

    expect(passkeys).toEqual([
      {
        id: 'cred-new',
        deviceName: 'Galaxy A54',
        createdAt: START.toISOString(),
        lastUsedAt: null,
      },
      {
        id: 'cred-old',
        deviceName: 'Pixel 7',
        createdAt: after(-1000).toISOString(),
        lastUsedAt: after(-500).toISOString(),
      },
    ])
    expect(JSON.stringify(passkeys)).not.toContain('publicKey')
  })
})

describe('removePasskey', () => {
  it('deletes the passkey and writes the audit log', async () => {
    addPasskey('cred-1', 'uid_lucas')

    await removePasskey('uid_lucas', 'cred-1')

    expect(h.db.read('passkeys', 'cred-1')).toBeUndefined()
    expect(h.db.all('auditLog')).toMatchObject([
      {
        action: 'passkey_remove',
        actorUid: 'uid_lucas',
        entityId: 'cred-1',
      },
    ])
  })

  it('says "not found" for a passkey of someone else and keeps it', async () => {
    addPasskey('cred-1', 'uid_marina')

    await expect(removePasskey('uid_lucas', 'cred-1')).rejects.toMatchObject({
      status: 404,
      code: 'passkey_not_found',
    })
    await expect(removePasskey('uid_lucas', 'missing')).rejects.toMatchObject({
      status: 404,
    })
    expect(h.db.read('passkeys', 'cred-1')).toBeDefined()
    expect(h.db.all('auditLog')).toEqual([])
  })
})
