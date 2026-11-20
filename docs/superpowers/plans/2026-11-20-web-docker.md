# Web Docker 实施计划

**目标**　构建可独立运行的 Web 镜像，保留 App 本地资源打包链。

## 镜像与 Compose

- [x] 在 `Dockerfile` 编译 Web 和服务器，部署生产依赖及运行时资源。
- [x] 在 `start.sh` 支持从容器命令启动编译后的服务器，保留不传参数时的启动方式。
- [x] 在 `.dockerignore` 排除本地依赖、App 构建产物、凭据及私有游戏文件。
- [x] 在 `compose.yaml` 配置默认端口和只读 JAR 挂载。通过 `compose.mrp.yaml` 接入 MRP 资源。
- [x] 在 `README.md` 和 `README.ru.md` 更新 Docker 入口。

## 验证

- [x] 运行 `docker compose up --build --wait`，验证健康检查、HTTP、WebSocket 和浏览器游戏入口。
- [x] 使用只读 MRP 挂载和本地 JAR 检查容器能提供这些资源。
- [x] 运行 `pnpm test`、`pnpm typecheck`、`pnpm mobile:prepare-web` 和 `pnpm mobile:verify-web`。构建 Android APK 并验证安装和启动。
- [x] 创建 PR #45。完成首轮独立审查并修复容器 coturn 的运行目录。
- [ ] 完成修复后的独立复审。
