declare module 'react-native-static-server' {
  type StaticServerOptions = { localOnly?: boolean; keepAlive?: boolean }
  export default class StaticServer {
    constructor(port?: number, root?: string, options?: StaticServerOptions)
    readonly origin?: string
    start(): Promise<string>
    stop(): Promise<void> | void
    kill(): Promise<void> | void
  }
}

