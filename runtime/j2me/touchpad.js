/* ============================================================================
 * touchpad.js —— 虚拟键盘手势识别内核（SSOT，j2me / 冒泡共用）
 *
 * 只负责「手势 → 按键边沿」这一层，与平台交付解耦：
 *   - 命中测试：dpad 圆几何 + 内侧毛刺保护带 + 软键穿透查找(elementsFromPoint，
 *     解决软键 mask 角区压住 dpad 方框角的历史问题)
 *   - 方向判定：激活阈值 0.40 / 保持阈值 0.28 滞回（手指抖动不跳键），斜向可双键
 *   - 滑动切向：按住不抬手从一个方向滑到另一个方向，平滑释放/按下
 *   - 中心确认：dpadOk="press" 落指即确认；"tap" 松手确认；从方向滑进中心不算确认
 *   - 反馈：.down 按住高亮 + .tap 动画 + native/Web Vibration haptic
 *   - 连发：长按 repeatDelay 后按 repeatInterval 重复（经 sink.repeat 下发）
 *   - 防卡键：blur / visibilitychange / pagehide 全量释放
 *
 * 平台差异通过 opts 注入：
 *   buttons   {id: 平台键码}         j2me: {up:-1,...} 冒泡: {up:12,...}
 *   sink      {press(code), release(code), repeat(code)}
 *             j2me: 入帧同步队列→MIDP；冒泡: Module._c_event
 *   feedback  {vibrate, keyRepeat, repeatDelay, repeatInterval, dpadOk, okHold, tapMs}
 *   timers    {set(fn,ms), clear(id)} j2me: vmSetTimeout；冒泡: 原生
 *   exclude   选择器，命中其内部的 pointer 事件不碰（j2me: #btroom/#panel；冒泡: #mrp-dialog）
 *   onActivate(pointerdown)           冒泡用来把焦点归还画布
 * ==========================================================================*/
