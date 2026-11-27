# vmrp 冒泡内核

冒泡播放器（`apps/web/src/runtime/MrpPlayer.jsx`）加载本目录的 `vmrp.js` / `vmrp.wasm`。它们由上游 [vmrp](https://github.com/vmrp/vmrp)（GPL-3.0）在提交 `ffe01e9` 上打 `hle-memcpy.patch` 编译而成。本目录（编译产物、补丁、构建脚本）按 GPL-3.0 发布，许可证见 `LICENSE`，对应源码即上游提交加本目录的补丁与 `build.sh`。系统文件（`fs/`）和 `midi.js` 仍取自 `maopao-revival/vendor/vmrp.github.io/vmrp_v1.0/`。

## 补丁做了什么

vmrp 用 unicorn（解释执行）运行游戏的 ARM 代码。实测游戏的模拟指令几乎全部花在系统层 `cfunction.ext` 自带的逐字节 `memcpy`（地址 `0x94E94`）上，多数是复制屏幕缓冲：雷电 1944 占 97.9%，野蛮女教师占 89.8%。

补丁在启动时核对该地址的 8 条指令。一致时在函数入口挂钩子：用原生代码完成复制，再把长度寄存器 R2 清零，原代码随即经自身的 `subs r2, r2, #1; bxcc lr` 返回。复制结果与原来的逐字节前向复制一致，包括源与目标重叠的情况。写入走 `uc_mem_write`，会让被覆盖区域里已翻译的代码失效。以下情况不处理，交回原代码执行：

- 指令不一致（换了 `cfunction.ext`）
- 长度为 0
- 地址超出模拟内存

钩子不改 PC。unicorn 1 每次停止模拟都会清空整个翻译缓存，改 PC 会触发停止。

## 重新编译

```bash
source <emsdk>/emsdk_env.sh   # Emscripten 2.0.12
runtime/mrp/vmrp/build.sh
```

编译参数与上游 `wasm/Makefile` 相同（`-Os`）。`debug.c` 只在 `-DDEBUG` 时使用，且依赖 Windows 版 capstone 头文件，因此不参与编译。用 2.0.12 编译，是因为它与上游预编译的 `libunicorn.a`（clang 12 产出）一致；同参数不打补丁编出的 `vmrp.wasm` 与上游发布版只差 5 字节。实测把 `-Os` 换成 `-O2`/`-O3` 没有提升：热点在预编译的 unicorn 里，链接阶段的优化动不到它。
