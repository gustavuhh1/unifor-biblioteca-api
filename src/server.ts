import { app } from './app.js'
import { env } from './config/env.js'

const server = app.listen(env.PORT, () => {
  console.log(`API listening on port ${env.PORT}`)
})

// Cloud Run sends SIGTERM before stopping an instance: finish open requests first.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
  })
}
