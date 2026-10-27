import { Router } from 'express'
import { anySession } from '../../middlewares/session.js'
import * as controller from './library.controller.js'

// Informações da biblioteca para qualquer usuário logado (RF-PER-02).
export const libraryRouter = Router()
libraryRouter.get('/library/info', ...anySession, controller.info)
