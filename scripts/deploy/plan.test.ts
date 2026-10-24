import { describe, expect, it } from 'vitest'
import {
  SECRETS,
  buildArgs,
  deployArgs,
  envVarsYaml,
  imageName,
  planDeployEnv,
} from './plan.js'

const ORIGIN = 'android:apk-key-hash:abc_DEF-123'

// .env de quem vai fazer o deploy: com os hosts dos emuladores, como no dia a dia.
const goodEnv: NodeJS.ProcessEnv = {
  GOOGLE_CLOUD_PROJECT: 'estoque-pay',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8085',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  PASSKEY_RP_ID: 'uni-books.app',
  PASSKEY_ANDROID_ORIGINS: ORIGIN,
  AUTH_EMAIL_DOMAIN: 'contas.uni-books.app',
  EMAIL_FROM: 'Unifor Biblioteca <nao-responda@email.uni-books.app>',
  GEMINI_MODEL: 'gemini-3.8-flash',
  RESEND_API_KEY: 'valor-que-nunca-deve-ir-ao-cloud-run',
}

describe('variáveis do deploy (planDeployEnv)', () => {
  it('monta as variáveis não secretas do Cloud Run a partir do .env', () => {
    const plan = planDeployEnv(goodEnv)

    expect(plan.problems).toEqual([])
    expect(plan.config?.project).toBe('estoque-pay')
    expect(plan.config?.envVars).toEqual({
      NODE_ENV: 'production',
      GOOGLE_CLOUD_PROJECT: 'estoque-pay',
      PASSKEY_RP_ID: 'uni-books.app',
      PASSKEY_ANDROID_ORIGINS: ORIGIN,
      AUTH_EMAIL_DOMAIN: 'contas.uni-books.app',
      EMAIL_FROM: 'Unifor Biblioteca <nao-responda@email.uni-books.app>',
      GEMINI_MODEL: 'gemini-3.8-flash',
    })
  })

  it('nunca leva os emuladores nem os segredos ao Cloud Run', () => {
    const names = Object.keys(planDeployEnv(goodEnv).config?.envVars ?? {})

    expect(names).not.toContain('FIRESTORE_EMULATOR_HOST')
    expect(names).not.toContain('FIREBASE_AUTH_EMULATOR_HOST')
    expect(names).not.toContain('RESEND_API_KEY')
  })

  it('junta várias origens do app Android separadas por vírgula', () => {
    const plan = planDeployEnv({
      ...goodEnv,
      PASSKEY_ANDROID_ORIGINS: `${ORIGIN}, android:apk-key-hash:outra`,
    })

    expect(plan.config?.envVars.PASSKEY_ANDROID_ORIGINS).toBe(
      `${ORIGIN},android:apk-key-hash:outra`,
    )
  })

  it('recusa quando falta a origem do passkey, o remetente ou o modelo', () => {
    const plan = planDeployEnv({
      ...goodEnv,
      PASSKEY_ANDROID_ORIGINS: '',
      EMAIL_FROM: '',
      GEMINI_MODEL: '',
    })

    expect(plan.config).toBeUndefined()
    expect(plan.problems).toHaveLength(3)
    expect(plan.problems.join(' ')).toMatch(/PASSKEY_ANDROID_ORIGINS/)
    expect(plan.problems.join(' ')).toMatch(/EMAIL_FROM/)
    expect(plan.problems.join(' ')).toMatch(/GEMINI_MODEL/)
  })

  it('recusa sem o RP ID do passkey ou sem o domínio das contas (exigidos em produção)', () => {
    const plan = planDeployEnv({
      ...goodEnv,
      PASSKEY_RP_ID: '',
      AUTH_EMAIL_DOMAIN: '',
    })

    expect(plan.config).toBeUndefined()
    expect(plan.problems.join(' ')).toMatch(/PASSKEY_RP_ID/)
    expect(plan.problems.join(' ')).toMatch(/AUTH_EMAIL_DOMAIN/)
  })

  it('recusa uma origem do passkey em formato errado', () => {
    const plan = planDeployEnv({
      ...goodEnv,
      PASSKEY_ANDROID_ORIGINS: 'https://uni-books.app',
    })

    expect(plan.config).toBeUndefined()
    expect(plan.problems.join(' ')).toMatch(/PASSKEY_ANDROID_ORIGINS/)
  })
})

describe('arquivo de variáveis (envVarsYaml)', () => {
  it('escreve cada valor entre aspas, preservando vírgulas, dois-pontos e aspas', () => {
    const yaml = envVarsYaml({
      A: 'x,y:z',
      B: 'Unifor "Biblioteca" <a@b.c>',
    })

    expect(yaml).toBe('A: "x,y:z"\nB: "Unifor \\"Biblioteca\\" <a@b.c>"\n')
  })
})

describe('comandos do gcloud', () => {
  const image = imageName('estoque-pay', 'abc1234')

  it('imageName aponta para o repositório da região, com o commit como tag', () => {
    expect(image).toBe(
      'southamerica-east1-docker.pkg.dev/estoque-pay/unibooks/api:abc1234',
    )
  })

  it('buildArgs manda o Cloud Build montar a imagem da pasta atual', () => {
    expect(buildArgs('estoque-pay', image)).toEqual([
      'builds',
      'submit',
      '--project',
      'estoque-pay',
      '--tag',
      image,
      '.',
    ])
  })

  it('deployArgs usa a conta de serviço, 0 a 2 instâncias e acesso público', () => {
    const args = deployArgs('estoque-pay', image, '.env.cloudrun.yaml')
    const valueOf = (flag: string) => args[args.indexOf(flag) + 1]

    expect(args.slice(0, 3)).toEqual(['run', 'deploy', 'unibooks-api'])
    expect(valueOf('--region')).toBe('southamerica-east1')
    expect(valueOf('--image')).toBe(image)
    expect(valueOf('--service-account')).toBe(
      'unibooks-api@estoque-pay.iam.gserviceaccount.com',
    )
    expect(valueOf('--min-instances')).toBe('0')
    expect(valueOf('--max-instances')).toBe('2')
    expect(valueOf('--env-vars-file')).toBe('.env.cloudrun.yaml')
    expect(args).toContain('--allow-unauthenticated')
  })

  it('deployArgs liga os três segredos do Secret Manager, sempre na versão mais recente', () => {
    const args = deployArgs('estoque-pay', image, '.env.cloudrun.yaml')
    const secrets = args[args.indexOf('--set-secrets') + 1]

    expect(secrets.split(',')).toEqual([
      'RESEND_API_KEY=resend-api-key:latest',
      'FERIADOS_API_KEY=feriados-api-key:latest',
      'GEMINI_API_KEY=gemini-api-key:latest',
    ])
    expect(Object.keys(SECRETS)).toHaveLength(3)
  })
})
