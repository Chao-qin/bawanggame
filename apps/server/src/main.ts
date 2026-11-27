import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { Logger } from '@nestjs/common'
import { networkInterfaces } from 'node:os'
import { AppModule } from './app.module.js'

const PORT = Number(process.env.PORT ?? 8080)
const logger = new Logger('Bootstrap')

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false })
  app.enableShutdownHooks()
  await app.listen(PORT, '0.0.0.0')

  const lanAddress = Object.values(networkInterfaces())
    .flat()
    .find((item) => item && item.family === 'IPv4' && !item.internal)?.address
  logger.log(`http://localhost:${PORT}`)
  if (lanAddress) logger.log(`http://${lanAddress}:${PORT}`)
}

void bootstrap().catch(error => {
  logger.error('Server startup failed', error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
})
