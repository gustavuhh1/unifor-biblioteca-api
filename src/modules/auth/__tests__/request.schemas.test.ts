import { describe, expect, it } from 'vitest'
import {
  fullNameSchema,
  institutionalEmailSchema,
  matriculaSchema,
  passkeyRegisterBodySchema,
  passwordResetBodySchema,
  passwordSchema,
  signupStartBodySchema,
  tokenCodeSchema,
} from '../schemas/request.schemas.js'

describe('institutionalEmailSchema', () => {
  it('accepts an @edu.unifor.br e-mail and lower-cases it', () => {
    expect(institutionalEmailSchema.parse('lucas@edu.unifor.br')).toBe(
      'lucas@edu.unifor.br',
    )
    expect(
      institutionalEmailSchema.parse('  Lucas.Almeida@EDU.UNIFOR.BR '),
    ).toBe('lucas.almeida@edu.unifor.br')
    expect(institutionalEmailSchema.parse('2412858@edu.unifor.br')).toBe(
      '2412858@edu.unifor.br',
    )
  })

  it.each([
    'lucas@gmail.com',
    'lucas@unifor.br',
    'lucas@aluno.edu.unifor.br',
    'lucas@edu.unifor.br.evil.com',
    'lucas@edu-unifor.br',
    'lucas@@edu.unifor.br',
    'lu cas@edu.unifor.br',
    '@edu.unifor.br',
    'edu.unifor.br',
    '',
  ])('refuses %j', (email) => {
    expect(institutionalEmailSchema.safeParse(email).success).toBe(false)
  })

  it('explains the rule in Portuguese', () => {
    const result = institutionalEmailSchema.safeParse('lucas@gmail.com')

    expect(result.error?.issues[0]?.message).toBe(
      'Use o e-mail institucional, que termina em @edu.unifor.br.',
    )
  })
})

describe('matriculaSchema', () => {
  it('accepts exactly seven digits', () => {
    expect(matriculaSchema.parse('2412858')).toBe('2412858')
    expect(matriculaSchema.parse(' 2513320 ')).toBe('2513320')
    expect(matriculaSchema.parse('0012345')).toBe('0012345')
  })

  it.each([
    '241285',
    '24128588',
    'abcdefg',
    '241285a',
    '241 2858',
    '',
    '-241285',
  ])('refuses %j', (matricula) => {
    expect(matriculaSchema.safeParse(matricula).success).toBe(false)
  })

  it('refuses a number that is not text', () => {
    expect(matriculaSchema.safeParse(2412858).success).toBe(false)
  })
})

describe('passwordSchema', () => {
  it('accepts digits only, from 8 up', () => {
    expect(passwordSchema.safeParse('12345678').success).toBe(true)
    expect(passwordSchema.safeParse('1234567890123').success).toBe(true)
  })

  it.each([
    '1234567',
    'abcd1234',
    '1234 5678',
    '12345678a',
    '',
    '１２３４５６７８',
  ])('refuses %j', (password) => {
    expect(passwordSchema.safeParse(password).success).toBe(false)
  })

  it('limits the length of the input', () => {
    expect(passwordSchema.safeParse('1'.repeat(128)).success).toBe(true)
    expect(passwordSchema.safeParse('1'.repeat(129)).success).toBe(false)
  })
})

describe('tokenCodeSchema', () => {
  it('accepts six digits', () => {
    expect(tokenCodeSchema.parse('012345')).toBe('012345')
    expect(tokenCodeSchema.parse(' 482913 ')).toBe('482913')
  })

  it.each(['12345', '1234567', 'abcdef', '12 456'])('refuses %j', (token) => {
    expect(tokenCodeSchema.safeParse(token).success).toBe(false)
  })
})

