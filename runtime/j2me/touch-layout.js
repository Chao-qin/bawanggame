/* Touch keypad layout and action mapping. The DOM remains a stable set of
   slots; this module only changes slot placement and the action each slot
   delivers to the emulator. */
(function () {
  var NUMBERS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "star", "0", "pound"];
  var DPAD = ["up", "right", "down", "left"];
  var ACTIONS = ["up", "down", "left", "right", "ok", "choice", "back", "ret", "clear", "star", "pound", "num0", "num1", "num2", "num3", "num4", "num5", "num6", "num7", "num8", "num9"];
  var ACTION_SLOTS = ["up", "right", "down", "left", "ok", "choice", "back", "ret", "clear", "star", "num0", "pound", "num1", "num2", "num3", "num4", "num5", "num6", "num7", "num8", "num9"];
  var DEFAULT_ACTIONS = { choice: "choice", back: "back", ret: "ret", clear: "clear", ok: "ok" };
  var DEFAULT = { dpad: "standard", sides: "swapped", numbers: NUMBERS.slice(), actions: {} };
  var gameAdapter = null;
  var D_PAD_VISUAL = {
    standard: { up: "up", right: "right", down: "down", left: "left" },
    mirror: { up: "up", right: "left", down: "down", left: "right" },
    "rotate-cw": { up: "left", right: "up", down: "right", left: "down" },
    "rotate-ccw": { up: "right", right: "down", down: "left", left: "up" }
  };

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function validDpad(value) { return D_PAD_VISUAL[value] ? value : DEFAULT.dpad; }
  function validSides(value) { return value === "standard" || value === "swapped" ? value : DEFAULT.sides; }
  function keyId(value) { return value === "*" ? "star" : value === "#" ? "pound" : String(value); }

  function normalize(value) {
    var source = value && typeof value === "object" ? value : {};
    var numbers = Array.isArray(source.numbers) ? source.numbers.map(keyId) : [];
    var unique = {}, ordered = [];
    numbers.forEach(function (item) {
      if (NUMBERS.indexOf(item) >= 0 && !unique[item]) { unique[item] = true; ordered.push(item); }
    });
    NUMBERS.forEach(function (item) { if (!unique[item]) ordered.push(item); });
    var actions = {};
    var rawActions = source.actions && typeof source.actions === "object" ? source.actions : {};
    ACTION_SLOTS.forEach(function (slot) {
      var fallback = DEFAULT_ACTIONS[slot] || slot;
      var action = String(rawActions[slot] || fallback);
      if (ACTIONS.indexOf(action) < 0) action = DEFAULT_ACTIONS[slot];
      if (!action) action = fallback;
      actions[slot] = action;
    });
    return { dpad: validDpad(source.dpad), sides: validSides(source.sides), numbers: ordered, actions: actions };
  }

  function defaults() { return copy(DEFAULT); }
  function visualDpad(direction, layout) {
    var current = normalize(layout || (typeof config !== "undefined" && config.touchLayout));
    return D_PAD_VISUAL[current.dpad][direction] || direction;
  }

  function mapButtons(buttons, layout) {
    var current = normalize(layout);
    var out = {};
    Object.keys(buttons || {}).forEach(function (slot) { out[slot] = buttons[slot]; });
    Object.keys(current.actions).forEach(function (slot) {
      var action = current.actions[slot];
      if (buttons[action] != null && buttons[slot] != null) out[slot] = buttons[action];
    });
    return out;
  }

  function forGame(gameId) {
    var settings = window.Settings || (typeof Settings !== "undefined" ? Settings : null);
    var adapter = { current: normalize(settings && settings.touchLayout ? settings.touchLayout(gameId) : null) };
    gameAdapter = adapter;

    function applyCurrent() {
      apply(adapter.current);
      return copy(adapter.current);
    }

    applyCurrent();
    return {
      get: function () { return copy(adapter.current); },
      save: function (value) {
        adapter.current = normalize(value);
        if (settings && settings.setTouchLayout) settings.setTouchLayout(gameId, adapter.current);
        return applyCurrent();
      },
      reset: function () {
        adapter.current = defaults();
        if (settings && settings.setTouchLayout) settings.setTouchLayout(gameId, null);
        return applyCurrent();
      }
    };
  }

  function apply(value) {
    var current = normalize(value);
    if (gameAdapter) gameAdapter.current = current;
    if (typeof config !== "undefined") config.touchLayout = current;
    document.body.dataset.dpadLayout = current.dpad;
    document.body.dataset.sideLayout = current.sides;
    var order = {};
    current.numbers.forEach(function (item, index) { order[item] = index; });
    NUMBERS.forEach(function (item) {
      var node = document.getElementById(item === "star" ? "star" : item === "pound" ? "pound" : "num" + item);
      if (node) node.style.order = String(order[item]);
    });
    if (typeof window.__XIAOCHAO_KEYMAP_REBIND__ === "function") window.__XIAOCHAO_KEYMAP_REBIND__();
    if (window.KeypadCanvas) window.KeypadCanvas.refresh();
    return current;
  }

  function el(tag, cls, props) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (props) Object.keys(props).forEach(function (k) { e[k] = props[k]; });
    return e;
  }

  function txt(tag, cls, text) {
    return el(tag, cls, { textContent: text });
  }

  function renderControls(adapter) {
    var sec = el("div", "touch-layout-controls");
    var current = adapter.get();
    var syncControls = [];
    function refresh(next) {
      current = normalize(next);
      syncControls.forEach(function (sync) { sync(); });
    }
    function saveLayout(next) {
      refresh(adapter.save(next));
    }
    function row(label, options, field, onChange) {
      var wrap = el("label", "opt");
      wrap.appendChild(txt("span", "opt-name", label));
      var select = el("select");
      options.forEach(function (item) { select.appendChild(el("option", "", { value: item[0], textContent: item[1] })); });
      select.value = current[field];
      syncControls.push(function () { select.value = current[field]; });
      select.addEventListener("change", function () { onChange(select.value); });
      wrap.appendChild(select);
      return wrap;
    }
    sec.appendChild(row(tr("方向键", "D-pad", "方向键"), [
      ["standard", tr("标准", "Standard", "标准")],
      ["mirror", tr("左右镜像", "Mirror", "左右镜像")],
      ["rotate-cw", tr("顺时针 90°", "Rotate 90° clockwise", "顺时针 90°")],
      ["rotate-ccw", tr("逆时针 90°", "Rotate 90° counter-clockwise", "逆时针 90°")]
    ], "dpad", function (value) { saveLayout(Object.assign({}, current, { dpad: value })); }));
    sec.appendChild(row(tr("横屏两侧", "Landscape sides", "横屏两侧"), [
      ["standard", tr("数字键左 / 导航键右", "Numbers left / navigation right", "数字键左 / 导航键右")],
      ["swapped", tr("导航键左 / 数字键右", "Navigation left / numbers right", "导航键左 / 数字键右")]
    ], "sides", function (value) { saveLayout(Object.assign({}, current, { sides: value })); }));
    sec.appendChild(txt("p", "layout-note", tr("数字键保持 3×4 网格。选择某个槽位时，已占用的数字会自动交换。", "The numeric pad stays a 3×4 grid. Selecting an occupied slot swaps the two numbers.", "数字键保持 3×4 网格，选择已占用数字时会自动交换位置。")));
    var order = el("div", "layout-order");
    current.numbers.forEach(function (number, index) {
      var select = el("select");
      select.setAttribute("aria-label", tr("数字键槽位", "Number slot", "数字键槽位") + " " + (index + 1));
      TouchLayout.numbers.forEach(function (item) {
        var label = item === "star" ? "*" : item === "pound" ? "#" : item;
        select.appendChild(el("option", "", { value: item, textContent: label }));
      });
      select.value = number;
      syncControls.push(function () { select.value = current.numbers[index]; });
      select.addEventListener("change", function () {
        var next = current.numbers.slice();
        var other = next.indexOf(select.value);
        if (other >= 0 && other !== index) next[other] = next[index];
        next[index] = select.value;
        saveLayout({ dpad: current.dpad, sides: current.sides, numbers: next, actions: current.actions });
      });
      order.appendChild(select);
    });
    sec.appendChild(order);
    var actions = el("div", "layout-actions");
    var actionLabels = { up: "↑", down: "↓", left: "←", right: "→", ok: tr("确认", "OK", "确认"), choice: tr("软键 1", "Soft 1", "软键 1"), back: tr("软键 2", "Soft 2", "软键 2"), ret: tr("返回", "Back", "返回"), clear: tr("清除", "Clear", "清除") };
    ACTION_SLOTS.forEach(function (slot) {
      var r = el("label", "layout-action-row");
      var slotLabel = actionLabels[slot] || (slot === "num0" ? "0" : slot === "star" ? "*" : slot === "pound" ? "#" : slot.replace(/^num/, ""));
      r.appendChild(txt("span", "opt-name", slotLabel));
      var select = el("select");
      TouchLayout.actions.forEach(function (action) {
        var label = actionLabels[action] || (action === "star" ? "*" : action === "pound" ? "#" : action.replace(/^num/, ""));
        select.appendChild(el("option", "", { value: action, textContent: label }));
      });
      select.value = current.actions[slot] || slot;
      syncControls.push(function () { select.value = current.actions[slot]; });
      select.addEventListener("change", function () {
        var nextActions = Object.assign({}, current.actions);
        nextActions[slot] = select.value;
        saveLayout({ dpad: current.dpad, sides: current.sides, numbers: current.numbers, actions: nextActions });
      });
      r.appendChild(select);
      actions.appendChild(r);
    });
    sec.appendChild(actions);
    var reset = txt("button", "ghost", tr("恢复默认触摸布局", "Restore touch layout", "恢复默认触摸布局"));
    reset.type = "button";
    reset.addEventListener("click", function () {
      refresh(adapter.reset());
    });
    sec.appendChild(reset);
    return sec;
  }

  window.TouchLayout = {
    renderControls: renderControls,
    numbers: NUMBERS.slice(),
    actions: ACTIONS.slice(),
    defaults: defaults,
    normalize: normalize,
    mapButtons: mapButtons,
    visualDpad: visualDpad,
    apply: apply,
    forGame: forGame
  };
})();
