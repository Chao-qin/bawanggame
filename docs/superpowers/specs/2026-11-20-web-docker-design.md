# Web Docker 部署设计

## 目标与范围

从干净检出运行 `docker compose up --build`，让 React 游戏大厅、Flash 资源、J2ME 运行时和 Node API 由同一个 Web 容器提供。默认监听宿主机回环地址。服务器 JAR 目录可在宿主机维护。MRP 运行时及游戏通过可选的只读挂载提供。

改动集中在 Docker 配置、启动脚本和部署说明。Web 容器在构建时使用锁文件安装依赖并编译前后端，再将运行需要的文件复制到最终镜像。J2ME 路由和 52java API 继续使用现有 Node 服务器。Render 仍使用根目录 Dockerfile，其运行时可设置 `PORT`。

## 兼容性

移动端继续运行 `pnpm mobile:prepare-web`，由 `pack-site.sh` 生成本地站点并装入 App。保留移动端脚本、资源路径及锁文件。浏览器本机安装的游戏和存档继续按站点来源存储。

## 验收

实际构建并启动 Compose，确认镜像健康、主要资源可读、JAR 挂载即时生效，运行浏览器 Flash 冒烟并校验 52java 的接口及 CORS。挂载现有 MRP 资源后检查目录、WASM 与游戏文件。沿用原命令打包并校验 App Web 资源，构建及安装 Android APK，单独记录 iOS 和真机验证范围。
