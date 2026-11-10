(function () {
  var KEYS = { ArrowUp: -1, ArrowDown: -2, ArrowLeft: -3, ArrowRight: -4, Enter: -5, SoftLeft: -6, SoftRight: -7, Backspace: -8, Delete: -8, Escape: -11, "*": 42, "#": 35 };
  var BUTTONS = { up: -1, down: -2, left: -3, right: -4, ok: -5, choice: -6, back: -7, ret: -11, clear: -8, star: 42, pound: 35 };
  var ROTATE = {
    "90": { "-1": -3, "-4": -1, "-2": -4, "-3": -2, "50": 52, "54": 50, "56": 54, "52": 56 },
    "-90": { "-1": -4, "-3": -1, "-2": -3, "-4": -2, "50": 54, "52": 50, "56": 52, "54": 56 }
  };

  for (var d = 0; d <= 9; d++) {
    KEYS[d] = 48 + d;
    BUTTONS["num" + d] = 48 + d;
  }

  var NAMES = { "-1": "up", "-2": "down", "-3": "left", "-4": "right", "-5": "ok", "-6": "soft1", "-7": "soft2", "-8": "clear", "-11": "back" };

  function rotated(code) {
    var map = ROTATE[config.rotate];
    if (map && map[code] !== undefined) code = map[code];
    return NAMES[code] ? config.keys[NAMES[code]] : code;
  }

  function now() { return performance.now(); }
  function num(v, dflt) { var n = parseFloat(v); return isFinite(n) ? n : dflt; }
  function frames() { return MIDP.frames | 0; }

  // ---------------------------------------------------------------------------
  // 输入内核：帧同步，零轮询
  //
  // J2ME 游戏按帧采样按键（GameCanvas.getKeyStates），所以「按下」和「松开」必须
  // 落在**两个不同的渲染帧**里，游戏才看得到边沿 —— 这是双击跑动、连击、菜单快翻
  // 能成立的前提。
  //
  // 上一版用 setTimeout(8ms) 反复轮询帧号 + 250ms 兜底，代价是：松手要等 25~50ms
  // 才发出 release，中心键按下去 70ms 才确认，快速连点时第二拍被推迟到 110ms 之后
  // —— 手感就是「不跟手 + 吞键」。
  //
  // 这一版改为：
  //   1) 直接拦截 MIDP.frames 的写入（游戏每渲染一帧就会自增），帧一变立刻结算，
  //      不再有任何轮询定时器；
  //   2) 每键只维护 want（用户想要）/ seen（游戏已经看到）两个状态，任一方变化时
  //      尝试立即结算 —— 所以**第一次按下是 0 延迟**的；
  //   3) 唯一的延迟发生在「同一帧内需要先松后按」时，等 1 帧（不满足条件才等 2 帧）；
  //   4) 兜底窗口由实测帧间隔推导（默认 60ms 上限），只为「游戏卡住不重绘」时解卡，
  //      不再是 250ms 那种长尾。
  //
  // 手势识别（命中测试/滑动切向/滞回/中心确认/反馈动画/连发调度/防卡键）已抽到
  // touchpad.js 作为双运行时 SSOT；本文件只保留 j2me 平台层：帧同步交付、
  // 键位旋转、物理键盘、KeyTrace 诊断。
  // ---------------------------------------------------------------------------
  var frameGaps = [];
  var lastFrameAt = 0;
  var estFrameMs = 34;
  var frameSeq = 0;
  var hooked = false;

  // 输入专用调度器：长按连发和卡帧 fallback 跟随浏览器绘制节奏，
  // 不再用 setTimeout 竞争主线程。游戏本身的 Java 线程定时器仍由 VM 管理。
  var rafTaskId = 0;
  var rafTasks = Object.create(null);
  var rafPending = false;
  function rafPump(ts) {
    rafPending = false;
    for (var id in rafTasks) {
      var task = rafTasks[id];
      if (ts >= task.due) {
        delete rafTasks[id];
        try { task.fn(); } catch (e) {}
      }
    }
    if (Object.keys(rafTasks).length) rafSchedule();
  }
  function rafSchedule() {
    if (rafPending) return;
    rafPending = true;
    if (window.requestAnimationFrame) window.requestAnimationFrame(rafPump);
    else window.setTimeout(function () { rafPump(performance.now()); }, 16);
  }
  function inputSet(fn, ms) {
    var id = ++rafTaskId;
    rafTasks[id] = { fn: fn, due: performance.now() + Math.max(0, ms | 0) };
    rafSchedule();
    return id;
  }
  function inputClear(id) { delete rafTasks[id]; }

  function median(arr) {
    var a = arr.slice().sort(function (x, y) { return x - y; });
    return a[a.length >> 1];
  }

  function installFrameHook() {
    if (hooked) return true;
    if (typeof MIDP === "undefined") return false;
    try {
      var desc = Object.getOwnPropertyDescriptor(MIDP, "frames");
      if (!desc || !desc.configurable) return false;
      var cur = desc.value | 0;
      Object.defineProperty(MIDP, "frames", {
        configurable: true,
        enumerable: true,
        get: function () { return cur; },
        set: function (v) { cur = v | 0; onFrame(); }
      });
      hooked = true;
      return true;
    } catch (e) {
      return false;
    }
  }

  function onFrame() {
    frameSeq++;
    var t = now();
    if (lastFrameAt) {
      var g = t - lastFrameAt;
      if (g > 4 && g < 400) {
        frameGaps.push(g);
        if (frameGaps.length > 9) frameGaps.shift();
        estFrameMs = median(frameGaps);
      }
    }
    lastFrameAt = t;
    if (!hasPending()) return;
    try { flush(false); } catch (e) {}
    if (hasPending()) scheduleFallback();
  }

  var TRACE_MAX = 64;
  var traceBuf = [];
  var lastTap = { code: 0, gapMs: 0, gapFrames: 0, at: 0, quick: false };

  function trace(code, kind) {
    traceBuf.push({ t: Math.round(now()), f: frames(), c: code, k: kind });
    if (traceBuf.length > TRACE_MAX) traceBuf.shift();
  }

  var S = Object.create(null);
  function st(code) {
    var s = S[code];
    if (!s) {
      s = S[code] = { seen: false, q: [], changeSeq: -1, releasedAt: 0, releaseFrame: -99999 };
    }
    return s;
  }

  function minFrames() { return Math.max(1, Math.min(3, Math.round(num(config.tapFrames, 1)))); }
  function doubleTapMs() { return Math.max(120, Math.min(600, num(config.doubleTap, 320))); }
  function holdCap() { return Math.max(60, Math.min(400, num(config.keyHold, 60))); }
  function fallbackMs() {
    var scale = holdCap() / 60;
    return Math.max(60, Math.min(260, Math.round(estFrameMs * 1.6 * scale)));
  }

  // 每次「用户想让这个键变成 pressed / released」都入队一个边沿。
  // 每帧只结算一个 —— 这样 press 和 release 永远落在不同的渲染帧里，
  // 游戏按帧采样时才既看得到下沿也看得到上沿（双击、连点都靠这个）。
  function enqueue(code, v) {
    var s = st(code);
    var last = s.q.length ? s.q[s.q.length - 1] : s.seen;
    if (last === v) return;
    s.q.push(v);
    if (s.q.length > 6) s.q.splice(0, s.q.length - 6);
    kick();
  }

  function flush(force) {
    var f = frames();
    var need = minFrames();
    for (var k in S) {
      var s = S[k];
      if (!s.q.length) continue;
      // 「跨帧」必须用帧回调计数判断：直接比 MIDP.frames 的数值会被同一帧内的
      // 两次读写绕过，导致 press/release 落在同一帧 —— 游戏就看不到这次点按。
      if (!force && frameSeq - s.changeSeq < need) continue;
      var next = s.q.shift();
      s.seen = next;
      s.changeSeq = frameSeq;
      if (next) {
        var gap = s.releasedAt ? now() - s.releasedAt : 0;
        MIDP.sendKeyPress(+k);
        trace(+k, "P");
        if (gap > 0 && gap < doubleTapMs()) {
          lastTap = { code: +k, gapMs: Math.round(gap), gapFrames: f - s.releaseFrame, at: now(), quick: true };
        }
      } else {
        MIDP.sendKeyRelease(+k);
        trace(+k, "R");
        s.releasedAt = now();
        s.releaseFrame = f;
      }
    }
  }

  function hasPending() {
    for (var k in S) { if (S[k].q.length) return true; }
    return false;
  }

  var fbTimer = 0;
  function scheduleFallback() {
    if (fbTimer) return;
    fbTimer = inputSet(function () {
      fbTimer = 0;
      try { flush(true); } catch (e) {}
      if (hasPending()) scheduleFallback();
    }, fallbackMs());
  }

  // 用户操作后立刻尝试结算；只有「本帧已经变过一次」才会落到帧边界上
  function kick() {
    installFrameHook();
    flush(false);
    if (hasPending()) scheduleFallback();
  }

  function releaseAll() {
    for (var pk in physical) inputClear(physical[pk].timer);
    physical = Object.create(null);
    for (var k in S) {
      S[k].q.length = 0;
      if (S[k].seen) S[k].q.push(false);
    }
    flush(true);
  }

  // ---------- Touchpad 交付层：手势内核产生的边沿进帧同步队列 ----------
  // keymap.js 是同步脚本，而 config/*.js 与 bld/main-all.js 是 defer —— 顶层直接
  // 引用 config/vmSetTimeout 会 ReferenceError。因此惰性 boot：defer 链就绪后再 bind。
  var pad = null;
  function boot() {
    if (pad || !window.Touchpad) return;
    pad = Touchpad.bind({
      buttons: BUTTONS,
      sink: {
        press: function (code) { enqueue(rotated(code), true); kick(); },
        release: function (code) { enqueue(rotated(code), false); kick(); },
        repeat: function (code) {
          var rc = rotated(code);
          var s = S[rc];
          if (s && s.seen) { MIDP.sendKeyRepeat(rc); trace(rc, "p"); }
        }
      },
      feedback: {
        vibrate: config.vibrate | 0,
        keyRepeat: String(config.keyRepeat) !== "0",
        repeatDelay: config.repeatDelay == null ? 450 : num(config.repeatDelay, 450),
        repeatInterval: config.repeatInterval || 100,
        dpadOk: String(config.dpadOk) === "tap" ? "tap" : "press",
        okHold: config.okHold,
        tapMs: 240
      },
       timers: { set: inputSet, clear: inputClear },
      exclude: "#btroom, #panel"
    });
  }
  if (typeof config !== "undefined" && typeof vmSetTimeout !== "undefined") boot();
  if (!pad) document.addEventListener("DOMContentLoaded", boot);

  // ---------- 物理键盘 ----------
  var CODES = { KeyQ: -6, KeyE: -7 };

  function keyOf(e) {
    var custom = config.keymap || {};
    for (var action in custom) if (custom[action] === e.code || custom[action] === e.key) {
      var code = Object.keys(NAMES).filter(function (k) { return NAMES[k] === action; })[0];
      if (code !== undefined) return +code;
    }
    return e.code in CODES ? CODES[e.code] : e.key in KEYS ? KEYS[e.key] : null;
  }

  function typing(e) {
    var t = e.target;
    if (!t || !t.tagName) return false;
    var n = t.tagName.toLowerCase();
    return n === "input" || n === "textarea" || n === "select" || t.isContentEditable;
  }

  var physical = Object.create(null);
  function physicalRepeat(id) {
    var p = physical[id];
    if (!p) return;
    if (String(config.keyRepeat) !== "0") {
      MIDP.sendKeyRepeat(p.code);
      trace(p.code, "p");
      p.timer = inputSet(function () { physicalRepeat(id); }, Math.max(16, num(config.repeatInterval, 100)));
    }
  }

  window.addEventListener("keydown", function (e) {
    var k = keyOf(e);
    if (k === null) return;
    if (!typing(e)) e.preventDefault();
    var id = e.code || e.key;
    if (physical[id]) return;
    var code = rotated(k);
    physical[id] = { code: code, timer: inputSet(function () { physicalRepeat(id); }, Math.max(0, num(config.repeatDelay, 450))) };
    enqueue(code, true);
    kick();
  }, { passive: false });

  window.addEventListener("keyup", function (e) {
    var k = keyOf(e);
    if (k !== null) { enqueue(rotated(k), false); kick(); }
    var id = e.code || e.key;
    if (physical[id]) { inputClear(physical[id].timer); delete physical[id]; }
  }, true);

  window.addEventListener("blur", releaseAll);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) releaseAll();
  });
  window.addEventListener("pagehide", releaseAll);

  // ---------- 诊断 ----------
  window.TouchDiagnostics = {
    last: function () { return pad ? pad.info() : { r: 0, guard: 0, blocked: 0 }; },
    sizes: function () { return pad ? pad.sizes() : {}; }
  };

  // 输入时序诊断：给「双击跑不起来」这类问题一个可观测的口子
  window.KeyTrace = {
    edges: function () { return traceBuf.slice(); },
    lastTap: function () { return lastTap; },
    window: function () { return doubleTapMs(); },
    frames: frames,
    frameMs: function () { return Math.round(estFrameMs); },
    pending: hasPending,
    reset: function () { traceBuf.length = 0; lastTap = { code: 0, gapMs: 0, gapFrames: 0, at: 0, quick: false }; },
    summary: function () {
      var t = lastTap;
      if (!t.at) return "";
      var name = NAMES[t.code] || String(t.code);
      return name + " " + t.gapMs + "ms/" + t.gapFrames + "f" + (t.quick ? " ✓双击" : "");
    }
  };

  installFrameHook();
})();
