import type { RequestHandler } from 'express'
import {
  runWithDeliveryBatch,
  type PendingNotice,
} from '../modules/notifications/delivery-batch.js'
import { deliverNotices } from '../modules/notifications/services/notice-delivery.service.js'

// Entrega por push e por e-mail os avisos que a requisição gravou (RF-AVI-02).
// O Cloud Run só dá CPU ao container enquanto há uma requisição em andamento, então
// o envio não pode ficar para depois da resposta: o Express não tem um "antes de
// responder", por isso este middleware segura o `res.end` até a entrega terminar.
// Requisição que não gravou aviso responde na hora, sem esperar nada.
export const deliverNoticesBeforeResponse: RequestHandler = (
  _req,
  res,
  next,
) => {
  const batch: PendingNotice[] = []
  const end = res.end.bind(res) as (...args: unknown[]) => typeof res

  res.end = ((...args: unknown[]) => {
    if (batch.length === 0) return end(...args)
    void deliverNotices(batch.splice(0)).then(() => end(...args))
    return res
  }) as typeof res.end

  runWithDeliveryBatch(batch, next)
}
