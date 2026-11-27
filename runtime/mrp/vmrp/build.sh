#!/bin/bash
# Rebuilds vmrp.js / vmrp.wasm in this directory from upstream vmrp plus hle-memcpy.patch.
# Needs git, network access and Emscripten 2.0.12 on PATH (emsdk: `./emsdk install 2.0.12 && ./emsdk activate 2.0.12`
# then `source ./emsdk_env.sh`). 2.0.12 matches the clang 12 objects in upstream's prebuilt wasm/unicorn/libunicorn.a.
set -euo pipefail

VMRP_REPO=https://github.com/vmrp/vmrp.git
VMRP_COMMIT=ffe01e9fc203a830ad55b6b9636500e0fdc971b4
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

emcc --version | head -1 | grep -q ' 2\.0\.12 ' || { echo "需要 Emscripten 2.0.12" >&2; exit 1; }

git clone --quiet "$VMRP_REPO" "$WORK/vmrp"
git -C "$WORK/vmrp" checkout --quiet "$VMRP_COMMIT"
git -C "$WORK/vmrp" apply "$HERE/hle-memcpy.patch"

# The flags of upstream wasm/Makefile. debug.c is left out: it is only used with -DDEBUG and needs Windows capstone headers.
cd "$WORK/vmrp/wasm"
emcc -Os -Wall -DVMRP ../main.c ../fileLib.c ../network.c ../vmrp.c ../utils.c ../rbtree.c ../bridge.c ../memory.c \
  ./unicorn/libunicorn.a \
  -s EXPORTED_FUNCTIONS="['_main', '_malloc', '_free']" \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s ALLOW_TABLE_GROWTH \
  -s USE_SDL=2 \
  -s USE_ZLIB=1 \
  -s WASM=1 \
  -s FORCE_FILESYSTEM=1 \
  -o "$HERE/vmrp.js"
