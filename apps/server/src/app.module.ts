import { All, Controller, Inject, Injectable, Module, Req, Res } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { handleHttp, handleUpgrade } from './index.js'

@Controller()
class HttpController {
  @All('*')
  async dispatch(@Req() req: IncomingMessage, @Res() res: ServerResponse) {
    await handleHttp(req, res)
  }
}

@Injectable()
class WebSocketLifecycle implements OnModuleInit, OnModuleDestroy {
  private server?: Server
  private readonly upgrade = (req: IncomingMessage, socket: import('node:stream').Duplex, head: Buffer) => handleUpgrade(req, socket, head)

  constructor(@Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost) {}

  onModuleInit() {
    const server = this.adapterHost.httpAdapter.getHttpServer() as Server
    this.server = server
    server.on('upgrade', this.upgrade)
  }

  onModuleDestroy() {
    this.server?.off('upgrade', this.upgrade)
  }
}

@Module({ controllers: [HttpController], providers: [WebSocketLifecycle] })
export class AppModule {}
