# Flash 本地商城设计

## 目标

增加一个 Flash 商城和本机 Flash 库。商城只提供游戏元数据和下载入口，SWF 文件始终由用户浏览器下载到自己的 IndexedDB。服务端不保存用户游戏，也不新增用户文件接口。

## 范围

- 新增“Flash 商城”导航页，保留现有“52java 商城”。
- 商城展示内置目录，并允许用户填写 SWF 直链或选择本地 `.swf` 文件；一次导入必须二选一。
- 下载或导入前校验 SWF 文件头和大小上限；失败时不写入半成品。
- 本机 Flash 游戏在 Flash 库中显示、搜索、启动和删除。
- Flash 播放器支持内置 `/flash/*.swf` 和 IndexedDB Blob 两种来源，并在退出时释放 object URL。
- J2ME、冒泡、52java 商城和现有 Flash 内置游戏流程保持不变。

## 数据模型与存储

新增 `apps/web/src/localFlash.js`，使用 IndexedDB 数据库 `flash-local` 的 `games` object store。记录结构为：

```text
{
  id: string,
  dedupeKey: string,
  source: "bundled" | "remote" | "file",
  name: string,
  description: string,
  sourceUrl: string,
  data: Blob,
  size: number,
  addedAt: number,
  updatedAt: number
}
```

`source` 是持久化的来源类型，便于页面显示和错误处理。`id` 是客户端生成的随机标识。`sourceUrl` 只用于显示来源和重新识别，不代表播放器必须访问远程文件。记录还保存 `dedupeKey`：远程资源使用规范化 URL，内置目录使用目录 id，本地文件使用内容 SHA-256。`games` object store 建立唯一 `dedupeKey` 索引，重复导入在同一 `readwrite` 事务中替换 Blob、名称、说明、来源和大小，保留 `id` 与 `addedAt`，更新 `updatedAt`，不产生重复卡片。删除只删除当前浏览器/WebView 的 IndexedDB 记录。

最大文件大小固定为 64 MiB。有效 SWF 文件前三个字节必须是 `FWS`、`CWS` 或 `ZWS`。远程直链只接受 `http:` 和 `https:`，使用 `credentials: "omit"`、手动跟随同一请求的有限重定向，并通过流式读取在累计超过上限时中止；没有可信 `Content-Length` 时仍按每个 chunk 累计。目标站点必须允许 CORS；失败时向用户显示可操作的网络、HTTP、格式或大小错误。

表单要求填写名称，并且 URL 与本地文件必须且只能提供一个。URL 模式要求 URL 合法且为 `http/https`；本地文件模式将 `sourceUrl` 置空。`description` 可选，URL 与本地文件同时存在或都为空时不写入。内置目录项不经过该表单规则：它们使用 `source: "bundled"`、目录 id 和 `/flash/<file>` 作为内部来源，加入时读取现有内置资源并以目录 id 去重。

## 页面和数据流

1. `Flash 商城`使用 `#/library/flash-store` 路由，显示内置目录和“添加 Flash”表单。该 tab id 进入 `TAB_IDS`，切换时写入 `xiaochao-tab`，刷新恢复；直接打开该 hash 时正常显示商城，若 hash 无效则回退到 `#/library/j2me`；浏览器返回从商城回到上一个 library 路由，和现有 52java 商城行为一致。
2. 用户点击目录项的“加入本机”或提交表单。
3. 客户端读取本地文件或通过 `fetch` 获取 Blob，执行大小和 SWF 头校验。
4. `LocalFlash.add` 将元数据和 Blob 通过单个 `readwrite` 事务原子写入 IndexedDB；页面刷新后通过 `LocalFlash.list` 恢复。数据库打开、升级、私有模式或配额错误转为明确的“本机存储不可用/空间不足”状态。列表遇到坏记录时跳过该记录并保留其他游戏，同时报告可恢复错误。
5. Flash 库合并内置游戏和本机记录。本机记录带 `local: true`，可从菜单启动或删除。
6. 本机游戏路由只传递本地 `id`。`FlashPlayer` 启动时按 `id`读取 Blob，创建 object URL，交给 Ruffle；清理时撤销 object URL。

## 错误处理

- IndexedDB 不可用时，Flash 商城和 Flash 库显示本机存储不可用状态，内置游戏仍可启动；桌面浏览器和 Android WebView 分别记录验证结果，无法连接真机时不宣称跨平台持久化已验证。
- 远程下载返回非成功状态、被 CORS 拦截、超过大小限制或不是 SWF 时，不写入记录，并显示失败原因。
- 本机记录损坏或被清理后，播放器显示“本机游戏不存在或已损坏”，并提供返回 Flash 库的路径，不影响其他游戏。
- 用户删除本机游戏前显示确认；删除后刷新 Flash 库，不清理内置资源。

## 验收标准

- Flash 商城能显示目录，能通过 `.swf` 文件或可访问的 SWF URL 加入本机；同时提供两者或都为空的校验提示。
- 加入成功后，Flash 库显示本机游戏；刷新页面后记录仍存在。
- 内置目录项加入后以目录 id 去重，刷新后仍显示一个本机记录。
- 本机游戏能启动、退出、再次启动；退出会调用 `URL.revokeObjectURL`，移除 `ruffle-player` 和加载节点。
- 删除本机游戏后记录和卡片消失，内置游戏仍可启动。
- 远程失败、非 `http/https`、CORS/HTTP 错误、格式错误、超大文件、配额不足均不产生半条记录；重复导入只保留一个记录。
- `pnpm --filter @xiaochao/web build`、现有 Flash 浏览器冒烟和本地 Flash 加入/重载/删除冒烟通过；冒烟脚本检查失效本地 id 返回库页，并拦截 `URL.revokeObjectURL` 验证清理。
- Android 资源准备和 APK 打包继续通过；服务器不产生用户游戏文件。

## 非目标

- 不实现服务器端上传、用户账号、云同步或服务器持久化目录。
- 不绕过目标站点的 CORS 限制，不代理远程 SWF。
- 不修改 J2ME、冒泡或 52java 商城的存储协议。
