(function () {
  var host = null;
  var hideTimer = null;
  var clearTimer = null;
  var unimplemented = [];
  var debug = /[?&]debug=1(?:&|$)/.test(location.search);
  var nativeWarn = console.warn;

  console.warn = function () {
    var msg = arguments[0];
    if (typeof msg === "string" && / not implemented/.test(msg)) {
      if (unimplemented.indexOf(msg) < 0) unimplemented.push(msg);
      if (!debug) return;
    }
    return nativeWarn.apply(console, arguments);
  };

  function toast(message, kind) {
    if (!host) {
      host = document.createElement("div");
      host.id = "fb-toast";
      host.setAttribute("role", "status");
      host.setAttribute("aria-live", "polite");
      host.hidden = true;
      document.body.appendChild(host);
    }
    clearTimeout(hideTimer);
    clearTimeout(clearTimer);
    host.textContent = message;
    host.className = kind === "error" ? "error" : kind === "ok" ? "ok" : "";
    host.hidden = false;
    host.style.animation = "none";
    void host.offsetWidth;
    host.style.animation = "";
    hideTimer = setTimeout(function () {
      host.classList.add("out");
      clearTimer = setTimeout(function () {
        host.hidden = true;
        host.classList.remove("out");
      }, 220);
    }, 2400);
  }

  window.Feedback = {
    toast: toast,
    ok: function (m) { toast(m, "ok"); },
    error: function (m) { toast(m, "error"); },
    unimplemented: function () { return unimplemented.slice(); }
  };
})();
