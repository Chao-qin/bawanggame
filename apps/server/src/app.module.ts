import { All, Controller, Inject, Injectable, Module, Req, Res } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { handleHttp } from './index.js'
import { createWebSocketRuntime } from './websocket-runtime.js'
import { ReportingModule } from './reporting.module.js'

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
  private readonly runtime = createWebSocketRuntime()
  private readonly upgrade = this.runtime.handleUpgrade

  constructor(@Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost) {}

  onModuleInit() {
    const server = this.adapterHost.httpAdapter.getHttpServer() as Server
    this.server = server
    server.on('upgrade', this.upgrade)
  }

  onModuleDestroy() {
    this.server?.off('upgrade', this.upgrade)
    return this.runtime.close()
  }
}

@Module({ controllers: [HttpController], providers: [WebSocketLifecycle] })
class RuntimeModule {}

@Module({ imports: [ReportingModule, RuntimeModule] })
export class AppModule {}
