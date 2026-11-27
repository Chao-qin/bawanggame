import { Inject, Injectable, Module } from '@nestjs/common'
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import type { Server } from 'node:http'
import { createWebSocketRuntime } from './websocket-runtime.js'

// Each application owns its Bluetooth rooms and proxy sockets; they are closed with the application.
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

@Module({ providers: [WebSocketLifecycle] })
export class RealtimeModule {}
