// Limpeza dos textos que vêm das fontes externas (RF-ACE-04). Funções puras, as
// mesmas para a Open Library e a BrasilAPI.

// Entidades HTML que podem aparecer nas sinopses.
const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
}

// Tira as tags HTML da sinopse (RF-ACE-04). Quebra de linha e fim de parágrafo
// viram quebra de linha; as outras tags somem. Devolve texto simples.
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(
      /&(?:amp|lt|gt|quot|#39|apos|nbsp);/g,
      (entity) => HTML_ENTITIES[entity]!,
    )
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Texto sem espaços nas pontas; texto vazio ou ausente vira undefined.
export function cleanText(text: string | null | undefined): string | undefined {
  return text?.trim() || undefined
}

// Lista sem itens vazios nem repetidos e com no máximo `limit` itens; lista vazia
// ou ausente vira undefined.
export function cleanList(
  list: readonly string[] | null | undefined,
  limit = Infinity,
): string[] | undefined {
  const items = [
    ...new Set((list ?? []).map((item) => item.trim()).filter(Boolean)),
  ].slice(0, limit)
  return items.length > 0 ? items : undefined
}

// Primeiro ano de quatro dígitos de uma data em texto livre ("2009", "July 2008",
// "Oct 15, 2013"). Aceita também o número que a BrasilAPI manda. Sem ano, undefined.
export function yearOf(
  date: string | number | null | undefined,
): number | undefined {
  const digits = /\b\d{4}\b/.exec(String(date ?? ''))?.[0]
  return digits ? Number(digits) : undefined
}

// Endereço da capa, sempre em https (algumas fontes mandam http). Vazio vira
// undefined.
export function secureUrl(url: string | null | undefined): string | undefined {
  const clean = cleanText(url)
  return clean?.replace(/^http:\/\//i, 'https://')
}

// Tira do objeto os campos sem valor: campo ausente não pode virar valor vazio
// nem apagar o que já está salvo.
export function omitUndefined<T extends object>(data: T): T {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  ) as T
}
