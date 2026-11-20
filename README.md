# 小潮霸王

**English** · [Русский](README.ru.md)

一个统一的老手机游戏 Web 项目，包含 React 游戏大厅、J2ME 模拟器和 MRP/冒泡运行时。J2ME 内核源自 [pluotsorbet](https://github.com/mozilla/pluotsorbet)。

## Features

- High-level LCDUI (Form, List, TextBox, Alert, etc.)
- Sockets and HTTP through a WebSocket proxy on the server
- Audio: MIDI, WAV, MP3, AMR
- 3D: M3G (JSR-184, the J2ME-Loader engine compiled to WebAssembly) and Mascot Capsule (micro3d)
- Bluetooth (JSR-82): L2CAP and SPP between tabs and devices via rooms, directly over WebRTC or through TURN
- Screen resolution auto-detection from the manifest, jar name and graphics
- On-screen keypad, rotation, scaling, per-game settings
- Platform selectable per game (default Sony Ericsson): changes `microedition.platform` and key codes (soft keys, joystick, C/Back) to match Nokia/SE/Samsung, Siemens, Motorola, LG; C (−8) and Back (−11) keys are supported; PC keyboard: arrows, Enter, Q/E as soft keys, Backspace is C, Esc is Back
- System properties (`microedition.locale` and others) editable per game: Settings → "System properties", with reset to defaults
- Load your own .jar files straight from the page (stored in the browser)
- Browse the 52emu.cn Java game catalog and install JARs into the browser library
- File manager for the phone's virtual storage (memory card, saves): upload, download, folders

## Quick start

Requires Node.js and pnpm.

```bash
pnpm install
pnpm build
pnpm start
```

Open http://localhost:8080. Put local JAR files into `games/jar/` or add them from the React lobby; browser-added games are stored locally.

### React Native mobile host

The repository also contains an Android/iOS React Native host in `apps/mobile`. It runs the Web build as a bundled local site: the build step prepares `site-deploy`, the native app serves it from a loopback HTTP server, and WebView displays the existing React simulator without a remote homepage dependency.

```bash
pnpm mobile:prepare-web
pnpm --filter @xiaochao/mobile android  # Android Studio/device required
pnpm --filter @xiaochao/mobile ios     # macOS/Xcode/CocoaPods required
```

See [`apps/mobile/README.md`](apps/mobile/README.md) for prerequisites, generated resources, local server behavior and native back handling.

## Deployment

### VPS (systemd)

```bash
./deploy.sh            # port 8080
PORT=80 ./deploy.sh    # another port
```

The script installs coturn, creates a TURN secret in `/etc/j2me.env`, opens ports in ufw (if enabled) and starts the `j2me` service. At the end it prints the address and the `TURN_URL` / `TURN_SECRET` lines for use in other installations.

Ports: site (TCP), 3478 (TCP/UDP), 49160–49200 (UDP).

```bash
systemctl status j2me
journalctl -u j2me -f
```

### Docker / Render

Use Docker with the Compose plugin. From the repository root, run:

```bash
docker compose up --build -d --wait
```

Open http://127.0.0.1:8080 for the Web lobby, Flash, J2ME and the 52java store. Set `WEB_PORT=8081` before starting Compose to use a different host port. Compose binds to loopback by default. If you set `WEB_BIND` to a network address, restrict access to trusted clients because the server includes a game socket proxy.

Place your server-side JAR files in `games/jar/`. Compose mounts the directory read-only and the library reads it on request. The browser stores games and saves by site origin, so changing the hostname or port opens a separate local library. The 52java store installs JARs into that browser library.

To include the MRP library, first place the vmrp runtime and your local game assets under `maopao-revival/vendor/vmrp.github.io/` as described in [the MRP setup](maopao-revival/README.md). Start with the additional Compose file:

```bash
docker compose -f compose.yaml -f compose.mrp.yaml up --build -d --wait
```

The default container starts with an empty MRP catalog. The optional Compose file mounts the tracked `maopao-revival/hall/` catalog and the vendor checkout’s `vmrp_v1.0/` and `public/mrps/` directories. Verify both vendor directories exist before adding the override. The 「大宋豪侠 · 本地复活」 entry requires the separate `dasong-server` service.

```bash
docker compose logs -f web
docker compose down
```

Render builds the same Dockerfile and supplies the container's `PORT` at runtime. Compose and Render run the Web service without publishing TURN ports. For direct Docker runs, set `TURN=0` to run just the Node service.

Run `node scripts/verify-web-docker.mjs` with Node.js 22 to test the image in an isolated Compose project. The test checks the built lobby and runtime assets, the read-only JAR mount, and 52java preflight without contacting the upstream catalog.

The React Native app continues to package its local site through `pnpm mobile:prepare-web` and the platform build commands above.

### Environment variables

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port (default 8080) |
| `TURN_URL` | external TURN, comma-separated: `turn:host:3478,turn:host:3478?transport=tcp` |
| `TURN_SECRET` | shared TURN secret (`use-auth-secret` in coturn) |
| `52JAVA_BASE_URL` | 52java origin used by the in-app store (default `https://java.52emu.cn`) |
| `52JAVA_MAX_BYTES` | Maximum accepted game archive size (default 64 MiB) |
| `TURN_IP` | external IP for the built-in coturn if auto-detection is wrong |
| `TURN=0` | do not start the built-in coturn |
| `ALLOW_PRIVATE=1` | allow the proxy to connect to the local network |
| `PYTHON` | interpreter used by `start.sh` |

## Bluetooth multiplayer

The first time a game turns Bluetooth on, a window appears:

- **Create** — a new room with a name and password, which you pass to the other player. A room whose name is already taken cannot be created. Connection mode for the whole room: **Auto** (both channels, direct and TURN, are brought up on joining, 20 pings each, and the one with the lower 90th-percentile latency is chosen; if neither comes up, the server is used), **P2P** (direct, falls back to TURN, the server is not used), **TURN** (always TURN, the server is not used, `TURN_URL` required);
- **Join** — enter the room name and password;
- **Nearby** — no password, for players behind the same public IP.

After that the game behaves as with real Bluetooth: device discovery, service discovery, `btl2cap://` and `btspp://`. The server only introduces players to each other. Once connected, data goes directly (WebRTC) when possible, otherwise through TURN or the server's WebSocket. Connection state is shown by the dot on the gear icon (green — direct or TURN, yellow — via server, red — no connection); details are in Settings, "Network game": room, player count, connection mode, switching rooms.

URL parameters to skip the window: `?room=name&pass=password&btname=Nick` joins a room; add `&mode=create` to create one, and `&net=auto|p2p|turn` for the connection mode. An empty `?room=` means "Nearby".

## Page parameters

The React lobby opens J2ME games with internal runtime state; direct HTML player URLs are no longer used.

| Parameter | Value |
|---|---|
| `screen` | `240x320`, `auto`, `fit` |
| `scale`, `rotate`, `keypad`, `fps`, `jit` | same as in Settings (`fps` limits the frame rate, 0 means unlimited) |
| `platform` | `se`, `nokia`, `samsung`, `siemens`, `motorola`, `lg` or a custom string |
| `debug=1` | enable debug output in the console |

## Building the Java part

`runtime/j2me/java/classes.jar` is prebuilt. After changing anything in `runtime/j2me/src/`:

```bash
runtime/j2me/src/bt/build.sh     # JSR-82
runtime/j2me/src/m3g/build.sh    # M3G (needs clang with the wasm32 target)
```

## Layout

```
apps/web/             React PWA and runtime adapters
apps/server/          Node.js HTTP server, socket proxy, Bluetooth room server
runtime/j2me/bld/     J2ME VM, MIDP, LCDUI, network, audio, 3D, Bluetooth
runtime/j2me/src/     JSR-82, M3G and micro3d sources
runtime/j2me/config/  emulator settings and URL compatibility config
runtime/j2me/style/   phone shell and LCDUI styles
runtime/mrp/          React-loaded MRP runtime bridge
games/jar/            local JAR games (ignored by Git)
public/               generated React PWA output (ignored by Git)
```

## License and credits

- Copyright 2026 Chao-qin and the bawanggame contributors
- Licensed under the Apache License 2.0 (see `LICENSE`)
- [pluotsorbet](https://github.com/mozilla/pluotsorbet) — Mozilla, Apache License 2.0; the class library is based on phoneME
- M3G — [J2ME-Loader](https://github.com/nikita36078/J2ME-Loader), see `src/m3g/NOTICE` for details
- [webaudio-tinysynth](https://github.com/g200kg/webaudio-tinysynth), [BenzAMRRecorder](https://github.com/BenzLeung/benz-amr-recorder), [text-encoding](https://github.com/inexorabletash/text-encoding)
# 大宋豪侠本地服务器
