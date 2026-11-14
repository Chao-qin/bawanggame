(function () {
  var id = config.gameId;
  var gear = el("button", "", { id: "gear", title: tr("Настройки игры", "Game settings") });
  var panel = el("div", "", { id: "panel", hidden: true });
  var box = el("div", "panel-box", { tabIndex: -1 });
  panel.appendChild(box);
  function mount(root) {
    (root || document.querySelector(".runtime-overlay-root") || document.body).append(gear, panel);
  }
  mount();
  window.__XIAOCHAO_PANEL_MOUNT__ = mount;

  var startSize = null, btKey = "", btStatus = null, page = "main";
  var state = Settings.resolve(id);

  function el(tag, cls, props) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (props) Object.keys(props).forEach(function (k) { e[k] = props[k]; });
    return e;
  }

  function txt(tag, cls, text) {
    return el(tag, cls, { textContent: text });
  }

  function pretty(s) {
    return s ? s.replace("x", " × ") : tr("окно", "window");
  }

  function canvasSize() {
    var c = document.getElementById("canvas");
    return c.width + "x" + c.height;
  }

  function save(key, value) {
    Settings.setGame(id, key, value);
    state = Settings.resolve(id);
  }

  function setScreen(mode, size) {
    config.screenMode = mode;
    if (mode === "manual") config.screen = size;
    save("screen", mode === "manual" ? size : mode);
    ScreenSetup.apply();
    render();
  }

  var apply = {
    scale: function (v) {
      config.scale = parseFloat(v) || 1;
      ScreenSetup.refit();
    },
    keypad: function (v) {
      config.keypad = v | 0;
      document.getElementById("keypad").className = "keypad-" + config.keypad;
      ScreenSetup.refit();
    },
    orientation: function (v) {
      config.orientation = ["auto", "portrait", "landscape"].indexOf(v) >= 0 ? v : "auto";
      ScreenSetup.setOrientation(config.orientation);
    },
    theme: function (v) {
      config.theme = v || "classic";
      document.body.dataset.theme = config.theme;
    },
    fps: function (v) {
      config.fps = v | 0;
    },
    jit: function () {
      location.reload();
    },
    platform: function () {
      location.reload();
    },
    keyHold: function (v) {
      config.keyHold = Math.max(0, v | 0);
    },
    tapFrames: function (v) {
      config.tapFrames = Math.max(1, Math.min(4, v | 0)) || 1;
    },
    dpadOk: function (v) {
      config.dpadOk = v === "press" ? "press" : "tap";
    },
    keyRepeat: function (v) {
      config.keyRepeat = v === "0" ? "0" : "1";
    },
    repeatDelay: function (v) {
      config.repeatDelay = Math.max(0, v | 0);
    },
    repeatInterval: function (v) {
      config.repeatInterval = Math.max(16, v | 0);
    },
    vibrate: function (v) {
      config.vibrate = Math.max(0, v | 0);
    },
    wakeLock: function (v) {
      config.wakeLock = v === "1";
      if (window.ExtraSettings) ExtraSettings.wakeLock();
    },
    pixelated: function (v) {
      config.pixelated = v === "1";
      if (window.ExtraSettings) ExtraSettings.pixelated();
    },
    showFps: function (v) {
      config.showFps = v === "1";
      if (window.ExtraSettings) ExtraSettings.showFps();
    }
  };

  function head(title, sub, withBack) {
    var r = ScreenSetup.result();
    var h = el("div", "pb-head");
    if (withBack) {
      var b = el("button", "pb-close", { title: tr("Назад", "Back"), textContent: "‹" });
      b.addEventListener("click", back);
      h.appendChild(b);
    }
    var t = el("div", "pb-title");
    t.append(txt("b", "", title || r && r.name || config.jars.replace(/^.*[\/:]/, "").replace(/\.jar$/i, "")),
      txt("span", "", sub || tr("Настройки сохраняются для этой игры", "Settings are saved for this game", "设置按游戏单独保存")));
    var x = el("button", "pb-close", { title: tr("Закрыть", "Close"), textContent: "✕" });
    x.addEventListener("click", function () { toggle(false); });
    h.append(t, x);
    return h;
  }

  function go(v) {
    page = v;
    box.scrollTop = 0;
    render();
  }

  function back() {
    if (page !== "main") go("main");
    else toggle(false);
  }

  function propDefault(key) {
    var v = systemProperty(key);
    return v == null ? "" : String(v);
  }

  function propsChanged() {
    return JSON.stringify(Settings.props(id)) !== JSON.stringify(config.props || {});
  }

  function propRow(key, own) {
    var row = el("label", "prop");
    var name = el("span", "opt-name");
    name.append(txt("span", "prop-key", key));
    if (key in own) {
      var reset = el("button", "own", { type: "button", textContent: tr("своё ✕", "custom ✕"), title: tr("Вернуть значение по умолчанию", "Restore default") });
      reset.addEventListener("click", function (e) {
        e.preventDefault();
        Settings.setProp(id, key, null);
        render();
      });
      name.append(reset);
    }
    var def = propDefault(key);
    var input = el("input", "", { value: key in own ? own[key] : "", placeholder: def || tr("не задано", "not set"), spellcheck: false, autocomplete: "off", autocapitalize: "none" });
    input.addEventListener("change", function () {
      Settings.setProp(id, key, input.value === "" ? null : input.value);
      render();
    });
    row.append(name, input);
    return row;
  }

  function propsView() {
    var own = Settings.props(id);
    var keys = Settings.sysprops.slice();
    Object.keys(own).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); });
    var sec = el("section");
    if (propsChanged()) {
      var bar = el("div", "restart");
      var rb = txt("button", "", tr("Перезапустить", "Restart"));
      rb.addEventListener("click", function () { location.reload(); });
      bar.append(txt("span", "", tr("Свойства применятся после перезапуска игры.", "Properties apply after the game restarts.")), rb);
      sec.appendChild(bar);
    }
    var list = el("div", "props");
    keys.forEach(function (k) { list.appendChild(propRow(k, own)); });
    sec.appendChild(list);
    var add = el("form", "prop-add");
    var k = el("input", "", { placeholder: tr("Свойство", "Property"), spellcheck: false, autocomplete: "off", autocapitalize: "none" });
    var v = el("input", "", { placeholder: tr("Значение", "Value"), spellcheck: false, autocomplete: "off", autocapitalize: "none" });
    var ok = el("button", "", { type: "submit", textContent: tr("Добавить", "Add") });
    add.addEventListener("submit", function (e) {
      e.preventDefault();
      var key = k.value.trim();
      if (!key) return k.focus();
      Settings.setProp(id, key, v.value);
      render();
    });
    add.append(k, v, ok);
    sec.append(txt("h3", "", tr("Своё свойство", "Custom property")), add);
    box.append(head(tr("Системные свойства", "System properties"), tr("System.getProperty для этой игры", "System.getProperty for this game"), true), sec);
    if (Object.keys(own).length) {
      var f = el("div", "pb-foot");
      var reset = txt("button", "ghost", tr("Сбросить все свойства", "Reset all properties"));
      reset.addEventListener("click", function () {
        if (!reset.classList.contains("confirm")) {
          reset.classList.add("confirm");
          reset.textContent = tr("Точно сбросить?", "Reset?");
          return;
        }
        Settings.resetProps(id);
        render();
      });
      f.append(reset);
      box.appendChild(f);
    }
  }

  function segment() {
    var seg = el("div", "seg");
    [["auto", tr("Авто", "Auto")], ["manual", tr("Свой размер", "Custom")], ["fit", tr("По окну", "Fit window")]].forEach(function (o) {
      var b = txt("button", config.screenMode === o[0] ? "on" : "", o[1]);
      b.addEventListener("click", function () {
        if (o[0] === "manual") setScreen("manual", config.screenMode === "manual" ? config.screen : ScreenSetup.current() || canvasSize());
        else setScreen(o[0]);
      });
      seg.appendChild(b);
    });
    if (config.urlLocked.screen) seg.classList.add("locked");
    return seg;
  }

  function now() {
    var r = ScreenSetup.result();
    var size = config.screenMode === "fit" ? canvasSize() : ScreenSetup.current();
    var wrap = el("div", "scr-now");
    var big = txt("div", "scr-size", pretty(size));
    var src = "";
    if (config.urlLocked.screen) src = tr("Задано в адресе страницы", "Set in page URL");
    else if (config.screenMode === "manual") src = tr("Выбрано вручную", "Chosen manually");
    else if (config.screenMode === "fit") src = tr("Подстраивается под окно браузера", "Fits the browser window");
    else if (!r) src = tr("Определяется…", "Detecting…");
    else src = tr("Подобран автоматически", "Detected automatically");
    wrap.append(big, txt("div", "scr-src", src));
    return wrap;
  }

  function candidates() {
    var r = ScreenSetup.result();
    var box = el("div", "cands");
    if (!r) return box;
    var list = r.candidates.slice();
    if (r.observed && !list.some(function (c) { return c.size === r.observed; })) {
      list.push({ size: r.observed });
    }
    var others = list.filter(function (c) { return c.size !== ScreenSetup.current(); });
    if (others.length) {
      box.appendChild(txt("div", "sub", tr("Если картинка не та, попробуйте", "If the picture looks wrong, try")));
      var chips = el("div", "chips");
      others.forEach(function (c) {
        var b = txt("button", "chip", pretty(c.size));
        b.addEventListener("click", function () { setScreen("manual", c.size); });
        chips.appendChild(b);
      });
      box.appendChild(chips);
    }
    if (r.touch && config.keypad && !config.urlLocked.keypad) {
      var tip = el("div", "tip");
      var hide = txt("button", "ghost", tr("Скрыть", "Hide"));
      hide.addEventListener("click", function () {
        save("keypad", "0");
        apply.keypad("0");
        render();
      });
      tip.append(txt("span", "muted", tr("Игра сенсорная — экранная клавиатура ей не нужна.", "Touch game — the on-screen keypad is not needed.")), hide);
      box.appendChild(tip);
    }
    return box;
  }

  function manual() {
    var wrap = el("div", "manual");
    Settings.presets.forEach(function (g) {
      wrap.appendChild(txt("div", "sub", g.title));
      var chips = el("div", "chips");
      g.items.forEach(function (s) {
        var b = txt("button", "chip" + (config.screen === s ? " on" : ""), pretty(s));
        b.addEventListener("click", function () { setScreen("manual", s); });
        chips.appendChild(b);
      });
      wrap.appendChild(chips);
    });
    var cur = Settings.parse(config.screen) || [240, 320];
    var row = el("form", "custom");
    var w = el("input", "", { type: "number", min: 64, max: 2048, value: cur[0], inputMode: "numeric", title: tr("Ширина", "Width") });
    var h = el("input", "", { type: "number", min: 64, max: 2048, value: cur[1], inputMode: "numeric", title: tr("Высота", "Height") });
    var swap = el("button", "ghost", { type: "button", textContent: "⇄", title: tr("Поменять местами", "Swap") });
    var ok = el("button", "", { type: "submit", textContent: tr("Применить", "Apply") });
    swap.addEventListener("click", function () {
      setScreen("manual", cur[1] + "x" + cur[0]);
    });
    row.addEventListener("submit", function (e) {
      e.preventDefault();
      var a = Math.max(64, Math.min(2048, w.value | 0)), b = Math.max(64, Math.min(2048, h.value | 0));
      setScreen("manual", a + "x" + b);
    });
    row.append(txt("span", "sub", tr("Свой", "Custom")), w, txt("span", "", "×"), h, swap, ok);
    wrap.appendChild(row);
    return wrap;
  }

  function restart() {
    if (!startSize || startSize === canvasSize()) return null;
    var bar = el("div", "restart");
    var b = txt("button", "", tr("Перезапустить", "Restart"));
    b.addEventListener("click", function () { location.reload(); });
    bar.append(txt("span", "", tr("Игра запущена в " + pretty(startSize) + ". Новый размер точно заработает после перезапуска.", "The game started at " + pretty(startSize) + ". The new size will apply after a restart.")), b);
    return bar;
  }

  var BASE_KEYS = ["scale", "orientation", "theme", "keypad", "fps", "jit", "platform"];
  var FEEL_KEYS = ["keyHold", "tapFrames", "dpadOk", "keyRepeat", "repeatDelay", "repeatInterval", "vibrate"];
  var DEVICE_KEYS = ["wakeLock", "pixelated", "showFps"];
  var MANAGED = ["fps", "keyHold", "tapFrames", "dpadOk", "keyRepeat", "repeatDelay", "repeatInterval", "vibrate", "wakeLock", "pixelated", "showFps"];

  function flash(key) {
    var row = box.querySelector('.opt[data-key="' + key + '"]');
    if (!row) return;
    row.classList.remove("flash");
    void row.offsetWidth;
    row.classList.add("flash");
  }

  function activeProfile() {
    var found = "";
    Settings.profiles.forEach(function (p) {
      if (found) return;
      var keys = p.id === "classic" ? MANAGED : Object.keys(p.values);
      var ok = keys.every(function (k) {
        return state.values[k] === (p.id === "classic" ? Settings.defaults[k] : p.values[k]);
      });
      if (ok) found = p.id;
    });
    return found;
  }

  function applyProfile(p) {
    MANAGED.forEach(function (k) { Settings.setGame(id, k, null); });
    Object.keys(p.values).forEach(function (k) { Settings.setGame(id, k, p.values[k]); });
    state = Settings.resolve(id);
    MANAGED.forEach(function (k) { apply[k](state.values[k]); });
    render();
    Feedback.ok(tr("Профиль применён: ", "Preset applied: ", "已套用预设：") + p.label + " · " +
      (p.id === "classic"
        ? tr("все значения по умолчанию", "all defaults", "全部恢复默认")
        : Object.keys(p.values).length + tr(" настроек", " settings", " 项设置")));
  }

  function profileBar() {
    var sec = el("section", "preset-sec");
    sec.append(txt("h3", "", tr("Быстрый профиль", "Quick preset", "快捷预设")));
    var seg = el("div", "seg");
    var active = activeProfile();
    Settings.profiles.forEach(function (p) {
      var b = txt("button", p.id === active ? "on" : "", p.label);
      b.addEventListener("click", function () { applyProfile(p); });
      seg.appendChild(b);
    });
    sec.appendChild(seg);
    sec.appendChild(txt("div", "sub", tr("Одним нажатием меняет несколько настроек. Значения можно подправить ниже.", "Applies several settings at once; you can fine-tune them below.", "一键套用一组设置，下方仍可单独微调。")));
    return sec;
  }

  function showTextTest() {
    var old = document.getElementById("text-diag");
    if (old) old.remove();
    var r = document.getElementById("canvas").getBoundingClientRect();
    var ov = document.createElement("div");
    ov.id = "text-diag";
    ov.style.cssText = "left:" + r.left + "px;top:" + r.top + "px;width:" + r.width + "px;height:" + r.height + "px";
    function line(text, color, size) {
      var p = document.createElement("div");
      p.textContent = text;
      p.style.cssText = "margin:2px 0;color:" + color + ";font-size:" + size + "px;line-height:1.25";
      ov.appendChild(p);
    }
    line(tr("Проверка текста и окружения", "Text & environment check", "环境与文字自检"), "#8ef0a8", 13);
    line("中文测试 简体繁體 ABC abc 123 !@#", "#ffffff", 17);
    line("¥E¥si GBK / GB2312 / UTF-8", "#ffd76a", 13);
    var enc = (config.props && config.props["microedition.encoding"]) || systemProperty("microedition.encoding");
    line(tr("Кодировка", "Encoding", "编码属性") + ": " + enc, "#c9d1dd", 11);
    if (window.KeyTrace) {
      var lt = KeyTrace.lastTap();
      var okMode = String(config.dpadOk) === "press" ? tr("сразу", "press", "按下即确认") : tr("на отпускании", "release", "松手确认");
      line(tr("Ввод", "Input", "输入") + ": " + (KeyTrace.summary() || tr("нажмите направление дважды", "tap a direction twice", "连点两次方向试试")) +
        " · " + tr("кадр игры", "game frame", "游戏帧长") + " " + (KeyTrace.frameMs ? KeyTrace.frameMs() : "?") + "ms" +
        " · " + tr("кадров нажатия", "press frames", "按键帧数") + " " + (config.tapFrames || 1) +
        " · " + tr("центр", "centre", "中心") + " " + okMode,
        lt.at && lt.quick ? "#8ef0a8" : "#c9d1dd", 11);
    }
    if (window.TouchDiagnostics) {
      var td = TouchDiagnostics.last(), sz = TouchDiagnostics.sizes(), min = 9999;
      Object.keys(sz).forEach(function (k) { min = Math.min(min, sz[k][0], sz[k][1]); });
      line(tr("Касание / защита / мин. цель", "Touch / guard / min target", "接触/保护带/最小键") + ": " +
        td.contact + "px / " + td.guard + "px / " + min + "px (" + tr("блоков", "blocked", "拦截") + " " + td.blocked + ")", "#c9d1dd", 11);
    }
    var secure = !!window.isSecureContext;
    line(tr("Безопасный контекст", "Secure context", "安全上下文") + ": " + (secure ? tr("да (HTTPS/localhost)", "yes (HTTPS/localhost)", "是（HTTPS/localhost）") : tr("нет (HTTP по IP)", "no (HTTP over IP)", "否（HTTP/IP）")), secure ? "#8ef0a8" : "#ff9c99", 11);
    var worklet = false;
    try {
      var ac = new (window.AudioContext || window.webkitAudioContext)();
      worklet = !!ac.audioWorklet;
      ac.close();
    } catch (e) {}
    line("WakeLock / AudioWorklet: " + (navigator.wakeLock ? "✓" : "✗") + " / " + (worklet ? "✓" : "✗"), "#c9d1dd", 11);
    line(tr("Не реализовано API", "Unimplemented APIs", "未实现 API") + ": " + Feedback.unimplemented().length + " (" + tr("debug=1 покажет", "debug=1 shows them", "debug=1 可查看") + ")", "#c9d1dd", 11);
    if (window.GfxDiagnostics) {
      var g = GfxDiagnostics.stats();
      var bad = g.oob + g.zero;
      line(tr("Отрисовка", "Draw calls", "贴图绘制") + ": " + g.total + " · " +
        tr("за пределами атласа", "outside atlas", "越出图集") + " " + g.oob + " · " +
        tr("нулевой размер", "zero size", "零尺寸") + " " + g.zero,
        bad ? "#ff9c99" : "#8ef0a8", 11);
      line(tr("За кадром (норма для карты)", "Off-screen (normal for maps)", "画到屏外") + ": " + g.offscreen +
        (g.sources.length ? " · " + tr("атласы", "atlases", "图集") + " " +
          g.sources.map(function (s) { return s[0].replace("x", "×"); }).join(", ") : ""), "#c9d1dd", 11);
    } else {
      line(tr("Диагностика спрайтов: добавьте ?gfxdiag=1", "Sprite diagnostics: add ?gfxdiag=1", "贴图诊断：URL 加 ?gfxdiag=1 后重开"), "#c9d1dd", 11);
    }
    line(tr("Если китайский виден — дело в ресурсах игры", "Chinese visible? The game resources are at fault", "中文正常 → 模拟器没问题，问题在游戏资源"), "#8ef0a8", 11);
    (window.__XIAOCHAO_RUNTIME_MOUNT_OVERLAY__ || function (node) { (document.querySelector(".runtime-overlay-root") || document.body).appendChild(node); })(ov);
    setTimeout(function () { ov.remove(); }, 5000);
  }

  function diagRow() {
    var row = el("div", "opt");
    row.dataset.key = "diag";
    var name = el("span", "opt-name");
    name.append(txt("span", "", tr("Проверка текста", "Text self-test", "文字显示自检")));
    var btn = txt("button", "ghost", tr("Запустить", "Run", "运行"));
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      toggle(false);
      showTextTest();
      Feedback.ok(tr("Тест на 5 секунд", "Overlay shown for 5s", "已叠加显示 5 秒"));
    });
    row.append(name, btn);
    return row;
  }

  function selects(keys) {
    var wrap = el("div", "opts");
    (keys || BASE_KEYS).forEach(function (key) {
      var opt = Settings.options[key];
      var row = el("label", "opt");
      row.dataset.key = key;
      var name = el("span", "opt-name");
      name.append(txt("span", "", opt.label));
      if (state.own[key]) {
        var reset = el("button", "own", { type: "button", textContent: tr("своё ✕", "custom ✕"), title: tr("Вернуть значение по умолчанию", "Restore default") });
        reset.addEventListener("click", function (e) {
          e.preventDefault();
          save(key, null);
          apply[key](state.values[key]);
          render();
        });
        name.append(reset);
      }
      var sel = el("select");
      opt.items.forEach(function (it) {
        sel.appendChild(el("option", "", { value: it[0], textContent: it[1] }));
      });
      var query = new URLSearchParams(location.search);
      sel.value = !config.urlLocked[key] ? state.values[key]
        : key === "jit" ? (config.jit ? "1" : "0")
        : query.has(key) ? query.get(key)
        : String(config[key]);
      sel.disabled = !!config.urlLocked[key];
      sel.addEventListener("change", function () {
        save(key, sel.value);
        apply[key](sel.value);
        render();
        flash(key);
        Feedback.ok(opt.label + " → " + sel.options[sel.selectedIndex].text);
      });
      row.append(name, sel);
      wrap.appendChild(row);
    });
    return wrap;
  }

  function keymapView() {
    var sec = el("section");
    sec.appendChild(txt("h3", "", tr("Раскладка клавиш", "Keyboard mapping", "键盘映射")));
    var names = ["up", "down", "left", "right", "ok", "soft1", "soft2", "clear", "back"];
    var labels = { up: "↑", down: "↓", left: "←", right: "→", ok: "确认", soft1: "软键 1", soft2: "软键 2", clear: "清除", back: "返回" };
    var map = config.keymap || {};
    names.forEach(function (name) {
      var row = el("div", "keymap-row");
      var b = txt("button", "ghost", (labels[name] || name) + "：" + (map[name] || tr("未设置", "unset", "未设置")));
      b.type = "button";
      b.addEventListener("click", function () {
        b.textContent = (labels[name] || name) + "：" + tr("请按键…", "press a key…", "请按键…");
        function capture(e) {
          e.preventDefault(); e.stopPropagation();
          map[name] = e.code || e.key; config.keymap = map; Settings.setKeymap(id, map); b.textContent = (labels[name] || name) + "：" + map[name];
          window.removeEventListener("keydown", capture, true);
        }
        window.addEventListener("keydown", capture, true);
      });
      row.appendChild(b); sec.appendChild(row);
    });
    var reset = txt("button", "ghost", tr("恢复默认映射", "Restore defaults", "恢复默认映射"));
    reset.addEventListener("click", function () { Settings.setKeymap(id, null); config.keymap = {}; render(); });
    sec.appendChild(reset);
    return sec;
  }

  function linkText(st) {
    var link = !st.peers ? tr("нет связи с сервером", "no server connection") : st.via === "P2P" ? tr("напрямую (P2P)", "direct (P2P)") : st.via === "TURN" ? tr("через TURN", "via TURN") : tr("через сервер", "via server");
    return tr("Игроков: ", "Players: ") + st.peers + " · " + link + (st.via && st.rtt ? " · " + st.rtt + tr(" мс", " ms") : "");
  }

  function roomKey(st) {
    return st.room ? [st.room.mode, st.room.room, st.room.pass].join("\n") : "";
  }

  function bluetooth() {
    var st = BtRoom.state();
    btKey = roomKey(st);
    btStatus = null;
    if (!st.room) return null;
    var sec = el("section");
    var info = el("div", "bt-info");
    if (st.room.mode === "near") {
      info.appendChild(txt("b", "", tr("Рядом", "Nearby")));
    } else {
      [[tr("Комната", "Room"), st.room.room], [tr("Пароль", "Password"), st.room.pass]].forEach(function (p) {
        var line = el("div", "bt-line");
        line.append(txt("span", "muted", p[0]), txt("b", "bt-sel", p[1]));
        info.appendChild(line);
      });
    }
    btStatus = txt("span", "muted", linkText(st));
    info.appendChild(btStatus);
    var row = el("div", "bt-actions");
    var change = txt("button", "ghost", tr("Сменить комнату", "Change room"));
    change.addEventListener("click", function () {
      toggle(false);
      BtRoom.change();
    });
    row.appendChild(change);
    if (st.room.mode !== "near") {
      var cp = txt("button", "ghost", tr("Скопировать", "Copy"));
      cp.addEventListener("click", function () { BtRoom.copy(cp); });
      row.appendChild(cp);
    }
    sec.append(txt("h3", "", tr("Сетевая игра", "Multiplayer")), info, row);
    return sec;
  }

  function footer() {
    var f = el("div", "pb-foot");
    var reset = txt("button", "ghost", tr("Сбросить для этой игры", "Reset for this game"));
    reset.addEventListener("click", function () {
      if (!reset.classList.contains("confirm")) {
        reset.classList.add("confirm");
        reset.textContent = tr("Точно сбросить?", "Reset?");
        return;
      }
      var hadJit = state.own.jit || state.own.platform || Object.keys(Settings.props(id)).length;
      Settings.resetGame(id);
      if (hadJit) {
        location.reload();
        return;
      }
      state = Settings.resolve(id);
      config.screenMode = state.values.screen === "fit" ? "fit" : Settings.parse(state.values.screen) ? "manual" : "auto";
      if (config.screenMode === "manual") config.screen = state.values.screen;
       ["scale", "orientation", "theme", "keypad", "fps", "keyHold", "repeatDelay", "repeatInterval", "vibrate", "wakeLock", "pixelated", "showFps"].forEach(function (k) { apply[k](state.values[k]); });
      ScreenSetup.apply();
      render();
      Feedback.ok(tr("Настройки сброшены", "Settings reset", "已恢复默认设置"));
    });
    f.append(reset);
    return f;
  }

  function render() {
    if (panel.hidden) return;
    var scroll = box.scrollTop;
    box.textContent = "";
    if (page === "props") {
      propsView();
      box.scrollTop = scroll;
      if (!box.contains(document.activeElement)) box.focus({ preventScroll: true });
      return;
    }
    var scr = el("section");
    scr.append(txt("h3", "", tr("Экран", "Screen", "屏幕")), now(), segment());
    var rs = restart();
    if (rs) scr.appendChild(rs);
    if (config.screenMode === "auto") scr.appendChild(candidates());
    if (config.screenMode === "manual") scr.appendChild(manual());
    var view = el("section");
    view.append(txt("h3", "", tr("Изображение и управление", "Display and controls", "显示与控制")), selects(BASE_KEYS));
    view.appendChild(keymapView());
    var feel = el("section");
    feel.append(txt("h3", "", tr("Отклик клавиш", "Key response", "按键手感")), selects(FEEL_KEYS));
    var deviceOpts = selects(DEVICE_KEYS);
    deviceOpts.appendChild(diagRow());
    var device = el("section");
    device.append(txt("h3", "", tr("Устройство и отладка", "Device and debug", "设备与调试")), deviceOpts);
    var files = el("section");
    var fm = txt("button", "fm-open", tr("Открыть файлы телефона", "Open phone files"));
    fm.addEventListener("click", function () {
      toggle(false);
      Files.open();
    });
    files.append(txt("h3", "", tr("Файлы", "Files", "文件")), fm);
    var n = Object.keys(Settings.props(id)).length;
    var pb = txt("button", "fm-open ghost", tr("Системные свойства", "System properties", "系统属性") + (n ? " · " + n : ""));
    pb.addEventListener("click", function () { go("props"); });
    files.appendChild(pb);
    box.append(head(), profileBar());
    var bt = bluetooth();
    if (bt) box.appendChild(bt);
    box.append(scr, view, feel, device, files, footer());
    box.scrollTop = scroll;
    if (!box.contains(document.activeElement)) box.focus({ preventScroll: true });
  }

  function toggle(open) {
    if (!open) page = "main";
    panel.hidden = !open;
    document.body.classList.toggle("settings-open", open);
    gear.classList.toggle("on", open);
    if (open) render();
    else if (panel.contains(document.activeElement)) document.activeElement.blur();
  }

  window.__XIAOCHAO_OPEN_SETTINGS__ = function () {
    toggle(panel.hidden);
  };

  function place() {
    var c = document.getElementById("display").getBoundingClientRect();
    var s = 46, top = c.top >= s, right = innerWidth - c.right >= s, left = c.left >= s;
    gear.classList.toggle("left", !top && !right && left);
    gear.classList.toggle("over", !top && !right && !left);
  }

  BtRoom.watch(function (st) {
    gear.dataset.bt = !st.room ? "" : !st.peers ? "off" : st.via ? "direct" : "server";
    if (panel.hidden) return;
    if (btStatus && roomKey(st) === btKey) btStatus.textContent = linkText(st);
    else render();
  });
  ScreenSetup.onChange(function () {
    place();
    render();
  });
  window.addEventListener("resize", place);
  var origStarted = ScreenSetup.started;
  ScreenSetup.started = function () {
    startSize = canvasSize();
    origStarted();
    place();
  };

  gear.addEventListener("click", function () { toggle(panel.hidden); });
  var backdrop = false;
  panel.addEventListener("pointerdown", function (e) {
    backdrop = e.target === panel;
  });
  panel.addEventListener("click", function (e) {
    if (e.target === panel && backdrop) toggle(false);
  });
  panel.addEventListener("keydown", function (e) {
    e.stopPropagation();
    if (e.key === "Escape") back();
  });
  panel.addEventListener("keyup", function (e) { e.stopPropagation(); });
})();
