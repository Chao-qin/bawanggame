(function () {
  var canvas = document.getElementById("canvas");
  var hud = null;
  var sentinel = null;

  function pixelated() {
    canvas.style.imageRendering = config.pixelated ? "pixelated" : "";
  }

  function showFps() {
    if (hud) hud.hidden = !config.showFps;
  }

  function wakeLock() {
    if (!navigator.wakeLock) {
      if (config.wakeLock && !window.__wakeWarned && window.Feedback) {
        window.__wakeWarned = true;
        setTimeout(function () {
          Feedback.error(tr("Экран не будет погашен: нужен HTTPS или localhost", "Keep screen on unavailable: HTTPS or localhost required", "屏幕常亮不可用：需 HTTPS 或 localhost"));
        }, 120);
      }
      return;
    }
    if (!config.wakeLock || document.hidden) {
      if (sentinel) {
        sentinel.release().catch(function () {});
        sentinel = null;
      }
      return;
    }
    if (sentinel) return;
    navigator.wakeLock.request("screen").then(function (s) {
      sentinel = s;
      s.addEventListener("release", function () {
        if (sentinel === s) sentinel = null;
      });
      if (!config.wakeLock || document.hidden) {
        s.release().catch(function () {});
        sentinel = null;
      }
    }).catch(function () {});
  }

  function init() {
    hud = document.createElement("div");
    hud.id = "fps-hud";
    hud.hidden = true;
    document.body.appendChild(hud);

    var last = MIDP.frames | 0;
    var prev = performance.now();
    setInterval(function () {
      var now = performance.now();
      var frames = MIDP.frames | 0;
      if (config.showFps) {
        hud.textContent = Math.round((frames - last) * 1000 / (now - prev)) + " fps";
      }
      last = frames;
      prev = now;
    }, 1000);

    document.addEventListener("visibilitychange", wakeLock);
    pixelated();
    showFps();
    wakeLock();
  }

  window.ExtraSettings = {
    pixelated: pixelated,
    showFps: showFps,
    wakeLock: wakeLock
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
