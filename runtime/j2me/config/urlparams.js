(function () {
  var query = new URLSearchParams(location.search);
  config.jars = window.__XIAOCHAO_RUNTIME_JAR || query.get("jar") || "";
  if (!config.jars) {
    if (!window.__XIAOCHAO_RUNTIME__) location.replace("index.html");
    return;
  }
  config.args = [];
  if (query.get("gldebug") === "1") config.glDebug = true;
  config.gameId = LocalJars.storageId(config.jars.replace(/^(jar\/|local:)/, ""));
  var r = Settings.resolve(config.gameId);
  var v = r.values;
  config.urlLocked = {};
  Settings.keys.forEach(function (k) {
    if (query.has(k)) {
      v[k] = query.get(k);
      config.urlLocked[k] = true;
    }
  });
  config.screenMode = v.screen === "auto" || v.screen === "fit" ? v.screen : Settings.parse(v.screen) ? "manual" : "auto";
  config.screen = config.screenMode === "manual" ? v.screen : config.screenMode === "fit" ? "" : "240x320";
  config.scale = parseFloat(v.scale) || 1;
  config.keypad = v.keypad | 0;
  config.orientation = ["auto", "portrait", "landscape"].indexOf(v.orientation) >= 0 ? v.orientation : "auto";
  config.theme = v.theme || "classic";
  config.jit = v.jit !== "0";
  config.fps = v.fps | 0;
  config.keyHold = Math.max(0, v.keyHold | 0);
  config.tapFrames = Math.max(1, Math.min(4, v.tapFrames | 0)) || 1;
  config.dpadOk = v.dpadOk === "press" ? "press" : "tap";
  config.keyRepeat = v.keyRepeat === "0" ? "0" : "1";
  config.repeatDelay = Math.max(0, v.repeatDelay | 0);
  config.repeatInterval = Math.max(16, v.repeatInterval | 0);
  config.vibrate = Math.max(0, v.vibrate | 0);
  config.wakeLock = v.wakeLock === "1";
  config.pixelated = v.pixelated === "1";
  config.showFps = v.showFps === "1";
  var platform = Settings.platforms[v.platform];
  config.platform = platform ? platform.ua : v.platform || Settings.platforms.se.ua;
  config.keys = (platform || Settings.platforms.se).keys;
  config.keymap = Settings.keymap(config.gameId);
  config.touchLayout = Settings.touchLayout(config.gameId);
  config.props = Settings.props(config.gameId);
})();
