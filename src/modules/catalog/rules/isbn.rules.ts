// Só dígitos, com 10 ou 13 caracteres (ISBN-10 ou ISBN-13).
export const ISBN_FORMAT = /^(\d{10}|\d{13})$/

// Normaliza o ISBN digitado: tira hífens e espaços (RF-GAC-02). Não confere o
// formato; use ISBN_FORMAT depois.
export function normalizeIsbn(isbn: string): string {
  return isbn.replace(/[-\s]/g, '')
}
