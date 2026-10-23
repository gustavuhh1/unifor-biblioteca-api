// Põe o texto em minúsculas, sem acento e com os espaços normalizados (sem
// espaço nas pontas e um só entre as palavras): é o formato dos campos
// `*Normalized` e do texto que a API busca (docs/modelo-de-dados-firestore.md,
// seção 4.2).
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// Iniciais do aluno: primeira letra do primeiro e do último nome, em maiúscula
// ("Lucas Almeida" vira "LA").
export function initialsOf(fullName: string): string {
  const words = fullName.trim().split(/\s+/)
  const first = Array.from(words[0] ?? '')[0] ?? ''
  const last =
    words.length > 1 ? (Array.from(words[words.length - 1]!)[0] ?? '') : ''
  return (first + last).toLocaleUpperCase('pt-BR')
}
