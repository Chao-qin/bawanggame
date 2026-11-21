# Flash 保存计划接入设计

## 目标

在现有 Flash 商城中接入 flash.homes 的公开作品搜索、详情和原始 SWF 下载。下载结果继续通过现有 `addFromUrl` 写入浏览器本机 Flash 库，并使用现有 Ruffle 播放器。

## 接口契约

- `GET /__flash/catalog?query=` 由 Node 服务请求 `https://flash.homes/flash?q=`，解析作品编号和标题。
- `GET /__flash/detail/:code` 请求作品详情页，解析标题、文件大小和 SHA-256。
- `GET /__flash/download/:code` 请求详情后按 SHA-256 从 `https://swf.flash.homes/{sha256}.swf` 流式代理原始 SWF。
- 下载设置大小上限 `FLASH_MAX_BYTES`，默认 128 MiB。

## 兼容性

现有内置 Flash 游戏、本地文件导入、直链导入、本机 IndexedDB 去重、Ruffle 播放和移动端 Web 打包入口保持不变。移动端若没有网络，Flash 保存计划搜索显示错误，内置目录仍可使用。

## 验收

搜索“造梦西游”返回《造梦西游2升级版》。详情包含 SHA-256 和文件大小。下载响应是 SWF 文件，摘要匹配详情。前端搜索结果可加入本机，重复加入使用既有提示。构建、服务器测试、类型检查和移动端资源校验通过。
