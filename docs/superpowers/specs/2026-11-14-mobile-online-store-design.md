# 移动端在线商城设计

## 背景

RN WebView 从 APK 内置静态资源加载模拟器页面。内置游戏不需要网络，但 52java 商城目录和 JAR 下载由桌面 Node 服务代理；此前 RN 页面把商城直接标记为离线，因此即使 Android 有网络权限也不会发起请求。

## 设计

桌面 Web 保持相对路径 `/__52java/*`。移动端构建通过 `MOBILE_52JAVA_API_BASE` 注入远端 Node 服务地址，WebView 页面只把商城请求改为该绝对地址，首页和模拟器资源仍从 APK 本地静态服务加载。Node 代理为商城 JSON、下载响应和 OPTIONS 预检增加 CORS 响应头，使随机端口的本地 WebView origin 可以访问局域网或公网 API。

未配置地址时，商城显示“在线商城服务未配置”，内置 J2ME 和冒泡资源仍可离线运行。HTTP 地址适合同一局域网测试，正式部署使用 HTTPS。

## 验证

- 构建时注入 `MOBILE_52JAVA_API_BASE=http://192.168.0.100:8080`。
- Node 服务的商城 OPTIONS 预检返回 204，目录请求返回 CORS 头和游戏数据。
- Web 和移动资源构建、服务端 TypeScript 检查通过。
