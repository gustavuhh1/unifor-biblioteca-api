// Lower case, no accents: the format of the `*Normalized` fields and of the
// text the API searches (docs/modelo-de-dados-firestore.md, 4.2).
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

// First letter of the first and of the last name, upper case ("LA").
export function initialsOf(fullName: string): string {
  const words = fullName.trim().split(/\s+/)
  const first = Array.from(words[0] ?? '')[0] ?? ''
  const last =
    words.length > 1 ? (Array.from(words[words.length - 1]!)[0] ?? '') : ''
  return (first + last).toLocaleUpperCase('pt-BR')
}
