var Settings = (function () {
  var GLOBAL = "j2me.settings";
  var GAME = "j2me.game.";
  var phone = window.matchMedia && matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 800;
  var DEFAULTS = {
    screen: "auto", scale: phone ? "99" : "2", keypad: "3", orientation: "auto", theme: "classic", fps: "0", jit: "1", platform: "se",
    keyHold: "60", tapFrames: "1", dpadOk: "press", keyRepeat: "1", repeatDelay: "450", repeatInterval: "100", vibrate: phone ? "24" : "0",
    wakeLock: "0", pixelated: "0", showFps: "0"
  };
  var STD = { up: -1, down: -2, left: -3, right: -4, ok: -5, soft1: -6, soft2: -7, clear: -8, back: -11 };
  var PLATFORMS = {
    se: { ua: "SonyEricssonK800i/R1KG001", keys: STD },
    nokia: { ua: "Nokia6300/07.21", keys: STD },
    samsung: { ua: "SAMSUNG-SGH-E250", keys: STD },
    siemens: { ua: "SIE-S65/50", keys: { up: -59, down: -60, left: -61, right: -62, ok: -26, soft1: -1, soft2: -4, clear: -8, back: -12 } },
    motorola: { ua: "MOT-V3/08.B7.58R", keys: { up: -1, down: -6, left: -2, right: -5, ok: -20, soft1: -21, soft2: -22, clear: -8, back: -11 } },
    lg: { ua: "LG-KG800", keys: { up: -1, down: -2, left: -3, right: -4, ok: -5, soft1: -202, soft2: -203, clear: -204, back: -11 } }
  };
  var OPTIONS = {
    scale: {
      label: tr("Масштаб", "Scale", "缩放"),
      items: [["0.5", "×0.5"], ["0.75", "×0.75"], ["1", "×1"], ["1.5", "×1.5"], ["2", "×2"], ["3", "×3"], ["99", tr("Максимальный", "Maximum", "最大")]]
    },
    orientation: {
      label: tr("屏幕方向", "Orientation", "屏幕方向"),
      items: [["auto", tr("跟随设备", "Follow device", "跟随设备")], ["portrait", tr("竖屏", "Portrait", "竖屏")], ["landscape", tr("横屏", "Landscape", "横屏")]]
    },
    theme: {
      label: tr("Тема", "Theme", "主题"),
      items: [["classic", tr("Классика", "Classic", "经典")], ["glass", tr("Стекло", "Glass", "玻璃")], ["pixel", tr("Пиксель", "Pixel", "像素")], ["amoled", "AMOLED"]]
    },
    keypad: {
      label: tr("Клавиатура", "Keypad", "虚拟键盘"),
      items: [["0", tr("Скрыта", "Hidden", "隐藏")], ["1", tr("Маленькая", "Small", "小")], ["2", tr("Средняя", "Medium", "中")], ["3", tr("Большая", "Large", "大")], ["4", tr("Огромная", "Huge", "超大")]]
    },
    fps: {
      label: tr("Частота кадров", "Frame rate", "帧率限制"),
      items: [["0", tr("Без ограничения", "Unlimited", "不限")], ["15", "15"], ["20", "20"], ["25", "25"], ["30", "30"]]
    },
    jit: {
      label: tr("Ускорение", "Acceleration", "JIT 加速"),
      items: [["1", tr("Включено", "On", "开")], ["0", tr("Выключено", "Off", "关")]]
    },
    platform: {
      label: tr("Платформа", "Platform", "机型"),
      items: [["se", "Sony Ericsson"], ["nokia", "Nokia"], ["samsung", "Samsung"], ["siemens", "Siemens"], ["motorola", "Motorola"], ["lg", "LG"]]
    },
    keyHold: {
      label: tr("Окно удержания", "Hold window", "容错窗口"),
      items: [["60", "60 ms · " + tr("резко", "snappy", "跟手")], ["90", "90 ms"], ["120", "120 ms"], ["180", "180 ms · " + tr("гладко", "smooth", "防抖")]]
    },
    tapFrames: {
      label: tr("Кадры нажатия", "Press frames", "按键帧数"),
      items: [["1", "1 · " + tr("быстро", "fast", "灵敏")], ["2", "2 · " + tr("средне", "balanced", "均衡")], ["3", "3 · " + tr("надёжно", "safe", "稳定")]]
    },
    dpadOk: {
      label: tr("Центр D-pad", "D-pad centre", "方向中心键"),
      items: [["tap", tr("на отпускании", "confirm on release", "松手确认")], ["press", tr("сразу", "confirm on press", "按下确认")]]
    },
    keyRepeat: {
      label: tr("Автоповтор", "Key repeat", "长按连发"),
      items: [["1", tr("Вкл.", "On", "开")], ["0", tr("Выкл.", "Off", "关")]]
    },
    repeatDelay: {
      label: tr("До повтора", "Repeat delay", "长按延迟"),
      items: [["250", "250 ms"], ["350", "350 ms"], ["450", "450 ms"], ["600", "600 ms"]]
    },
    repeatInterval: {
      label: tr("Интервал повтора", "Repeat interval", "连发间隔"),
      items: [["50", "50 ms"], ["75", "75 ms"], ["100", "100 ms"], ["150", "150 ms"], ["200", "200 ms"]]
    },
    vibrate: {
      label: tr("Вибрация клавиш", "Key vibration", "按键振动"),
      items: [["0", tr("Выкл.", "Off", "关")], ["10", "10 ms"], ["16", "16 ms"], ["20", "20 ms"], ["24", "24 ms"], ["40", "40 ms"]]
    },
    wakeLock: {
      label: tr("Не гасить экран", "Keep screen on", "屏幕常亮"),
      items: [["0", tr("Выкл.", "Off", "关")], ["1", tr("Вкл.", "On", "开")]]
    },
    pixelated: {
      label: tr("Масштабирование", "Scaling", "画面缩放"),
      items: [["0", tr("Сглаживание", "Smooth", "平滑")], ["1", tr("Пиксели", "Pixelated", "像素化")]]
    },
    showFps: {
      label: tr("Счётчик FPS", "FPS counter", "帧率显示"),
      items: [["0", tr("Выкл.", "Off", "关")], ["1", tr("Вкл.", "On", "开")]]
    }
  };
  var SYSPROPS = [
    "microedition.locale", "microedition.platform", "microedition.encoding", "microedition.profiles", "microedition.configuration",
    "com.sun.cldc.util.j2me.TimeZoneImpl.timezone", "fileconn.dir.memorycard", "fileconn.dir.photos", "com.nokia.mid.imei", "com.nokia.mid.imsi", "com.nokia.mid.batterylevel"
  ];
  var PORTRAIT = [
    [96, 65], [101, 80], [128, 128], [128, 160], [132, 176], [176, 204], [176, 208], [176, 220], [208, 208],
    [240, 260], [240, 320], [240, 400], [240, 432], [320, 480], [352, 416], [360, 640], [480, 640], [480, 800]
  ];
  var PRESETS = [
    { title: tr("Кнопочные", "Keypad phones"), items: ["128x128", "128x160", "176x208", "176x220", "208x208", "240x320", "352x416"] },
    { title: tr("Альбомные", "Landscape"), items: ["220x176", "320x240", "400x240", "416x352", "640x360", "800x480"] },
    { title: tr("Сенсорные", "Touch"), items: ["240x400", "240x432", "320x480", "360x640", "480x640", "480x800"] }
  ];
  var PROFILES = [
    { id: "classic", label: tr("Оригинал", "Original", "原味"), values: {} },
    { id: "responsive", label: tr("Быстрый", "Responsive", "灵敏"), values: {
      keyHold: "60", tapFrames: "1", keyRepeat: "1", repeatDelay: "250", repeatInterval: "50", vibrate: "20",
      wakeLock: "1", pixelated: "1", showFps: "1"
    } },
    { id: "retro", label: tr("Ретро", "Retro", "怀旧"), values: {
      keyHold: "120", tapFrames: "2", keyRepeat: "1", repeatDelay: "600", repeatInterval: "200", vibrate: "0",
      wakeLock: "0", pixelated: "1", showFps: "0", fps: "30"
    } }
  ];

  function read(key) {
    try {
      return JSON.parse(localStorage.getItem(key)) || {};
    } catch (e) {
      return {};
    }
  }

  function write(key, v) {
    try {
      if (v && Object.keys(v).length) localStorage.setItem(key, JSON.stringify(v));
      else localStorage.removeItem(key);
    } catch (e) {}
  }

  function global() {
    var stored = read(GLOBAL), out = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      out[k] = k in stored ? String(stored[k]) : DEFAULTS[k];
    });
    out.screen = DEFAULTS.screen;
    return out;
  }

  // 输入内核改用「帧同步」后，旧的时序参数（短按保底 250ms、中心键松手确认）
  // 会让手感退回到旧版本。给每个游戏的存档做一次性迁移，把这几项清掉回落到新默认。
  var INPUT_REV = 2;
  var HOLD_MS = ["60", "90", "120", "180"];

  function game(id) {
    if (!id) return {};
    var own = read(GAME + id);
    if (own.__iv !== INPUT_REV) {
      delete own.dpadOk;
      delete own.keyHold;
      delete own.tapFrames;
      own.__iv = INPUT_REV;
      write(GAME + id, own);
    }
    return own;
  }

  function resolve(id) {
    var g = global(), own = game(id), out = {}, mine = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      mine[k] = k in own;
      out[k] = mine[k] ? String(own[k]) : g[k];
    });
    if (HOLD_MS.indexOf(String(out.keyHold)) < 0) out.keyHold = DEFAULTS.keyHold;
    return { values: out, own: mine };
  }

  function setGame(id, key, value) {
    var own = game(id);
    if (value == null) delete own[key];
    else own[key] = String(value);
    write(GAME + id, own);
  }

  function resetGame(id) {
    write(GAME + id, null);
  }

  function props(id) {
    return game(id).props || {};
  }

  function setProp(id, key, value) {
    var own = game(id), p = own.props || {};
    if (value == null) delete p[key];
    else p[key] = String(value);
    if (Object.keys(p).length) own.props = p;
    else delete own.props;
    write(GAME + id, own);
  }

  function resetProps(id) {
    var own = game(id);
    delete own.props;
    write(GAME + id, own);
  }

  function keymap(id) {
    var own = game(id);
    return own.keymap && typeof own.keymap === "object" ? own.keymap : {};
  }

  function setKeymap(id, value) {
    var own = game(id);
    if (value && Object.keys(value).length) own.keymap = value;
    else delete own.keymap;
    write(GAME + id, own);
  }

  function touchLayout(id) {
    var own = game(id);
    return own.touchLayout && typeof own.touchLayout === "object" ? own.touchLayout : {};
  }

  function setTouchLayout(id, value) {
    var own = game(id);
    if (value && typeof value === "object") own.touchLayout = value;
    else delete own.touchLayout;
    write(GAME + id, own);
  }

  function makeGlobal(values) {
    write(GLOBAL, values);
  }

  function parse(v) {
    var m = /^(\d{2,4})x(\d{2,4})$/.exec(v || "");
    return m ? [+m[1], +m[2]] : null;
  }

  return {
    keys: Object.keys(DEFAULTS), options: OPTIONS, platforms: PLATFORMS, defaults: DEFAULTS, presets: PRESETS, profiles: PROFILES, portrait: PORTRAIT,
    global: global, game: game, resolve: resolve, setGame: setGame, resetGame: resetGame, makeGlobal: makeGlobal, parse: parse,
    props: props, setProp: setProp, resetProps: resetProps, keymap: keymap, setKeymap: setKeymap,
    touchLayout: touchLayout, setTouchLayout: setTouchLayout, sysprops: SYSPROPS
  };
})();
