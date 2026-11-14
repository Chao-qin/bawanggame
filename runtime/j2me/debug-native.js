/*
 * debug-native.js — 原生层绘制调用记录器（仅在 ?nativelog=1 时启用）
 *
 * 目的：当画面上出现「应为空白/缺内容」的窗口时，能回答两个问题：
 *   1) 游戏到底有没有发起那几次文字/贴图绘制？
 *   2) 发起时用的坐标、颜色、clip 是什么，是否被裁掉/画到屏外？
 *
 * 用法：React 播放器?nativelog=1&jar=jar%2Fxxx.jar
 *   window.NativeLog.enable() / disable() / dump() / clear()
 *   window.NativeLog.target()  -> 检测当前画布是否为「浅青大面板」场景
 */
(function () {
  var qs = new URLSearchParams(location.search);
  if (qs.get("nativelog") !== "1") {
    window.NativeLog = { enabled: false, dump: function () { return []; } };
    return;
  }

  var LOG = [];
  var MAX = 6000;          // 环形缓冲：只保留最近 MAX 条，避免早期启动日志把屏幕内容挤掉
  var enabled = true;
  var t0 = performance.now();

  function push(s) {
    if (!enabled) return;
    if (LOG.length >= MAX) LOG.splice(0, 1500);
    LOG.push(((performance.now() - t0) | 0) + " " + s);
  }

  function getStr(a) {
    try { return J2ME.fromStringAddr(a); } catch (e) { return "<err>"; }
  }

  // 只读 GraphicsInfo 的普通字段，绝不调用 getGraphicsContext()（那会 restore/save/clip，破坏裁剪栈）
  function info(addr) {
    try {
      var i = NativeMap.get(addr);
      return "rgb=" + (i.red | 0) + "/" + (i.green | 0) + "/" + (i.blue | 0) +
             " t=" + (i.transX | 0) + "," + (i.transY | 0) +
             " clip=" + (i.clipX1 | 0) + "," + (i.clipY1 | 0) + "," + (i.clipX2 | 0) + "," + (i.clipY2 | 0);
    } catch (e) { return "info?"; }
  }

  var wrapNames = [
    "javax/microedition/lcdui/Graphics.drawString.(Ljava/lang/String;III)V",
    "javax/microedition/lcdui/Graphics.drawSubstring.(Ljava/lang/String;IIIII)V",
    "javax/microedition/lcdui/Graphics.drawChars.([CIIIII)V",
    "javax/microedition/lcdui/Graphics.drawChar.(CIII)V",
    "javax/microedition/lcdui/Graphics.fillRect.(IIII)V",
    "javax/microedition/lcdui/Graphics.drawRegion.(Ljavax/microedition/lcdui/Image;IIIIIIII)V",
    "javax/microedition/lcdui/Graphics.drawImage.(Ljavax/microedition/lcdui/Image;III)V",
    "javax/microedition/lcdui/Graphics.setClip.(IIII)V",
    "javax/microedition/lcdui/Graphics.clipRect.(IIII)V",
    "javax/microedition/lcdui/Graphics.translate.(II)V",
    "javax/microedition/lcdui/Graphics.setColor.(I)V"
  ];

  function install() {
    if (!window.Native) return false;
    var n = 0;
    wrapNames.forEach(function (name) {
      var fn = Native[name];
      if (typeof fn !== "function") { push("MISSING NATIVE " + name); return; }
      Native[name] = function () {
        var tag = name;
        try {
          if (tag.indexOf("drawString") >= 0) {
            push("drawString " + JSON.stringify(getStr(arguments[1])) + " @" + arguments[2] + "," + arguments[3] + " a=" + arguments[4] + " " + info(arguments[0]));
          } else if (tag.indexOf("drawChars") >= 0) {
            var s = "";
            try { s = J2ME.fromJavaChars(arguments[1], arguments[2], arguments[3]); } catch (e) { s = "?"; }
            push("drawChars " + JSON.stringify(s) + " @" + arguments[4] + "," + arguments[5] + " a=" + arguments[6] + " " + info(arguments[0]));
          } else if (tag.indexOf("drawSubstring") >= 0) {
            push("drawSubstring " + JSON.stringify(getStr(arguments[1]).substr(arguments[2], arguments[3])) + " @" + arguments[4] + "," + arguments[5] + " a=" + arguments[6] + " " + info(arguments[0]));
          } else if (tag.indexOf("drawChar.") >= 0) {
            push("drawChar " + JSON.stringify(String.fromCharCode(arguments[1])) + " @" + arguments[2] + "," + arguments[3] + " " + info(arguments[0]));
          } else if (tag.indexOf("fillRect") >= 0) {
            push("fillRect " + arguments[1] + "," + arguments[2] + "," + arguments[3] + "," + arguments[4] + " " + info(arguments[0]));
          } else if (tag.indexOf("drawRegion") >= 0) {
            push("drawRegion src=" + arguments[2] + "," + arguments[3] + "," + arguments[4] + "," + arguments[5] +
                 " tr=" + arguments[6] + " dst=" + arguments[7] + "," + arguments[8] + " a=" + arguments[9] + " " + info(arguments[0]));
          } else if (tag.indexOf("drawImage") >= 0) {
            push("drawImage " + arguments[2] + "," + arguments[3] + " a=" + arguments[4] + " " + info(arguments[0]));
          } else if (tag.indexOf("setClip") >= 0) {
            push("setClip " + arguments[1] + "," + arguments[2] + "," + arguments[3] + "," + arguments[4]);
          } else if (tag.indexOf("clipRect") >= 0) {
            push("clipRect " + arguments[1] + "," + arguments[2] + "," + arguments[3] + "," + arguments[4]);
          } else if (tag.indexOf("translate") >= 0) {
            push("translate " + arguments[1] + "," + arguments[2]);
          } else if (tag.indexOf("setColor") >= 0) {
            push("setColor 0x" + (arguments[1] >>> 0).toString(16));
          }
        } catch (e) {
          push("ERR " + tag + " " + e.message);
        }
        return fn.apply(this, arguments);
      };
      n++;
    });
    push("INSTALLED " + n + " natives");
    return true;
  }

  // 画布场景检测：浅青大面板（#BEE6F2 ±16）占比
  // ---- 导出：把「最近绘制记录 + 当前画面」打包成一个 json 供下载/复制 ----
  function exportBundle() {
    var shot = null;
    try { shot = document.getElementById("canvas").toDataURL("image/png"); } catch (e) { }
    return {
      ua: navigator.userAgent,
      url: location.href,
      time: new Date().toISOString(),
      shot: shot,
      log: window.NativeLog.dump()
    };
  }

  function downloadBundle() {
    var data = JSON.stringify(exportBundle());
    var blob = new Blob([data], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "drawlog-" + Date.now() + ".json";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  function mount(node) {
    var root = document.querySelector(".runtime-overlay-root");
    (window.__XIAOCHAO_RUNTIME_MOUNT_OVERLAY__ || function (item) {
      (root || document.body).appendChild(item);
    })(node);
  }

  window.__XIAOCHAO_DEBUG_NATIVE_MOUNT__ = function () {
    var button = document.getElementById("drawlog-btn");
    if (button) mount(button);
    else addButton();
  };

  function addButton() {
    if (document.getElementById("drawlog-btn")) return;
    var b = document.createElement("button");
    b.id = "drawlog-btn";
    b.textContent = "导出绘制日志";
    b.style.cssText = "position:fixed;right:8px;bottom:8px;z-index:99999;padding:10px 14px;" +
      "font:600 13px/1 -apple-system,system-ui,sans-serif;color:#0b1218;background:#7fe3a0;" +
      "border:0;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.35);opacity:.92";
    b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); downloadBundle(); }, true);
    mount(b);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addButton);
  else addButton();

  window.NativeLog = {
    enabled: true,
    exportBundle: exportBundle,
    download: downloadBundle,
    dump: function () { return LOG.slice(); },
    clear: function () { LOG.length = 0; t0 = performance.now(); },
    enable: function () { enabled = true; },
    disable: function () { enabled = false; },
    mark: function (m) { push("=== MARK " + m); },
    target: function () {
      try {
        var cv = document.getElementById("canvas");
        var ctx = cv.getContext("2d");
        var w = cv.width, h = cv.height;
        var d = ctx.getImageData(0, 0, w, h).data;
        var pale = 0, orange = 0, tot = 0;
        for (var y = 0; y < h; y += 2) {
          for (var x = 0; x < w; x += 2) {
            var o = (y * w + x) * 4, r = d[o], g = d[o + 1], b = d[o + 2];
            tot++;
            if (Math.abs(r - 0xBE) < 22 && Math.abs(g - 0xE6) < 22 && Math.abs(b - 0xF2) < 22) pale++;
            if (r > 0x90 && g > 0x40 && g < 0xa0 && b < 0x50) orange++;
          }
        }
        return { w: w, h: h, pale: pale / tot, orange: orange / tot };
      } catch (e) { return { err: e.message }; }
    }
  };

  // 等 Native 就绪
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    if (install() || tries > 200) clearInterval(timer);
  }, 25);
})();
