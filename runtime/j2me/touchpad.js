/* ============================================================================
 * touchpad.js —— 虚拟键盘手势识别内核（SSOT，j2me / 冒泡共用）
 *
 * 只负责「手势 → 按键边沿」这一层，与平台交付解耦：
 *   - 命中测试：dpad 圆几何 + 内侧毛刺保护带 + 软键穿透查找(elementsFromPoint，
 *     解决软键 mask 角区压住 dpad 方框角的历史问题)
 *   - 方向判定：激活阈值 0.40 / 保持阈值 0.28 滞回（手指抖动不跳键），斜向可双键
 *   - 滑动切向：按住不抬手从一个方向滑到另一个方向，平滑释放/按下
 *   - 中心确认：dpadOk="press" 落指即确认；"tap" 松手确认；从方向滑进中心不算确认
 *   - 反馈：.down 按住高亮 + .tap 动画 + navigator.vibrate
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
    var sink = opts.sink;
    var fb = opts.feedback || {};
    var timers = opts.timers || {};
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

    function keyEl(id) { return document.getElementById(id); }

    // ---------- 边沿去重：同一键被多指按住时，只给 sink 一次 press/release ----------
    function press(code, holder) {
      var h = codeHolders[code] || (codeHolders[code] = {});
      if (h[holder]) return;
      h[holder] = 1;
      if (fb.vibrate > 0 && navigator.vibrate) navigator.vibrate(fb.vibrate);
      sink.press(code);
    }
    function release(code, holder) {
      var h = codeHolders[code];
      if (!h || !h[holder]) return;
      delete h[holder];
      for (var k in h) return;  // 还有别的指头按着 → 不发 release
      delete codeHolders[code];
      sink.release(code);
    }
    function tapKey(code, holder) { press(code, holder); release(code, holder); }

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
      function on(id) { return prev.indexOf(id) >= 0; }
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
        if (inside && dist > rad - band) {
          touchInfo.blocked++;
          return { kind: null, ids: [], center: false };
        }
        if (inside) {
          var nx = dx / rad, ny = dy / rad;
          var h = Math.abs(nx), v = Math.abs(ny);
          if (h < DPAD_OK && v < DPAD_OK) return { kind: "dpad", ids: [], center: true };
          return { kind: "dpad", ids: dirIds(nx, ny, h, v, prev), center: false };
        }
      }
      var key = keyAtPoint(x, y);
      if (key) return { kind: "key", ids: [key.id], center: false };
      if (pad && gap > 0 && gap < band) {
        touchInfo.blocked++;
        return { kind: null, ids: [], center: false };
      }
      return { kind: null, ids: [], center: false };
    }

    // ---------- 指针状态机 ----------
    function okHoldMs() { return Math.max(120, Math.min(600, num(fb.okHold, 200))); }

    function beginOk(id) {
      var cur = held[id];
      if (!cur || cur.okTimer || cur.okDown) return;
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
          press(code, id);
          if (!reps[id]) reps[id] = {};
          startRepeat(id, "ok");
        }, okHoldMs());
        return;
      }
      // 默认：落指即确认，零延迟
      cur.okDown = true;
      tap(keyEl("ok"));
      press(code, id);
      if (!reps[id]) reps[id] = {};
      startRepeat(id, "ok");
    }

    function endOk(id) {
      var cur = held[id];
      if (!cur || !cur.center || !cur.startCenter) return;
      var code = buttons.ok;
      if (cur.okTimer) { tclr(cur.okTimer); cur.okTimer = 0; }
      if (cur.okDown) { cur.okDown = false; release(code, id); return; }
      // 松手确认模式下的短按：补一次完整点按
      if (fb.dpadOk === "tap") {
        tap(keyEl("ok"));
        tapKey(code, id);
      }
    }

    // 把一个指针的按键状态迁移到目标集合（滑动切向的核心）
    function move(id, next) {
      var cur = held[id];
      if (!cur) return;
      var want = next.ids || [];
      if (cur.center && !next.center) {
        if (cur.okTimer) { tclr(cur.okTimer); cur.okTimer = 0; }
        if (cur.okDown) { cur.okDown = false; release(buttons.ok, id); }
      }
      var prevIds = cur.ids;
      prevIds.forEach(function (keyId) {
        if (want.indexOf(keyId) >= 0) return;
        setDown(id, keyId, false);
        release(buttons[keyId], id);
      });
      want.forEach(function (keyId) {
        if (prevIds.indexOf(keyId) >= 0) return;
        setDown(id, keyId, true);
        tap(keyEl(keyId));
        press(buttons[keyId], id);
        if (!reps[id]) reps[id] = {};
        startRepeat(id, keyId);
      });
      cur.ids = want.slice();
      cur.center = !!next.center;
      if (next.center) beginOk(id);
    }

    function clearHold(id) {
      var st0 = held[id];
      if (!st0) { delete held[id]; return; }
      if (st0.okTimer) { tclr(st0.okTimer); st0.okTimer = 0; }
      (st0.ids || []).forEach(function (keyId) { setDown(id, keyId, false); release(buttons[keyId], id); });
      if (st0.okDown) { release(buttons.ok, id); st0.okDown = false; }
      delete held[id];
      if (reps[id]) {
        Object.keys(reps[id]).forEach(function (k) { tclr(reps[id][k]); });
        delete reps[id];
      }
    }

    function releaseAll() {
      Object.keys(held).forEach(function (id) { clearHold(id); });
      codeHolders = {};
    }

    // ---------- 指针监听（document 级，支持滑动手势） ----------
    function excluded(e) {
      return opts.exclude && e.target.closest && e.target.closest(opts.exclude);
    }

    document.addEventListener("pointerdown", function (e) {
      if (excluded(e)) return;
      var prev = held[e.pointerId] && held[e.pointerId].ids || [];
      var h = hit(e.clientX, e.clientY, contactRadius(e), prev);
      if (h.kind === null) return;
      e.preventDefault();
      if (onActivate) onActivate(e);
      held[e.pointerId] = { ids: [], center: false, startCenter: !!h.center, okTimer: 0, okDown: false };
      move(e.pointerId, h);
    });

    document.addEventListener("pointermove", function (e) {
      var cur = held[e.pointerId];
      if (!cur) return;
      var h = hit(e.clientX, e.clientY, contactRadius(e), cur.ids);
      if (h.kind === null) {
        move(e.pointerId, { kind: null, ids: [], center: false });
        return;
      }
      move(e.pointerId, h);
    });

    function up(e) {
      var cur = held[e.pointerId];
      if (!cur) return;
      endOk(e.pointerId);
      clearHold(e.pointerId);
    }
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
    document.addEventListener("contextmenu", function (e) {
      if (e.target.closest && e.target.closest("#keypad")) e.preventDefault();
    });
    document.addEventListener("selectstart", function (e) {
      if (e.target.closest && e.target.closest("#keypad")) e.preventDefault();
    }, true);
    document.addEventListener("dragstart", function (e) {
      if (e.target.closest && e.target.closest("#keypad")) e.preventDefault();
    }, true);

    // ---------- 防卡键 ----------
    window.addEventListener("blur", releaseAll);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) releaseAll();
    });
    window.addEventListener("pagehide", releaseAll);

    return {
      releaseAll: releaseAll,
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
