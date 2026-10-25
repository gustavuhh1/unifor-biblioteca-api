import { describe, expect, it } from 'vitest'
import {
  emailMessageOf,
  escapeHtml,
  pushMessageOf,
} from '../rules/notice-message.rules.js'
import { EMAIL, TOKEN, makeNotice } from './notifications.fixtures.js'

describe('mensagem de push (pushMessageOf, RF-AVI-02)', () => {
  it('leva o título, o texto e os ids para o app abrir a tela certa', () => {
    const message = pushMessageOf(makeNotice({ id: 'n9' }), TOKEN)

    expect(message).toEqual({
      to: TOKEN,
      title: 'É a sua vez: Código Limpo',
      body: 'Confirme até amanhã, 09:12, que vai retirar.',
      data: {
        notificationId: 'n9',
        type: 'queue_turn',
        action: 'confirm_turn',
        bookId: 'book1',
        queueEntryId: 'qe1',
      },
    })
  })

  it('só leva os ids que o aviso tem', () => {
    const message = pushMessageOf(
      makeNotice({ bookId: undefined, queueEntryId: undefined, fineId: 'f1' }),
      TOKEN,
    )

    expect(Object.keys(message.data).sort()).toEqual(
      ['action', 'fineId', 'notificationId', 'type'].sort(),
    )
  })
})

describe('e-mail do aviso (emailMessageOf, RF-AVI-02)', () => {
  it('usa o título como assunto e o texto no corpo, com a dica de onde desligar', () => {
    const email = emailMessageOf(makeNotice(), EMAIL)

    expect(email.to).toBe(EMAIL)
    expect(email.subject).toBe('É a sua vez: Código Limpo')
    expect(email.text).toContain('Confirme até amanhã, 09:12')
    expect(email.text).toContain('Avisos e lembretes')
    expect(email.html).toContain('<strong>É a sua vez: Código Limpo</strong>')
  })

  it('escapa a marcação HTML que vier no título do livro', () => {
    const email = emailMessageOf(
      makeNotice({ title: 'É a sua vez: <b>Tom & "Jerry"</b>' }),
      EMAIL,
    )

    expect(email.html).toContain(
      '&lt;b&gt;Tom &amp; &quot;Jerry&quot;&lt;/b&gt;',
    )
    expect(email.html).not.toContain('<b>')
    expect(email.subject).toContain('<b>')
  })
})

describe('escapeHtml', () => {
  it('troca & < > e aspas', () => {
    expect(escapeHtml('a & b < c > "d"')).toBe(
      'a &amp; b &lt; c &gt; &quot;d&quot;',
    )
  })
})
