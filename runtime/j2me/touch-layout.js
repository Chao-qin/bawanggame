/* Touch keypad layout and action mapping. The DOM remains a stable set of
   slots; this module only changes slot placement and the action each slot
   delivers to the emulator. */
(function () {
  var NUMBERS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "star", "0", "pound"];
  var DPAD = ["up", "right", "down", "left"];
  var ACTIONS = ["up", "down", "left", "right", "ok", "choice", "back", "ret", "clear", "star", "pound", "num0", "num1", "num2", "num3", "num4", "num5", "num6", "num7", "num8", "num9"];
  var ACTION_SLOTS = ["up", "right", "down", "left", "ok", "choice", "back", "ret", "clear", "star", "num0", "pound", "num1", "num2", "num3", "num4", "num5", "num6", "num7", "num8", "num9"];
  var DEFAULT_ACTIONS = { choice: "choice", back: "back", ret: "ret", clear: "clear", ok: "ok" };
  var DEFAULT = { dpad: "standard", sides: "standard", numbers: NUMBERS.slice(), actions: {} };
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
  function validSides(value) { return value === "swapped" ? "swapped" : DEFAULT.sides; }
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

  function apply(value) {
    var current = normalize(value);
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
    return current;
  }

  window.TouchLayout = {
    numbers: NUMBERS.slice(),
    actions: ACTIONS.slice(),
    defaults: defaults,
    normalize: normalize,
    visualDpad: visualDpad,
    apply: apply
  };
})();
