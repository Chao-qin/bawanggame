#!/bin/zsh
# 冒泡 MRP 运行时启动脚本
# 用法: ./serve.sh [port]   默认 8090
# 注意: 本机 shell 若有 HTTP_PROXY，curl 访问本机需 --noproxy '*'
PORT=${1:-8090}
DIR="$(cd "$(dirname "$0")" && pwd)/vendor/vmrp.github.io"
if [ ! -d "$DIR" ]; then
  echo "缺少 vendor/vmrp.github.io，请先克隆: git clone --depth 1 https://github.com/vmrp/vmrp.github.io.git vendor/vmrp.github.io"
  exit 1
fi
echo "冒泡运行时: http://127.0.0.1:${PORT}/index.html"
echo "直达游戏:   http://127.0.0.1:${PORT}/vmrp_v1.0/main.html?f=/public/mrps/<游戏名>.mrp"
python3 -m http.server "$PORT" --bind 0.0.0.0 --directory "$DIR"