(function () {
  var DPAD_ON = 0.40;   // 激活阈值（相对半径）
  var DPAD_KEEP = 0.28; // 已按住方位的保持阈值（滞回）
  var DPAD_OK = 0.30;   // 中心区：只当作确认，不抢占方向

  function num(v, dflt) { var n = parseFloat(v); return isFinite(n) ? n : dflt; }

  function bind(opts) {
    var buttons = opts.buttons;
    var dpadVisual = opts.dpadVisual || function (id) { return id; };
    var sink = opts.sink;
    var fb = opts.feedback || {};
    var timers = opts.timers || {};
    var listeners = [];
    function listen(target, type, fn, options) {
      target.addEventListener(type, fn, options);
      listeners.push([target, type, fn, options]);
    }
    var rafId = 0, rafJobs = Object.create(null), rafQueued = false;
    function rafTick(ts) {
      rafQueued = false;
      for (var id in rafJobs) {
        var job = rafJobs[id];
        if (ts >= job.at) {
          delete rafJobs[id];
          try { job.fn(); } catch (_) {}
        }
      }
      if (Object.keys(rafJobs).length) rafQueue();
    }
    function rafQueue() {
      if (rafQueued) return;
      rafQueued = true;
      if (window.requestAnimationFrame) window.requestAnimationFrame(rafTick);
      else window.setTimeout(function () { rafTick(performance.now()); }, 16);
    }
    function rafSet(fn, ms) {
      var id = ++rafId;
      rafJobs[id] = { fn: fn, at: performance.now() + Math.max(0, ms | 0) };
      rafQueue();
      return id;
    }
    function rafClear(id) { delete rafJobs[id]; }
    var tset = timers.set || rafSet;
    var tclr = timers.clear || rafClear;
    var onActivate = opts.onActivate || null;
    var tapMs = fb.tapMs || 240;

    var held = {};      // pointerId -> { ids: [], center, startCenter, okTimer, okDown }
    var reps = {};      // pointerId -> { keyId: timerId }
    var codeHolders = {}; // 平台码 -> {holderId: 1}（多指同键时只发一次边沿）
    var captures = {};  // pointerId -> element used for pointer capture

    function keyEl(id) { return document.getElementById(id); }

    function inKeypad(target) {
      return target && target.closest && target.closest("#keypad");
    }

    function keypadGestureTarget(target) {
      if (!inKeypad(target)) return false;
      if (target.closest("#editor-layer, #mrp-dialog-text, #panel")) return false;
      return true;
    }

    function clearSelection() {
      var selection = window.getSelection && window.getSelection();
      if (selection && selection.rangeCount) selection.removeAllRanges();
    }

    function coarsePointer(pointerType) {
      if (pointerType === "mouse" || pointerType === "pen") return false;
      if (pointerType === "touch") return true;
      return !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
    }

    function haptic(pointerType) {
      if (!coarsePointer(pointerType)) return;
      var requested = fb.vibrate == null ? 24 : Number(fb.vibrate);
      if (!(requested > 0)) return;
      var duration = Math.max(8, Math.min(40, Math.round(requested)));
      // The app's shared channel (apps/web/src/runtime/haptics.js): native host looked up at press time, else the
      // Vibration API. The fallback below keeps the standalone runtime pages working.
      var shared = window.__XIAOCHAO_HAPTIC_PULSE__;
      if (typeof shared === "function") {
        try { shared(duration); return; } catch (_) {}
      }
      var host = window.__XIAOCHAO_RN_HOST__;
      if (host && typeof host.haptic === "function") {
        try {
          if (host.haptic(duration) !== false) return;
        } catch (_) {}
      }
      var vibration = typeof navigator !== "undefined" && navigator && navigator.vibrate;
      if (typeof vibration !== "function") return;
      try { vibration.call(navigator, duration); } catch (_) {}
    }

    // ---------- 边沿去重：同一键被多指按住时，只给 sink 一次 press/release ----------
    // quiet: a move that presses two directions (a diagonal) pulses once. Returns whether this press pulsed, so a
    // key another finger already holds does not take the pulse from the new one.
    function press(code, holder, sourceAt, pointerType, quiet) {
      var h = codeHolders[code] || (codeHolders[code] = {});
      if (h[holder]) return false;
      var firstHolder = Object.keys(h).length === 0;
      h[holder] = 1;
      var pulsed = firstHolder && !quiet;
      if (pulsed) haptic(pointerType);
      sink.press(code, { pointer: true, sourceAt: sourceAt == null ? null : sourceAt });
      return pulsed;
    }
    function release(code, holder, sourceAt) {
      var h = codeHolders[code];
      if (!h || !h[holder]) return;
      delete h[holder];
      for (var k in h) return;  // 还有别的指头按着 → 不发 release
      delete codeHolders[code];
      sink.release(code, { pointer: true, sourceAt: sourceAt == null ? null : sourceAt });
    }
    function tapKey(code, holder, sourceAt, pointerType) { press(code, holder, sourceAt, pointerType); release(code, holder, sourceAt); }

    // ---------- 反馈动画 ----------
    function tap(node) {
      if (!node) return;
      var token = (node._tap || 0) + 1;
      node._tap = token;
      node.classList.remove("tap");
      void node.offsetWidth;
      node.classList.add("tap");
      setTimeout(function () {
        if (node._tap === token) node.classList.remove("tap");
      }, tapMs);
    }

    function setDown(id, keyId, on) {
      var el = keyEl(keyId);
      if (el) el.classList.toggle("down", !!on);
      var row = reps[id];
      if (row && row[keyId]) { tclr(row[keyId]); delete row[keyId]; }
    }

    // ---------- 连发 ----------
    function startRepeat(id, keyId) {
      if (fb.keyRepeat === false || !fb.repeatDelay) return;
      var code = buttons[keyId];
      var tick = function () {
        var row = reps[id];
        if (!row || !(keyId in row)) return;
        sink.repeat(code);
        row[keyId] = tset(tick, fb.repeatInterval || 100);
      };
      reps[id][keyId] = tset(tick, fb.repeatDelay);
    }

    // ---------- 命中测试 ----------
    function dirIds(nx, ny, h, v, prev) {
      var ids = [];
      function on(id) { return prev.indexOf(dpadVisual(id)) >= 0; }
      function threshold(id) { return on(id) ? DPAD_KEEP : DPAD_ON; }
      if (h >= threshold(nx < 0 ? "left" : "right")) ids.push(nx < 0 ? "left" : "right");
      if (v >= threshold(ny < 0 ? "up" : "down")) ids.push(ny < 0 ? "up" : "down");
      if (!ids.length) ids.push(h >= v ? (nx < 0 ? "left" : "right") : (ny < 0 ? "up" : "down"));
      return ids;
    }

    function guardGap(cr, rad) {
      if (cr <= 0) return 2;
      return Math.min(2 + cr * 0.6, rad * 0.16);
    }

    // 穿透查找真正的按键：方向键是圆，元素方框四角压着软键，不能让方框吞掉软键
    function keyAtPoint(x, y) {
      var list = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [document.elementFromPoint(x, y)];
      for (var i = 0; i < list.length; i++) {
        var el = list[i];
        if (!el || !el.closest) continue;
        if (el.closest("#dpad")) continue;
        var k = el.closest(".key");
        if (k && k.id in buttons) return k;
      }
      return null;
    }

    var touchInfo = { r: 0, guard: 0, blocked: 0 };

    function contactRadius(e) {
      if (!e || e.pointerType === "mouse" || e.pointerType === "pen") return 0;
      var w = e.width || 0, h = e.height || 0;
      if (w <= 2 && h <= 2) return 0;
      return Math.max(4, Math.min(24, Math.max(w, h) / 2));
    }

    function hit(x, y, cr, prev) {
      cr = cr || 0;
      prev = prev || [];
      var pad = document.getElementById("dpad");
      var band = 2, inside = false, gap = 0;
      if (pad) {
        var r = pad.getBoundingClientRect();
        var cx = r.left + r.width / 2, cy = r.top + r.height / 2, rad = r.width / 2;
        var dx = x - cx, dy = y - cy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        band = guardGap(cr, rad);
        touchInfo.r = Math.round(cr);
        touchInfo.guard = Math.round(band);
        gap = dist - rad;
        inside = dist < rad;
        if (inside) {
          var nx = dx / rad, ny = dy / rad;
          var h = Math.abs(nx), v = Math.abs(ny);
          if (h < DPAD_OK && v < DPAD_OK) return { kind: "dpad", ids: [], center: true };
          return { kind: "dpad", ids: dirIds(nx, ny, h, v, prev).map(dpadVisual), center: false };
        }
      }
      var key = keyAtPoint(x, y);
      if (key) return { kind: "key", ids: [key.id], center: false };
      return { kind: null, ids: [], center: false };
    }

    // ---------- 指针状态机 ----------
    function okHoldMs() { return Math.max(120, Math.min(600, num(fb.okHold, 200))); }

    function beginOk(id, sourceAt, pointerType) {
      var cur = held[id];
      if (!cur || cur.okTimer || cur.okDown) return;
      pointerType = cur.pointerType == null ? pointerType : cur.pointerType;
      // 只有起手就落在中心的触摸才算确认键；从方向滑进中心不算，避免误确认
      if (!cur.startCenter) return;
      var code = buttons.ok;
      if (fb.dpadOk === "tap") {
        // 松手才确认（保守模式）：按住一段时间后才标记 okDown
        cur.okTimer = tset(function () {
          cur.okTimer = 0;
          if (held[id] !== cur || !cur.center || cur.okDown) return;
          cur.okDown = true;
          tap(keyEl("ok"));
          press(code, id, sourceAt, pointerType);
          if (!reps[id]) reps[id] = {};
          startRepeat(id, "ok");
        }, okHoldMs());
        return;
      }
      // 默认：落指即确认，零延迟
      cur.okDown = true;
      tap(keyEl("ok"));
      press(code, id, sourceAt, pointerType);
      if (!reps[id]) reps[id] = {};
      startRepeat(id, "ok");
    }

    function endOk(id, sourceAt, pointerType) {
      var cur = held[id];
      if (!cur || !cur.center || !cur.startCenter) return;
      sourceAt = cur.sourceAt == null ? sourceAt : cur.sourceAt;
      pointerType = cur.pointerType == null ? pointerType : cur.pointerType;
      var code = buttons.ok;
      if (cur.okTimer) { tclr(cur.okTimer); cur.okTimer = 0; }
      if (cur.okDown) { cur.okDown = false; release(code, id, sourceAt); return; }
      // 松手确认模式下的短按：补一次完整点按
      if (fb.dpadOk === "tap") {
        tap(keyEl("ok"));
        tapKey(code, id, sourceAt, pointerType);
      }
    }

    // 把一个指针的按键状态迁移到目标集合（滑动切向的核心）
    function move(id, next, sourceAt, pointerType) {
      var cur = held[id];
      if (!cur) return;
      sourceAt = cur.sourceAt == null ? sourceAt : cur.sourceAt;
      pointerType = cur.pointerType == null ? pointerType : cur.pointerType;
      var want = next.ids || [];
      if (cur.center && !next.center) {
        if (cur.okTimer) { tclr(cur.okTimer); cur.okTimer = 0; }
        if (cur.okDown) { cur.okDown = false; release(buttons.ok, id, sourceAt); }
      }
      var prevIds = cur.ids;
      prevIds.forEach(function (keyId) {
        if (want.indexOf(keyId) >= 0) return;
        setDown(id, keyId, false);
        release(buttons[keyId], id, sourceAt);
      });
      var pulsed = false;
      want.forEach(function (keyId) {
        if (prevIds.indexOf(keyId) >= 0) return;
        setDown(id, keyId, true);
        tap(keyEl(keyId));
        if (press(buttons[keyId], id, sourceAt, pointerType, pulsed)) pulsed = true;
        if (!reps[id]) reps[id] = {};
        startRepeat(id, keyId);
      });
      cur.ids = want.slice();
      cur.center = !!next.center;
      if (next.center) beginOk(id, sourceAt, pointerType);
    }

    function releaseCapture(id) {
      var target = captures[id];
      if (target && target.releasePointerCapture) {
        try { target.releasePointerCapture(+id); } catch (_) {}
      }
      delete captures[id];
    }

    function clearHold(id, sourceAt) {
      var st0 = held[id];
      releaseCapture(id);
      if (!st0) { delete held[id]; return; }
      sourceAt = st0.sourceAt == null ? sourceAt : st0.sourceAt;
      if (st0.okTimer) { tclr(st0.okTimer); st0.okTimer = 0; }
      (st0.ids || []).forEach(function (keyId) { setDown(id, keyId, false); release(buttons[keyId], id, sourceAt); });
      if (st0.okDown) { release(buttons.ok, id, sourceAt); st0.okDown = false; }
      delete held[id];
      if (reps[id]) {
        Object.keys(reps[id]).forEach(function (k) { tclr(reps[id][k]); });
        delete reps[id];
      }
    }

    function releaseAll() {
      Object.keys(held).forEach(function (id) { clearHold(id); });
      Object.keys(captures).forEach(releaseCapture);
      codeHolders = {};
    }

    // ---------- 指针监听（document 级，支持滑动手势） ----------
    // Keys are found by position (elementsFromPoint), which sees through anything layered on top. Only a touch
    // that lands on the runtime stage (the phone plus its safe-area padding, where edge keys are still in reach)
    // may press one: a tap on a popup, the exit confirmation or the toolbar must not press the key underneath.
    function excluded(e) {
      if (!e.target || !e.target.closest || !e.target.closest("[data-runtime-stage]")) return true;
      return opts.exclude && e.target.closest(opts.exclude);
    }

    listen(document, "pointerdown", function (e) {
      var sourceAt = performance.now();
      if (excluded(e)) return;
      var prev = held[e.pointerId] && held[e.pointerId].ids || [];
      var h = hit(e.clientX, e.clientY, contactRadius(e), prev);
      // A touch that lands in a gap between the keys is tracked without pressing anything, so sliding onto a key
      // presses it — the same as landing on the key and sliding.
      if (h.kind === null && !(e.target && e.target.closest && e.target.closest("#nav, #numpad"))) return;
      e.preventDefault();
      clearSelection();
      if (onActivate) onActivate(e);
      var captureTarget = e.target && e.target.setPointerCapture ? e.target : document.getElementById("keypad");
      if (captureTarget && captureTarget.setPointerCapture) {
        try { captureTarget.setPointerCapture(e.pointerId); captures[e.pointerId] = captureTarget; } catch (_) {}
      }
      held[e.pointerId] = { ids: [], center: false, startCenter: !!h.center, okTimer: 0, okDown: false, sourceAt: sourceAt, pointerType: e.pointerType };
      move(e.pointerId, h, sourceAt, e.pointerType);
    });

    listen(document, "pointermove", function (e) {
      var cur = held[e.pointerId];
      if (!cur) return;
      var h = hit(e.clientX, e.clientY, contactRadius(e), cur.ids);
      if (h.kind === null) {
        move(e.pointerId, { kind: null, ids: [], center: false }, performance.now(), cur.pointerType);
        return;
      }
      move(e.pointerId, h, performance.now(), cur.pointerType);
    });

    function up(e) {
      var cur = held[e.pointerId];
      if (!cur) return;
      endOk(e.pointerId);
      clearHold(e.pointerId);
    }
    listen(document, "pointerup", up);
    listen(document, "pointercancel", up);
    // Android WebView may begin its long-press callout before a bubbling
    // React/document listener runs. Capture non-passive native gestures on
    // the keypad itself, while leaving editor and settings controls alone.
    function blockKeypadGesture(e) {
      if (!keypadGestureTarget(e.target)) return;
      e.preventDefault();
      if (e.type === "selectstart" || e.type === "contextmenu") clearSelection();
    }
    ["touchstart", "touchmove", "gesturestart", "contextmenu", "selectstart", "dragstart"].forEach(function (type) {
      listen(document, type, blockKeypadGesture, { capture: true, passive: false });
    });

    // ---------- 防卡键 ----------
    listen(window, "blur", releaseAll);
    listen(document, "visibilitychange", function () {
      if (document.hidden) releaseAll();
    });
    listen(window, "pagehide", releaseAll);

    return {
      releaseAll: releaseAll,
      destroy: function () {
        releaseAll();
        Object.keys(rafJobs).forEach(function (id) { delete rafJobs[id]; });
        listeners.forEach(function (item) { item[0].removeEventListener(item[1], item[2], item[3]); });
        listeners.length = 0;
      },
      info: function () { return { r: touchInfo.r, guard: touchInfo.guard, blocked: touchInfo.blocked }; },
      sizes: function () {
        var out = {};
        Object.keys(buttons).forEach(function (id) {
          var el = keyEl(id);
          if (!el) return;
          var r = el.getBoundingClientRect();
          out[id] = [Math.round(r.width), Math.round(r.height)];
        });
        return out;
      }
    };
  }

  window.Touchpad = { bind: bind };
})();
