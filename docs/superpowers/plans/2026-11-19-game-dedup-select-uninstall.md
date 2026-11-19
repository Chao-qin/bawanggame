# 游戏去重与批量卸载实施计划

**目标**　五个安装入口提示重复。游戏库可选择多个本机游戏并确认卸载。

**范围**　Web 游戏库、Flash 本机库、J2ME IndexedDB 和桌面 Chrome 冒烟脚本。共享脚本随移动端 Web 资源打包。

**兼容性**　保留旧 IndexedDB 记录、单个启动与卸载、服务端列表与搜索。JAR 同名文件继续使用现有主键，重复写入会提示。

## 第一阶段　本机存储

- [x] 在 `apps/web/src/localFlash.js` 中检查目录和 URL 的来源标识。文件入口检查哈希。写入事务再次检查并拒绝重复。
- [x] 在 `runtime/j2me/config/localjars.js` 中升级数据库并保留原对象仓库。用来源 ID、哈希、文件名依次查重，在同一事务插入新记录。

## 第二阶段　游戏库和商城

- [x] 在 `apps/web/src/App.jsx` 中接入重复提示、JAR 导入汇总和 52java 持久化按钮状态。
- [x] 本机游戏菜单进入多选。游戏库确认后逐项卸载、汇总结果并刷新列表。沿用原单个卸载和存档清理逻辑。
- [x] 在 `apps/web/src/mobile-ui.css` 中添加选中状态和底部操作条，兼顾移动端导航位置。

## 第三阶段　验收与审查

- [x] 扩展 `apps/web/verify-local-flash.mjs`，检查五个入口、实际下载请求计数、刷新持久、旧 JAR 升级和批量卸载。
- [x] 运行 `pnpm build`、`pnpm test`、`pnpm typecheck`、Chrome CDP 冒烟和 `git diff --check`。记录外部服务与移动端验证范围。
- [ ] 完成仓库规定的冷启动 diff review、feature audit 和 validation review。OpenCode 免费额度返回 HTTP 429。
- [x] 在现有任务分支提交实现和验证，准备草稿 PR。
