import type { OpeningHours } from './types/index.js'

// Textos padrão do acervo da biblioteca. O cadastro de livros e o seed usam os
// mesmos valores.

// Local do acervo e do atendimento (books.location e settings.contact.place).
export const LIBRARY_PLACE = 'Biblioteca (Praça Central)'

// Idioma de um livro novo (books.language).
export const DEFAULT_BOOK_LANGUAGE = 'Português'

// Tipo de material de um livro novo (books.materialType).
export const DEFAULT_MATERIAL_TYPE = 'Livro'

// Formato de um exemplar novo (copies.format).
export const DEFAULT_COPY_FORMAT = 'Impresso'

// Horário de funcionamento da biblioteca (settings.openingHours, seção 2.21), usado
// quando esse campo não existe e pelo seed. null = fechado.
export const DEFAULT_OPENING_HOURS: OpeningHours = {
  mon: { open: '07:00', close: '21:55' },
  tue: { open: '07:00', close: '21:55' },
  wed: { open: '07:00', close: '21:55' },
  thu: { open: '07:00', close: '21:55' },
  fri: { open: '07:00', close: '21:55' },
  sat: { open: '08:00', close: '14:10' },
  sun: null,
}

// Números das regras de empréstimo (settings/library, seção 2.21), usados quando o
// documento ou o campo não existe.
export const DEFAULT_LOAN_RULES = {
  // Dias corridos do empréstimo (RF-EMP-11).
  loanDays: 14,
  // Dias corridos de uma renovação (RF-EMP-09).
  renewalDays: 14,
  // Quantas renovações cada empréstimo tem.
  maxRenewals: 1,
  // Dias úteis para retirar o pedido (RF-EMP-01).
  pickupBusinessDays: 2,
  // "Vence em breve": faltam até este número de dias.
  dueSoonDays: 2,
}