describe('signupStartBodySchema', () => {
  const valid = {
    email: 'lucas@edu.unifor.br',
    matricula: '2412858',
    password: '12345678',
    passwordConfirmation: '12345678',
  }

  it('accepts a complete form', () => {
    expect(signupStartBodySchema.parse(valid)).toEqual(valid)
  })

  it('points at the confirmation when the passwords differ', () => {
    const result = signupStartBodySchema.safeParse({
      ...valid,
      passwordConfirmation: '87654321',
    })

    expect(result.error?.issues).toMatchObject([
      { path: ['passwordConfirmation'], message: 'As senhas não conferem.' },
    ])
  })

  it('reports each wrong field', () => {
    const result = signupStartBodySchema.safeParse({
      email: 'lucas@gmail.com',
      matricula: '12',
      password: 'abc',
      passwordConfirmation: 'abc',
    })

    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual([
      'email',
      'matricula',
      'password',
    ])
  })

  it('refuses a missing field in Portuguese', () => {
    const result = signupStartBodySchema.safeParse({})

    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'Informe o e-mail.',
      'Informe a matrícula.',
      'Informe a senha.',
      'Confirme a senha.',
    ])
  })
})

describe('passwordResetBodySchema', () => {
  it('needs the matrícula, the token and a matching new password', () => {
    const body = {
      matricula: '2412858',
      token: '123456',
      password: '12345678',
      passwordConfirmation: '12345678',
    }

    expect(passwordResetBodySchema.safeParse(body).success).toBe(true)
    expect(
      passwordResetBodySchema.safeParse({ ...body, passwordConfirmation: '1' })
        .success,
    ).toBe(false)
    expect(
      passwordResetBodySchema.safeParse({ ...body, password: 'senha-forte' })
        .success,
    ).toBe(false)
  })
})

describe('fullNameSchema', () => {
  it('accepts a first name and a surname and tidies the spaces', () => {
    expect(fullNameSchema.parse('Lucas Almeida')).toBe('Lucas Almeida')
    expect(fullNameSchema.parse('  Maria   da  Silva ')).toBe('Maria da Silva')
  })

  it('refuses one word, too short and too long', () => {
    expect(fullNameSchema.safeParse('Lucas').error?.issues[0]?.message).toBe(
      'Informe nome e sobrenome.',
    )
    expect(fullNameSchema.safeParse('  ').success).toBe(false)
    expect(fullNameSchema.safeParse('Jo').success).toBe(false)
    expect(fullNameSchema.safeParse(`A ${'b'.repeat(99)}`).success).toBe(false)
  })

  it('accepts the limits of 3 and 100 characters', () => {
    expect(fullNameSchema.safeParse('A B').success).toBe(true)
    expect(
      fullNameSchema.safeParse(`A ${'b'.repeat(98)}`.slice(0, 100)).success,
    ).toBe(true)
  })
})

describe('passkeyRegisterBodySchema', () => {
  const response = {
    id: 'cred',
    rawId: 'cred',
    type: 'public-key',
    response: { clientDataJSON: 'a', attestationObject: 'b' },
  }

  it('needs the phone response and a device name', () => {
    expect(
      passkeyRegisterBodySchema.safeParse({
        response,
        deviceName: 'Galaxy A54',
      }).success,
    ).toBe(true)
    expect(passkeyRegisterBodySchema.safeParse({ response }).success).toBe(
      false,
    )
    expect(
      passkeyRegisterBodySchema.safeParse({ response, deviceName: '  ' })
        .success,
    ).toBe(false)
    expect(
      passkeyRegisterBodySchema.safeParse({
        response,
        deviceName: 'x'.repeat(61),
      }).success,
    ).toBe(false)
  })

  it('keeps the fields of the response it does not know', () => {
    const parsed = passkeyRegisterBodySchema.parse({
      response: { ...response, authenticatorAttachment: 'platform' },
      deviceName: 'Galaxy A54',
    })

    expect(parsed.response).toMatchObject({
      authenticatorAttachment: 'platform',
    })
  })
})
