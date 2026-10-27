import { describe, expect, it, vi } from 'vitest'
import { GeminiError, generateContent } from '../gemini/gemini.client.js'

const request = {
  systemInstruction: 'instrução',
  contents: [{ role: 'user' as const, parts: [{ text: 'Oi' }] }],
  tools: [],
}

const reply = (body: unknown, status = 200) =>
  vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  )

describe('generateContent: chamada ao Gemini (RF-ASS-07)', () => {
  it('manda a chave no cabeçalho, nunca na URL, e devolve as partes da resposta', async () => {
    const fetchFn = reply({
      candidates: [{ content: { parts: [{ text: 'Olá!' }] } }],
    })

    const content = await generateContent(request, {
      fetchFn,
      apiKey: 'chave-de-teste',
      model: 'modelo-teste',
    })

    expect(content).toEqual({ role: 'model', parts: [{ text: 'Olá!' }] })
    const [url, init] = fetchFn.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toContain('/models/modelo-teste:generateContent')
    expect(url).not.toContain('chave-de-teste')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(
      'chave-de-teste',
    )
  })

  it('sem a chave, falha sem chamar a rede', async () => {
    const fetchFn = vi.fn()

    await expect(
      generateContent(request, { fetchFn, apiKey: '' }),
    ).rejects.toBeInstanceOf(GeminiError)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('falha com erro HTTP, rede fora e resposta vazia', async () => {
    await expect(
      generateContent(request, { fetchFn: reply({}, 429), apiKey: 'k' }),
    ).rejects.toThrow('429')
    await expect(
      generateContent(request, {
        fetchFn: vi.fn(async () => {
          throw new Error('offline')
        }),
        apiKey: 'k',
      }),
    ).rejects.toBeInstanceOf(GeminiError)
    await expect(
      generateContent(request, {
        fetchFn: reply({ candidates: [] }),
        apiKey: 'k',
      }),
    ).rejects.toBeInstanceOf(GeminiError)
  })
})
