// Sobe o servidor HTTP na porta do Cloud Run (PORT, padrão 8080).
import { app } from './app.js'
import { env } from './config/env.js'

const server = app.listen(env.PORT, () => {
  console.log(`API listening on port ${env.PORT}`)
})

// O Cloud Run manda SIGTERM antes de parar uma instância: termina as
// requisições abertas primeiro.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
  })
}
