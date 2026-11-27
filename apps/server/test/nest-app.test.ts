import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { afterEach, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'

describe('Nest server adapter', () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined

  afterEach(async () => {
    await app?.close()
    app = undefined
  })

  it('serves existing API and static asset routes', async () => {
    app = await NestFactory.create(AppModule, { logger: false, bodyParser: false })
    await app.listen(0, '127.0.0.1')
    const address = app.getHttpServer().address()
    if (!address || typeof address === 'string') throw new Error('expected an ephemeral TCP listener')
    const base = `http://127.0.0.1:${address.port}`

    const api = await fetch(`${base}/__52java/open`)
    expect(api.status).toBe(200)
    expect(await api.json()).toEqual({ url: 'https://java.52emu.cn' })

    const asset = await fetch(`${base}/runtime/j2me/compat.html`)
    expect(asset.status).toBe(200)
    expect(asset.headers.get('content-type')).toContain('text/html')
  })
})
