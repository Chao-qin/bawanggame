// The one input engine of every runtime keyboard family (apps/web/src/keyboard/system.js describes them for the UI):
//   phone  J2ME and MRP: the T9 keypad's 21 actions;
//   flash  the Flash gamepad: directions, OK, A and B, which the player turns into the game's keyboard keys.
// Bindings resolve per game (xiaochao.input.v1.<gameId>), else the family's global choice from the 「键盘」 page
// (xiaochao.input.v1.global.<family>), else the defaults below.
(function (root) {
  var ACTIONS = ["up", "down", "left", "right", "ok", "choice", "back", "ret", "clear", "star", "pound"];
  for (var digit = 0; digit <= 9; digit++) ACTIONS.push("num" + digit);

  var KEY_DEFAULTS = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    Enter: "ok", KeyQ: "choice", KeyE: "back", Escape: "ret", Backspace: "clear", Delete: "clear",
    SoftLeft: "choice", SoftRight: "back", "*": "star", "#": "pound",
    Digit0: "num0", Digit1: "num1", Digit2: "num2", Digit3: "num3", Digit4: "num4",
    Digit5: "num5", Digit6: "num6", Digit7: "num7", Digit8: "num8", Digit9: "num9",
    Numpad0: "num0", Numpad1: "num1", Numpad2: "num2", Numpad3: "num3", Numpad4: "num4",
    Numpad5: "num5", Numpad6: "num6", Numpad7: "num7", Numpad8: "num8", Numpad9: "num9",
    Minus: "star", Equal: "pound", NumpadMultiply: "star", NumpadAdd: "pound"
  };
  for (var keyDigit = 0; keyDigit <= 9; keyDigit++) KEY_DEFAULTS[String(keyDigit)] = "num" + keyDigit;

  // Shoulder buttons are the soft keys (they used to name "soft1"/"soft2", which are not actions, so did nothing).
  var GAMEPAD_DEFAULTS = {
    "button:0": "ok", "button:1": "back", "button:2": "choice", "button:3": "clear",
    "button:4": "choice", "button:5": "back", "button:8": "ret",
    "button:12": "up", "button:13": "down", "button:14": "left", "button:15": "right",
    "axis:0:-": "left", "axis:0:+": "right", "axis:1:-": "up", "axis:1:+": "down"
  };

  var FAMILIES = {
    phone: { actions: ACTIONS, keyboard: KEY_DEFAULTS, gamepad: GAMEPAD_DEFAULTS },
    // A Flash game reads the real keyboard itself, so no keyboard key is taken over unless the player binds one.
    flash: {
      actions: ["up", "down", "left", "right", "ok", "a", "b"],
      keyboard: {},
      gamepad: {
        "button:0": "a", "button:1": "b", "button:2": "a", "button:3": "b", "button:9": "ok",
        "button:12": "up", "button:13": "down", "button:14": "left", "button:15": "right",
        "axis:0:-": "left", "axis:0:+": "right", "axis:1:-": "up", "axis:1:+": "down"
      }
    }
  };

  var LEGACY_NAMES = {
    up: "up", down: "down", left: "left", right: "right", ok: "ok",
    soft1: "choice", soft2: "back", clear: "clear", back: "ret"
  };

  function safeRead(key) {
    try { return JSON.parse(root.localStorage.getItem(key)) || {}; } catch (_) { return {}; }
  }
  function storageKey(id) { return "xiaochao.input.v1." + encodeURIComponent(String(id || "default")); }
  function globalKey(family) { return "xiaochao.input.v1.global." + family; }
  function familyOf(name) { return Object.prototype.hasOwnProperty.call(FAMILIES, name) ? name : "phone"; }
  function bindingMap(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : null; }

  /** The family's global bindings (the 「键盘」 page), else its defaults; a saved map is complete, not a patch. */
  function baseBindings(family) {
    var defaults = FAMILIES[family];
    var saved = safeRead(globalKey(family));
    return {
      keyboard: Object.assign({}, bindingMap(saved.keyboard) || defaults.keyboard),
      gamepad: Object.assign({}, bindingMap(saved.gamepad) || defaults.gamepad)
    };
  }

  function create(options) {
    options = options || {};
    var sink = options.sink || {};
    var family = familyOf(options.family);
    var ACTIONS = FAMILIES[family].actions;
    function validAction(action) { return ACTIONS.indexOf(action) >= 0; }
    var id = storageKey(options.gameId);
    var saved = safeRead(id);
    var base = baseBindings(family);
    // Whether this game has bindings of its own; otherwise it keeps following the global choice and saves none.
    var ownKeyboard = Boolean(bindingMap(saved.keyboard));
    var ownGamepad = Boolean(bindingMap(saved.gamepad));
    var gamepadBindings = Object.assign({}, base.gamepad, saved.gamepad || {});
    var keyboardBindings = Object.assign({}, base.keyboard);
    var legacy = options.legacyKeyboardMap || {};
    Object.keys(LEGACY_NAMES).forEach(function (name) {
      var key = legacy[name];
      if (key && validAction(LEGACY_NAMES[name])) keyboardBindings[key] = LEGACY_NAMES[name];
    });
    Object.assign(keyboardBindings, saved.keyboard || {});

    var owners = Object.create(null);
    var actionOwners = Object.create(null);
    var keyboardDown = Object.create(null);
    var captureDown = Object.create(null);
    var gamepadDown = Object.create(null);
    var repeatTimers = Object.create(null);
    var pollTimer = 0;
    var destroyed = false;
    var windowFocused = true;
    var captureAction = null;
    var lastPads = [];
    var axisState = Object.create(null);
    var repeatDelay = Math.max(150, Number(options.repeatDelay) || 450);
    var repeatInterval = Math.max(40, Number(options.repeatInterval) || 100);

    function emit(action, pressed, source) {
      if (pressed) {
        var holders = actionOwners[action] || (actionOwners[action] = Object.create(null));
        if (holders[source]) return;
        var first = Object.keys(holders).length === 0;
        holders[source] = true;
        owners[source] = action;
        if (first && sink.press) sink.press(action, source);
        if (first && source.indexOf("touch:") !== 0) startRepeat(action, source);
        return;
      }
      if (owners[source] !== action) return;
      delete owners[source];
      var held = actionOwners[action];
      if (held) delete held[source];
      stopRepeat(source);
      if (held && Object.keys(held).length === 0) {
        delete actionOwners[action];
        if (sink.release) sink.release(action, source);
      }
    }

    function startRepeat(action, source) {
      if (options.repeat === false || !sink.repeat) return;
      repeatTimers[source] = root.setTimeout(function repeat() {
        if (owners[source] !== action || destroyed) return;
        if (sink.repeat) sink.repeat(action, source);
        repeatTimers[source] = root.setTimeout(repeat, repeatInterval);
      }, repeatDelay);
    }

    function stopRepeat(source) {
      if (!repeatTimers[source]) return;
      root.clearTimeout(repeatTimers[source]);
      delete repeatTimers[source];
    }

    function keyboardAction(event) {
      return keyboardBindings[event.code] || keyboardBindings[event.key] || null;
    }

    function onKeyDown(event) {
      if (destroyed || !options.keyboard) return;
      // The Flash player answers bound keys with keyboard events of its own; only real key presses are input.
      if (options.trustedOnly && !event.isTrusted) return;
      var target = event.target;
      if (captureAction) {
        event.preventDefault();
        event.stopImmediatePropagation();
        var capturedKey = event.code || event.key;
        captureDown["keyboard:" + capturedKey] = true;
        Object.keys(keyboardBindings).forEach(function (key) { if (keyboardBindings[key] === captureAction) delete keyboardBindings[key]; });
        keyboardBindings[capturedKey] = captureAction;
        ownKeyboard = true;
        var action = captureAction;
        captureAction = null;
        persist();
        root.dispatchEvent(new root.CustomEvent("xiaochao:inputbinding", { detail: { action: action, control: capturedKey, kind: "keyboard" } }));
        return;
      }
      if (target && target.closest && target.closest("input, textarea, select, [contenteditable=true], #panel, #btroom, #files, #mrp-dialog, .runtimeSheet, .exitConfirm")) return;
      var action = event.key === "*" ? "star" : event.key === "#" ? "pound" : keyboardAction(event);
      if (!validAction(action)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      var source = "keyboard:" + (event.code || event.key);
      if (keyboardDown[source]) return;
      keyboardDown[source] = action;
      emit(action, true, source);
    }

    function onKeyUp(event) {
      if (options.trustedOnly && !event.isTrusted) return;
      var source = "keyboard:" + (event.code || event.key);
      if (captureDown[source]) {
        delete captureDown[source];
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      var action = keyboardDown[source];
      if (!action) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      delete keyboardDown[source];
      emit(action, false, source);
    }

    function persist() {
      try {
        root.localStorage.setItem(id, JSON.stringify({ keyboard: ownKeyboard ? keyboardBindings : undefined, gamepad: ownGamepad ? gamepadBindings : undefined }));
      } catch (_) {}
    }

    function controlAction(control) {
      if (Object.prototype.hasOwnProperty.call(gamepadBindings, control)) return gamepadBindings[control];
      return null;
    }

    function findCaptureControl(pads) {
      for (var p = 0; p < pads.length; p++) {
        var pad = pads[p];
        if (!pad) continue;
        for (var b = 0; b < pad.buttons.length; b++) {
          if (pad.buttons[b] && pad.buttons[b].pressed) return "button:" + b;
        }
        for (var a = 0; a < pad.axes.length; a++) {
          if (pad.axes[a] <= -0.7) return "axis:" + a + ":-";
          if (pad.axes[a] >= 0.7) return "axis:" + a + ":+";
        }
      }
      return null;
    }

    function pollGamepads() {
      if (destroyed || !options.gamepad || root.document.hidden || !windowFocused) return;
      var pads = [];
      try { if (root.navigator.getGamepads) pads = Array.prototype.slice.call(root.navigator.getGamepads()); } catch (_) {}
      lastPads = pads;
      if (captureAction) {
        var captured = findCaptureControl(pads);
        if (captured) {
          Object.keys(gamepadBindings).forEach(function (control) {
            if (gamepadBindings[control] === captureAction) delete gamepadBindings[control];
          });
          gamepadBindings[captured] = captureAction;
          ownGamepad = true;
          var action = captureAction;
          captureAction = null;
          persist();
          root.dispatchEvent(new root.CustomEvent("xiaochao:gamepadbinding", { detail: { action: action, control: captured } }));
          return;
        }
      }

      var seen = Object.create(null);
      pads.forEach(function (pad, padIndex) {
        if (!pad) return;
        for (var b = 0; b < pad.buttons.length; b++) {
          var button = pad.buttons[b];
          if (!button || !button.pressed) continue;
          var control = "button:" + b;
          var action = controlAction(control);
          if (!validAction(action)) continue;
          var source = "gamepad:" + padIndex + ":" + control;
          seen[source] = true;
          if (!gamepadDown[source]) {
            gamepadDown[source] = action;
            emit(action, true, source);
          }
        }
        for (var a = 0; a < pad.axes.length; a++) {
          var value = Number(pad.axes[a]) || 0;
          var key = padIndex + ":" + a;
          var active = axisState[key] || "";
          var next = active;
          if (active === "-") { if (value > -0.35) next = ""; }
          else if (active === "+") { if (value < 0.35) next = ""; }
          else if (value <= -0.55) next = "-";
          else if (value >= 0.55) next = "+";
          if (next !== active) {
            if (active) {
              var oldControl = "axis:" + a + ":" + active;
              var oldSource = "gamepad:" + padIndex + ":" + oldControl;
              var oldAction = gamepadDown[oldSource];
              if (oldAction) { delete gamepadDown[oldSource]; emit(oldAction, false, oldSource); }
            }
            axisState[key] = next;
            if (next) {
              var newControl = "axis:" + a + ":" + next;
              var newAction = controlAction(newControl);
              if (validAction(newAction)) {
                var newSource = "gamepad:" + padIndex + ":" + newControl;
                gamepadDown[newSource] = newAction;
                seen[newSource] = true;
                emit(newAction, true, newSource);
              }
            }
          } else if (next) {
            seen["gamepad:" + padIndex + ":axis:" + a + ":" + next] = true;
          }
        }
      });
      Object.keys(gamepadDown).forEach(function (source) {
        if (seen[source]) return;
        var action = gamepadDown[source];
        delete gamepadDown[source];
        emit(action, false, source);
      });
    }

    function releaseSource(source) {
      var action = owners[source];
      if (!action) return;
      delete keyboardDown[source];
      delete gamepadDown[source];
      emit(action, false, source);
    }

    function releaseAll() {
      Object.keys(owners).forEach(releaseSource);
      captureDown = Object.create(null);
      axisState = Object.create(null);
    }

    // Poll only while a controller is connected: getGamepads() every 16ms with nothing plugged in is pure
    // battery drain on a phone. Browsers announce a controller with gamepadconnected (on its first input).
    function anyGamepad() {
      try { return Array.prototype.some.call(root.navigator.getGamepads ? root.navigator.getGamepads() : [], Boolean); } catch (_) { return false; }
    }
    function startPolling() { if (!pollTimer && !destroyed) pollTimer = root.setInterval(pollGamepads, 16); }
    function stopPolling() { if (pollTimer) root.clearInterval(pollTimer); pollTimer = 0; }
    function onConnect() { startPolling(); pollGamepads(); }

    function onVisibility() { if (root.document.hidden) releaseAll(); }
    function onBlur() { windowFocused = false; releaseAll(); }
    function onFocus() { windowFocused = true; }
    function onDisconnect(event) {
      var index = event.gamepad && event.gamepad.index;
      Object.keys(owners).forEach(function (source) {
        if (source.indexOf("gamepad:" + index + ":") === 0) releaseSource(source);
      });
      Object.keys(axisState).forEach(function (key) { if (key.indexOf(index + ":") === 0) delete axisState[key]; });
      if (!anyGamepad()) stopPolling();
    }

    root.document.addEventListener("keydown", onKeyDown, true);
    root.document.addEventListener("keyup", onKeyUp, true);
    root.document.addEventListener("visibilitychange", onVisibility);
    root.addEventListener("blur", onBlur);
    root.addEventListener("focus", onFocus);
    root.addEventListener("pagehide", releaseAll);
    root.addEventListener("gamepaddisconnected", onDisconnect);
    if (options.gamepad) {
      root.addEventListener("gamepadconnected", onConnect);
      if (anyGamepad()) startPolling();
    }

    return {
      press: function (source, action) { if (validAction(action)) emit(action, true, source); },
      release: function (source, action) { if (validAction(action)) emit(action, false, source); },
      repeat: function (source, action) { if (validAction(action) && sink.repeat) sink.repeat(action, source); },
      actions: ACTIONS.slice(),
      gamepadBindings: function () { return Object.assign({}, gamepadBindings); },
      keyboardBindings: function () { return Object.assign({}, keyboardBindings); },
      setKeyboardBinding: function (action, control) {
        if (!validAction(action) || typeof control !== "string") return false;
        keyboardBindings[control] = action;
        ownKeyboard = true;
        persist();
        return true;
      },
      setGamepadBinding: function (action, control) {
        if (!validAction(action) || typeof control !== "string") return false;
        Object.keys(gamepadBindings).forEach(function (key) { if (gamepadBindings[key] === action) delete gamepadBindings[key]; });
        gamepadBindings[control] = action;
        ownGamepad = true;
        persist();
        return true;
      },
      family: family,
      // 「恢复默认」 in a game returns to the family's global choice.
      // and drops the game's own bindings, so later global changes reach it again.
      resetGamepadBindings: function () { gamepadBindings = baseBindings(family).gamepad; ownGamepad = false; persist(); },
      resetKeyboardBindings: function () { keyboardBindings = baseBindings(family).keyboard; ownKeyboard = false; persist(); },
      clearGamepadBinding: function (action) {
        Object.keys(gamepadBindings).forEach(function (key) { if (gamepadBindings[key] === action) delete gamepadBindings[key]; });
        ownGamepad = true;
        persist();
      },
      captureGamepad: function (action) { if (validAction(action)) captureAction = action; },
      captureControl: function (action) { if (validAction(action)) captureAction = action; },
      cancelCapture: function () { captureAction = null; },
      hasGamepad: function () { return lastPads.some(Boolean); },
      pollGamepads: pollGamepads,
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        releaseAll();
        stopPolling();
        root.document.removeEventListener("keydown", onKeyDown, true);
        root.document.removeEventListener("keyup", onKeyUp, true);
        root.document.removeEventListener("visibilitychange", onVisibility);
        root.removeEventListener("blur", onBlur);
        root.removeEventListener("focus", onFocus);
        root.removeEventListener("pagehide", releaseAll);
        root.removeEventListener("gamepaddisconnected", onDisconnect);
        root.removeEventListener("gamepadconnected", onConnect);
      }
    };
  }

  function familyInfo(name) {
    var definition = FAMILIES[familyOf(name)];
    return { actions: definition.actions.slice(), defaults: { keyboard: Object.assign({}, definition.keyboard), gamepad: Object.assign({}, definition.gamepad) } };
  }

  root.InputMapping = {
    actions: ACTIONS.slice(),
    defaults: { gamepad: Object.assign({}, GAMEPAD_DEFAULTS), keyboard: Object.assign({}, KEY_DEFAULTS) },
    families: Object.keys(FAMILIES),
    family: familyInfo,
    globalKey: globalKey,
    create: create
  };
})(window);
