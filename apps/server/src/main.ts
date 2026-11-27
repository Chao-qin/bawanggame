import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { networkInterfaces } from 'node:os'
import { AppModule } from './app.module.js'

const PORT = Number(process.env.PORT ?? 8080)

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false })
  await app.listen(PORT, '0.0.0.0')

  const lanAddress = Object.values(networkInterfaces())
    .flat()
    .find((item) => item && item.family === 'IPv4' && !item.internal)?.address
  console.log(`http://localhost:${PORT}`)
  if (lanAddress) console.log(`http://${lanAddress}:${PORT}`)
}

void bootstrap()
