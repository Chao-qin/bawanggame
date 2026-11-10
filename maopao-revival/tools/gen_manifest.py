#!/usr/bin/env python3
"""扫描 vendor/vmrp.github.io/public/mrps/*.mrp，解析 MRP 头，生成 hall/manifest.json。

MRP 头结构（对齐 vmrp.github.io/src/mrp.js 的 MRPHeader）：
  [0:4]   'MRPG' 魔数
  [28:52] DisplayName (GBK, NUL 结尾)
  [88:128] Vendor (GBK)
  [128:192] Desc (GBK)
  [204:206] ScreenWidth (u16le) / [206:208] ScreenHeight (u16le)

用法：python3 tools/gen_manifest.py
"""
import glob
import json
import os
import struct

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MRPS = os.path.join(ROOT, 'vendor', 'vmrp.github.io', 'public', 'mrps')
OUT = os.path.join(ROOT, 'hall', 'manifest.json')


def gbk(b: bytes) -> str:
    return b.split(b'\x00')[0].decode('gbk', 'replace').strip()


def parse(path: str):
    with open(path, 'rb') as f:
        d = f.read(240)
    if len(d) < 240 or d[0:4] != b'MRPG':
        return None
    return {
        'file': os.path.basename(path),
        'size': os.path.getsize(path),
        'name': gbk(d[28:52]) or os.path.basename(path),
        'vendor': gbk(d[88:128]),
        'desc': gbk(d[128:192]),
        'w': struct.unpack('<H', d[204:206])[0],
        'h': struct.unpack('<H', d[206:208])[0],
    }


def main():
    rows = []
    for p in sorted(glob.glob(os.path.join(MRPS, '*.mrp'))):
        try:
            r = parse(p)
            if r:
                rows.append(r)
        except OSError:
            continue
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(rows)} games -> {OUT}')


if __name__ == '__main__':
    main()
