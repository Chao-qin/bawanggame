# 模拟器运行时稳定性与移动验收设计

## 目标行为

把模拟器从“能启动”提升到“启动、失败、退出、重复进入都可解释且可验证”：

1. J2ME/MRP 在脚本或样式加载期间显示稳定的启动状态；加载失败显示可操作的重试入口。
2. 组件卸载或用户返回后，异步加载链不再继续挂载旧页面节点；J2ME 和 MRP 的生命周期处理一致。
3. 横屏保持导航键组左、数字键组右，并在常见手机/桌面尺寸中不与画面重叠。
4. 自动化冒烟脚本使用显式路由和可配置端口，能区分真实 J2ME、MRP、本地复活游戏和缺少资源的跳过场景。
5. 工具栏按钮有稳定触摸尺寸、图标语义、`aria-label`、`title` 和安全区适配。

## 修改范围

- `apps/web/src/runtime/loadScript.js`：增加按 session 归属的加载状态、20 秒超时、失败/退出清理和 session 保护接口。
- `apps/web/src/runtime/J2MEPlayer.jsx`、`MrpPlayer.jsx`、`cleanup.js`：统一 loading/error/retry 状态，并在每个异步边界检查组件是否仍然存活。
- `apps/web/src/App.jsx`、`apps/web/uno.config.js`、`runtime/j2me/style/main.css`、`PhoneMarkup.jsx`：改善启动遮罩、工具栏图标按钮、横屏几何和无障碍属性。
- `apps/web/verify.mjs`：增加 `VERIFY_BASE_URL`、显式游戏路由、横屏 rect 断言、重复进入和控制台错误收集。
- `docs/superpowers/`：记录实施计划、验证命令和真实设备限制。构建产物、APK、profile 和截图不提交。

## 不可破坏的现有行为

- J2ME/MRP 的键盘映射、触摸长按、文本编辑桥接、全屏 API 和退出确认行为保持不变。
- `touchLayout.sides` 的 `standard/swapped` 持久化语义保持不变，默认横屏仍是导航键左。
- React Native WebView bridge、返回键协议、本地静态资源 URL 和现有路由格式保持不变。
- MRP 的 `#mrp-dialog-text` 仍可见、可聚焦和可输入。
- 退出游戏继续回到大厅并刷新隔离 runtime 全局状态。

## 验收标准

1. 首次进入 J2ME/MRP 时，启动状态可见；加载失败时有明确错误和重试动作。
2. 在加载脚本期间退出，未执行或未完成的资源节点由 session 清理；已执行脚本不得触发旧 session 的成功回调、挂载 React overlay 或恢复旧设置，显式退出的整页 reload 继续作为进程级 VM 隔离边界。
3. `apps/web/verify.mjs` 不再依赖第一个卡片顺序；无 J2ME fixture 时明确报告 skip，有 fixture 时验证启动、退出、重复进入和横屏 rect。
4. `844x390`、`1280x720` 和 `390x844` 的布局断言无控制组重叠；横屏导航键组位于数字键组左侧。
5. `pnpm --filter @xiaochao/web build`、`pnpm --filter @xiaochao/mobile typecheck`、`pnpm --filter @xiaochao/mobile verify-web-assets` 通过。
6. R1/R2 diff review、feature audit 和适用的浏览器 validation 完成；未具备真实 Android/iOS 设备时，报告中明确列出未验证场景。

## 验证边界

桌面 Chromium 可以验证 DOM、CSS、路由和加载状态，不能替代 Android/iOS WebView 的输入法、系统返回键、真实旋转和安全区合成。真机缺失时将这些记录为残余风险。
