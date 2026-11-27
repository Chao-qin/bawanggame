# 发版、版本检测与公告

## 发版流程

1. 在 `main` 上把根目录 `package.json` 的 `version` 改成新版本（例如 `1.1.0`）并合并。
2. 在该提交上打 tag `v1.1.0` 并推送。tag 与 `package.json` 版本不一致时，`Android release` workflow 会直接失败。
3. workflow 构建签名 APK，并发布 GitHub Release，附件如下：

| 文件 | 用途 |
|---|---|
| `xiaochao-bawang-v1.1.0.apk` | 带版本号的安装包 |
| `xiaochao-bawang.apk` | 同一安装包的固定文件名副本；App 内的下载链接 `releases/latest/download/xiaochao-bawang.apk` 指向它 |
| `xiaochao-bawang-site-v1.1.0.tar.gz` | 与 APK 同一次构建的 Web 静态站包（`pnpm pack` 的 `site-deploy/`） |
| `SHA256SUMS` | 以上文件的校验值 |

PR 和 `main` 的推送由 `CI` workflow 检查：Web 构建、服务端与 Web 测试、服务端类型检查与构建、移动端类型检查与测试。

## 仓库需要的配置

| 类型 | 名称 | 说明 |
|---|---|---|
| Secret | `ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD` | 发版签名；缺任何一项发版都会失败 |
| Variable | `ANALYTICS_URL` | APK 和同次构建的静态站包的上报地址，填完整 HTTPS 接口地址（例如 `https://<域名>/collect`）；不填时默认 `https://frp-net.com:59352/collect`，填 `off` 关闭上报 |

服务端运行时的环境变量（飞书、日志目录等）见 `.env.example` 和 `docs/reporting.md`，与打包无关。

未设置 `ANALYTICS_URL` 时，每次发版的 APK 与静态站包都向生产地址上报，测试用的发版也会写入生产表格；测试 tag 应先把变量设为测试环境地址或 `off`。客户端会发送不在游戏中的心跳，旧版服务端会拒收这类批次，所以**先部署服务端，再发布客户端**。

## 版本检测与公告

App 和网页只从 GitHub 主分支读取两个文件，不请求本项目的服务器：先请求 `raw.githubusercontent.com`，失败时改用 jsDelivr 镜像。启动时检查一次，之后每 6 小时最多一次；上次结果保存在本地，6 小时内重开应用不会重复请求。

- **版本号**：根目录 `package.json` 的 `version`。安装包内页面的版本号在构建时写入，主分支更新时只在 App 里提示「发现新版本」，并附安装包下载链接（由系统浏览器打开）。浏览器访问的网页由服务器部署决定版本，不提示更新。
- **公告**：根目录 `announcements.json`，格式为数组，最多显示前 3 条有效公告，用户关闭后不再显示：

```json
[
  { "id": "2026-12-01-maintenance", "title": "服务维护", "body": "12 月 1 日 22:00–23:00 在线商城暂停", "url": "https://example.com", "start": "2026-11-30", "end": "2026-12-01T23:00:00+08:00" }
]
```

`id` 和 `title` 必填，`id` 要唯一；`body`、`url`（仅 https）、`start`、`end` 可选。

两个文件都没取到时保留上次的结果，到下一个检查周期再试；只取到一个时，另一个沿用上次的结果。

注意：修改主分支版本号到 Release 发布完成之间，下载链接仍指向上一个版本；jsDelivr 对 `@main` 有缓存，镜像上的更新可能延迟。国内访问 GitHub 和 jsDelivr 都不稳定（每个地址 8 秒超时），检查失败时静默跳过，不影响使用。版本号按纯数字比较，不支持 `1.0.0-rc.1` 这类预发布后缀。

## 系统 WebView 内核

App 使用系统 WebView。页面的现代包按 ES2020 输出（至少需要 Chrome 80），polyfill 只覆盖最近两版浏览器，较旧内核可能缺少页面用到的 API，因此取 Chrome 87 作为保守门槛：内核低于 87 时，App 顶部提示用户去应用市场更新「Android System WebView」。用户点「知道了」后，本次运行内不再提示。
