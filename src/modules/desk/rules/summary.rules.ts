import {
  atLocalTime,
  localDate,
  plusDays,
} from '../../../shared/calendar/dates.js'

// Os números do dia no Painel do balcão (RF-BAL-01). Funções puras.

// O dia de `at` em Fortaleza: da meia-noite (inclusive) até a meia-noite seguinte
// (exclusive). "Devoluções hoje" conta as devoluções dentro desse intervalo.
export function dayRangeOf(at: Date): { from: Date; to: Date } {
  const today = localDate(at)
  return {
    from: atLocalTime(today, '00:00'),
    to: atLocalTime(plusDays(today, 1), '00:00'),
  }
}
