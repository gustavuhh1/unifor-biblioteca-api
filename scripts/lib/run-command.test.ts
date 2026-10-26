import { describe, expect, it } from 'vitest'
import { quoteForShell } from './run-command.js'

describe('argumentos do gcloud no shell do Windows (quoteForShell)', () => {
  it('argumento com espaço vai entre aspas, para não virar vários argumentos', () => {
    expect(
      quoteForShell('--display-name=Unifor Biblioteca - Cloud Scheduler'),
    ).toBe('"--display-name=Unifor Biblioteca - Cloud Scheduler"')
  })

  it('o cron com asteriscos e espaços vai entre aspas, para o shell não ler curingas', () => {
    expect(quoteForShell('--schedule=*/5 * * * *')).toBe(
      '"--schedule=*/5 * * * *"',
    )
  })

  it('texto com parênteses ou símbolos do shell também', () => {
    expect(quoteForShell('--description=Expira (RF-EMP-06)')).toBe(
      '"--description=Expira (RF-EMP-06)"',
    )
    expect(quoteForShell('a&b')).toBe('"a&b"')
  })

  it('argumento simples fica como está', () => {
    for (const arg of [
      'scheduler',
      '--location=southamerica-east1',
      '--uri=https://api.uni-books.app/jobs/accrue_fines',
      '--attempt-deadline=60s',
    ]) {
      expect(quoteForShell(arg)).toBe(arg)
    }
  })

  it('aspas dentro do argumento são escapadas', () => {
    expect(quoteForShell('diz "oi" aqui')).toBe('"diz \\"oi\\" aqui"')
  })
})
