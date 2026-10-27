import { Router } from 'express'
import { session } from '../../middlewares/session.js'
import * as controller from './library.controller.js'

// Só o caminho e os middlewares de cada rota; a lógica fica no controller.

// Router do módulo da biblioteca.
export const libraryRouter = Router()

// Regras da biblioteca (RF-PER-02): qualquer perfil logado.
libraryRouter.get('/library/info', ...session, controller.info)
