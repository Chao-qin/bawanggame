# Nest 业务模块拆分

- 目标：修正仅用 Nest 包装旧 HTTP 分发器的结构，继续在 PR #78 交付真正的业务模块。
- 范围：后端入口、六个业务模块、必要的共享解析器消费者与文档。
- 不可破坏：路由、查询、响应、CORS、缓存/压缩、下载限制、资源路径、WebSocket 协议和日志重试语义。
- 验收：AppModule 仅组装；不再存在中央 handleHttp 或业务分发 index.ts；各域有 controller/service/module，实时连接按 provider 生命周期持有；现有与新增路由回归、类型、构建、启动和独立审查通过。

| 模块 | 职责 |
|---|---|
| JavaModule | 52emu 目录、下载代理和纯解析器 |
| FlashModule | Flash 目录、详情、下载和纯解析器 |
| JarsModule | 本地 JAR 清单、manifest 与图标读取 |
| AssetsModule | 静态/runtime 路径、gzip、ETag、immutable；最后注册兜底路由 |
| RealtimeModule | WebSocket 升级、Bluetooth/TCP 与关闭清理 |
| ReportingModule | 接收控制器、日志服务、异常过滤器、文件队列和飞书适配 |

common 只保留多域复用的响应处理和项目资源路径，不引入 Repository、事件总线或通用基类。移动端消费的 Java/Flash 解析器仍保持纯函数、无 Nest 依赖；路径引用随移动同步。

现有依赖足够，日志继续使用当前 LoggerService 实现，不改日志库、不修改锁文件。根目录新增 `.env.example` 作为配置模板（不含密钥，`.env` 仍被 Git 忽略）；环境文件由 Compose 自动读取，直接运行 Node 时用 `--env-file` 显式加载。

路由按 `AppModule` 的 imports 顺序注册，`AssetsModule` 持有兜底路由，必须排在最后；`test/routes.test.ts` 守护这一顺序。
