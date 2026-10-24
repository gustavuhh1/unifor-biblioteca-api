import { z } from 'zod'

// Matrícula de 7 dígitos (RF-AUT-01); os dois primeiros são o ano de ingresso.
// Usada pelo cadastro e pela ficha do balcão.
export const MATRICULA = /^\d{7}$/

// Matrícula de 7 dígitos nos corpos e parâmetros das rotas.
export const matriculaSchema = z
  .string('Informe a matrícula.')
  .trim()
  .regex(MATRICULA, 'A matrícula deve ter exatamente 7 dígitos.')
  .meta({ example: '2412858' })
