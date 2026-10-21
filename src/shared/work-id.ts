import { normalizeText } from './text.js'

// Texto em "slug": minúsculas, sem acento, só letras e números separados por
// hífen ("Cálculo, Vol. 1" vira "calculo-vol-1").
function slugOf(text: string): string {
  return normalizeText(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Sobrenome de um autor: a última palavra do nome ("Robert C. Martin" vira
// "Martin"). No formato "Sobrenome, Nome" vale o que vem antes da vírgula.
function surnameOf(author: string): string {
  const [beforeComma = ''] = author.split(',')
  const words = (author.includes(',') ? beforeComma : author)
    .trim()
    .split(/\s+/)
  return words[words.length - 1] ?? ''
}

// ID da obra (works/{workId}, seção 2.6): o slug do título, "--" e o sobrenome do
// primeiro autor (ex.: "codigo-limpo--martin"). Sem autor, só o slug do título.
// Usado ao cadastrar uma edição para achar a obra que ela já tem ou criar uma.
export function workIdOf(title: string, authors: readonly string[]): string {
  const slug = slugOf(title)
  const surname = slugOf(surnameOf(authors[0] ?? ''))
  return surname ? `${slug}--${surname}` : slug
}
