(function () {
  "use strict";
  function boot() {
    if (!window.config || !config.gameId) return;
    var items = [document.getElementById("display-container"), document.getElementById("keypad")];
    var key = "j2me.layout." + config.gameId;
    var state = {};
    try { state = JSON.parse(localStorage.getItem(key) || "{}"); } catch (_) {}
    function apply() {
      items.forEach(function (el) {
        if (!el) return;
        var p = state[el.id];
        if (config.layout !== "free" || !p) return;
        el.style.left = p.x + "px";
        el.style.top = p.y + "px";
        el.style.right = "auto";
        el.style.bottom = "auto";
      });
    }
    function save() { try { localStorage.setItem(key, JSON.stringify(state)); } catch (_) {} }
    items.forEach(function (el) {
      if (!el) return;
      el.addEventListener("pointerdown", function (e) {
        if (config.layout !== "free" || e.target.closest("button,input,textarea,select")) return;
        var r = el.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
        el.setPointerCapture(e.pointerId);
        function move(ev) {
          state[el.id] = { x: Math.round(ev.clientX - sx), y: Math.round(ev.clientY - sy) };
          apply();
        }
        function end() { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", end); save(); }
        el.addEventListener("pointermove", move); el.addEventListener("pointerup", end);
      });
    });
    window.LayoutEditor = { reset: function () { state = {}; save(); items.forEach(function (el) { if (el) { el.style.left = el.style.top = el.style.right = el.style.bottom = ""; } }); } };
    apply();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
