#!/bin/bash
# 小潮霸王静态发布包：React public + 模拟器运行时别名 + 冒泡运行时。
set -euo pipefail
cd "$(dirname "$0")"

ROOT="$(pwd)"
VENDOR="$ROOT/maopao-revival/vendor/vmrp.github.io"
REPORT="$ROOT/maopao-revival/docs/compat-report.json"
DEST="$ROOT/site-deploy"

rm -rf "$DEST"
mkdir -p "$DEST"

# React PWA 构建输出
cp -R public/. "$DEST/"

# 保持模拟器历史 URL，同时源码实际归档在 runtime/j2me/。
for dir in bld config java libs style; do
  cp -R "runtime/j2me/$dir" "$DEST/$dir"
done
for file in btroom.js compat.html debug-graphics.js debug-native.js files.js keypad-canvas.js keymap.js panel.js runtime-extras.js screen.js touch-layout.js touchpad.js ui-feedback.js; do
  cp "runtime/j2me/$file" "$DEST/$file"
done
mkdir -p "$DEST/runtime/j2me"
cp runtime/j2me/{input-mapping,touch-layout}.js "$DEST/runtime/j2me/"
cp runtime/mrp/mrp-runtime.js "$DEST/mrp-runtime.js"

# Ruffle's self-hosted runtime and its offline Flash smoke-test game.
RUFFLE_PACKAGE="$ROOT/apps/web/node_modules/@ruffle-rs/ruffle"
RUFFLE_DEST="$DEST/ruffle"
mkdir -p "$RUFFLE_DEST" "$DEST/flash"
shopt -s nullglob
ruffle_cores=("$RUFFLE_PACKAGE"/core.ruffle.*.js)
ruffle_wasm=("$RUFFLE_PACKAGE"/*.wasm)
if [[ ! -f "$RUFFLE_PACKAGE/ruffle.js" || ! -f "$RUFFLE_PACKAGE/LICENSE_MIT" || ! -f "$RUFFLE_PACKAGE/LICENSE_APACHE" || ${#ruffle_cores[@]} -ne 2 || ${#ruffle_wasm[@]} -ne 2 ]]; then
  echo "Ruffle 运行时资源不完整（需要 loader、2 个 core、2 个 WASM 和两份许可证）" >&2
  exit 1
fi
cp "$RUFFLE_PACKAGE/ruffle.js" "$RUFFLE_PACKAGE/LICENSE_MIT" "$RUFFLE_PACKAGE/LICENSE_APACHE" "${ruffle_cores[@]}" "${ruffle_wasm[@]}" "$RUFFLE_DEST/"
if [[ ! -f "$ROOT/games/flash/sample-game.swf" ]]; then
  echo "缺少内置 Flash 测试游戏: games/flash/sample-game.swf" >&2
  exit 1
fi
if [[ ! -f "$DEST/flash/fruit-madness.swf" || ! -f "$DEST/flash/fruit-madness-LICENSE" ]]; then
  echo "缺少 Fruit Madness 游戏或许可证，请先运行 pnpm build" >&2
  exit 1
fi
cp "$ROOT/games/flash/sample-game.swf" "$DEST/flash/sample-game.swf"

# JAR 游戏通过 /jar/* 提供
mkdir -p "$DEST/jar"
find games/jar -maxdepth 1 -type f -name '*.jar' -exec cp {} "$DEST/jar/" \;

# 冒泡运行时与大厅
mkdir -p "$DEST/maopao/vmrp_v1.0" "$DEST/maopao/hall" "$DEST/maopao/public/mrps"
cp -R "$VENDOR/vmrp_v1.0/fs" "$DEST/maopao/vmrp_v1.0/fs"
cp "$VENDOR"/vmrp_v1.0/vmrp.js "$VENDOR"/vmrp_v1.0/vmrp.wasm \
  "$VENDOR"/vmrp_v1.0/fs.js "$VENDOR"/vmrp_v1.0/midi.js "$DEST/maopao/vmrp_v1.0/"

python3 - "$REPORT" "$VENDOR" "$DEST" <<'PYEOF'
import json, os, shutil, sys
report, vendor, dest = sys.argv[1], sys.argv[2], sys.argv[3]
results = json.load(open(report))['results']
# alive: True ran and answered keys, False froze, None the scan itself failed.
status = {g['file']: {True: 'alive', False: 'frozen'}.get(g.get('alive'), 'unknown') for g in results}
full = json.load(open(os.path.join(vendor, 'hall', 'manifest.json')))
# Only games the compatibility scan saw running are packed (the whole library is ~200 MB). Every other game stays in
# the catalog with bundled=false and is loaded from the public vmrp mirror when it starts (apps/web/src/maopao.js).
shipped, missing, catalog = [], [], []
for g in full:
    entry = dict(g, compat=status.get(g['file'], 'untested'), bundled=False)
    if entry['compat'] == 'alive':
        src = os.path.join(vendor, 'public', 'mrps', g['file'])
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(dest, 'maopao', 'public', 'mrps', g['file']))
            entry['bundled'] = True
            shipped.append(g['file'])
        else:
            missing.append(g['file'])
    catalog.append(entry)
catalog.sort(key=lambda g: not g['bundled'])
with open(os.path.join(dest, 'maopao', 'hall', 'manifest.json'), 'w') as f:
    json.dump(catalog, f, ensure_ascii=False)
print(f'catalog {len(catalog)} mrp, shipped {len(shipped)}, missing {len(missing)}: {missing}')
PYEOF

echo "---- staging done: $DEST ----"
du -sh "$DEST"
