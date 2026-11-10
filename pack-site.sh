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
for file in btroom.js compat.html debug-graphics.js debug-native.js files.js keymap.js layout.js panel.js runtime-extras.js screen.js touchpad.js ui-feedback.js; do
  cp "runtime/j2me/$file" "$DEST/$file"
done
cp runtime/mrp/mrp-runtime.js "$DEST/mrp-runtime.js"

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
alive = [g for g in results if g.get('alive')]
full = json.load(open(os.path.join(vendor, 'hall', 'manifest.json')))
by_file = {g['file']: g for g in full}
shipped, missing = [], []
for g in alive:
    src = os.path.join(vendor, 'public', 'mrps', g['file'])
    dst = os.path.join(dest, 'maopao', 'public', 'mrps', g['file'])
    if os.path.exists(src):
        shutil.copy2(src, dst)
        shipped.append(by_file.get(g['file'], g))
    else:
        missing.append(g['file'])
with open(os.path.join(dest, 'maopao', 'hall', 'manifest.json'), 'w') as f:
    json.dump(shipped, f, ensure_ascii=False)
print(f'shipped {len(shipped)} mrp, missing {len(missing)}: {missing}')
PYEOF

echo "---- staging done: $DEST ----"
du -sh "$DEST"
