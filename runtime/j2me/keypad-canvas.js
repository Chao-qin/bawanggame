/*
 * Canvas renderer for the shared virtual keypad.
 *
 * The DOM buttons remain the hit and accessibility map. This layer owns the
 * pixels so layout, pressed state, and feedback do not depend on browser
 * button painting or mask hit testing.
 */
(function () {
  function roundedRect(ctx, x, y, w, h, radius) {
    var r = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function init() {
    if (window.KeypadCanvas && window.KeypadCanvas.destroy) window.KeypadCanvas.destroy();
    var canvas = document.getElementById("keypad-canvas");
    var pad = document.getElementById("keypad");
    var phone = document.getElementById("phone");
    if (!canvas || !pad || !phone || !canvas.getContext) return;

    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    var frame = 0;
    var destroyed = false;
    var observer = null;
    var resizeObserver = null;
    var dpr = 1;
    var labels = {
      num1: ["1", ".,?"], num2: ["2", "abc"], num3: ["3", "def"],
      num4: ["4", "ghi"], num5: ["5", "jkl"], num6: ["6", "mno"],
      num7: ["7", "pqrs"], num8: ["8", "tuv"], num9: ["9", "wxyz"],
      star: ["*", "+"], num0: ["0", "_"], pound: ["#", "^"]
    };

    function schedule() {
      if (!destroyed && !pad.classList.contains("keypad-canvas-mode")) pad.classList.add("keypad-canvas-mode");
      if (destroyed || frame) return;
      frame = window.requestAnimationFrame ? window.requestAnimationFrame(render) : window.setTimeout(render, 16);
    }

    function rectFor(id, base) {
      var node = document.getElementById(id);
      if (!node) return null;
      var r = node.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return { node: node, x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
    }

    function colors() {
      var style = getComputedStyle(document.body);
      return {
        panel: style.getPropertyValue("--phone-panel").trim() || "#303846",
        key: style.getPropertyValue("--phone-key").trim() || "#353c4b",
        active: style.getPropertyValue("--phone-key-active").trim() || "#4a78c2",
        text: style.getPropertyValue("--phone-text").trim() || "#e8ecf2",
        dim: "#8995a8"
      };
    }

    function paintButton(item, color, radius) {
      if (!item) return;
      var active = item.node.classList.contains("down") || item.node.classList.contains("tap");
      ctx.fillStyle = active ? color.active : color.key;
      roundedRect(ctx, item.x, item.y, item.w, item.h, radius);
      ctx.fill();
    }

    function drawArrow(item, id, color) {
      if (!item) return;
      var active = item.node.classList.contains("down");
      var cx = item.x + item.w / 2, cy = item.y + item.h / 2;
      var size = Math.max(5, Math.min(item.w, item.h) * 0.2);
      ctx.strokeStyle = active ? "#081018" : color.text;
      ctx.lineWidth = Math.max(2, size * 0.22);
      ctx.lineCap = "square";
      ctx.beginPath();
      if (id === "up" || id === "down") {
        var dy = id === "up" ? -1 : 1;
        ctx.moveTo(cx - size, cy + dy * size * 0.45);
        ctx.lineTo(cx, cy - dy * size * 0.45);
        ctx.lineTo(cx + size, cy + dy * size * 0.45);
      } else {
        var dx = id === "left" ? -1 : 1;
        ctx.moveTo(cx + dx * size * 0.45, cy - size);
        ctx.lineTo(cx - dx * size * 0.45, cy);
        ctx.lineTo(cx + dx * size * 0.45, cy + size);
      }
      ctx.stroke();
    }

    function drawDpad(base, color) {
      var dpad = rectFor("dpad", base);
      if (!dpad) return;
      var cx = dpad.x + dpad.w / 2, cy = dpad.y + dpad.h / 2, radius = Math.min(dpad.w, dpad.h) / 2;
      var gradient = ctx.createRadialGradient(cx + radius * 0.25, cy - radius * 0.35, 1, cx, cy, radius);
      gradient.addColorStop(0, "#3a4253");
      gradient.addColorStop(1, "#262c38");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      [
        [cx - radius * 0.25, cy - radius * 0.25], [cx + radius * 0.25, cy - radius * 0.25],
        [cx - radius * 0.25, cy + radius * 0.25], [cx + radius * 0.25, cy + radius * 0.25]
      ].forEach(function (dot) {
        ctx.fillStyle = "rgba(150,195,255,.45)";
        ctx.beginPath(); ctx.arc(dot[0], dot[1], Math.max(2, radius * 0.035), 0, Math.PI * 2); ctx.fill();
      });
      ["up", "left", "right", "down"].forEach(function (id) {
        paintButton(rectFor(id, base), color, 0);
        drawArrow(rectFor(id, base), id, color);
      });
      var ok = rectFor("ok", base);
      if (ok) {
        ctx.fillStyle = ok.node.classList.contains("down") ? color.active : "#333a48";
        ctx.beginPath(); ctx.arc(ok.x + ok.w / 2, ok.y + ok.h / 2, Math.min(ok.w, ok.h) * 0.42, 0, Math.PI * 2); ctx.fill();
      }
    }

    function drawTextButton(item, text, color, size, weight) {
      if (!item) return;
      paintButton(item, color, Math.min(item.w, item.h) * 0.18);
      ctx.fillStyle = color.text;
      ctx.font = (weight || 600) + " " + Math.max(11, size) + "px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, item.x + item.w / 2, item.y + item.h / 2);
    }

    function drawSoft(item, color) {
      if (!item) return;
      paintButton(item, color, Math.min(item.w, item.h) * 0.18);
      ctx.strokeStyle = color.text;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = Math.max(2, item.h * 0.06);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(item.x + item.w * 0.32, item.y + item.h / 2);
      ctx.lineTo(item.x + item.w * 0.68, item.y + item.h / 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    function drawNumbers(base, color) {
      Object.keys(labels).forEach(function (id) {
        var item = rectFor(id, base), label = labels[id];
        if (!item) return;
        paintButton(item, color, Math.min(item.w, item.h) * 0.28);
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.fillStyle = color.text;
        ctx.font = "500 " + Math.max(15, item.h * 0.45) + "px system-ui, sans-serif";
        ctx.fillText(label[0], item.x + item.w * 0.35, item.y + item.h / 2);
        ctx.fillStyle = color.dim;
        ctx.font = "normal " + Math.max(9, item.h * 0.24) + "px system-ui, sans-serif";
        ctx.fillText(label[1], item.x + item.w * 0.56, item.y + item.h / 2 + item.h * 0.03);
      });
    }

    function render() {
      frame = 0;
      if (destroyed) return;
      var canvasRect = canvas.getBoundingClientRect();
      if (!canvasRect.width || !canvasRect.height) canvasRect = phone.getBoundingClientRect();
      if (!canvasRect.width || !canvasRect.height) return;
      dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      var width = Math.round(canvasRect.width), height = Math.round(canvasRect.height);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
        canvas.style.width = width + "px"; canvas.style.height = height + "px";
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      var color = colors();
      drawDpad(canvasRect, color);
      drawSoft(rectFor("choice", canvasRect), color);
      drawSoft(rectFor("back", canvasRect), color);
      drawTextButton(rectFor("ret", canvasRect), "↩", color, 18, 600);
      drawTextButton(rectFor("clear", canvasRect), "C", color, 18, 600);
      drawNumbers(canvasRect, color);
    }

    pad.classList.add("keypad-canvas-mode");
    observer = new MutationObserver(schedule);
    observer.observe(pad, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style"] });
    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(schedule);
      resizeObserver.observe(pad);
      resizeObserver.observe(phone);
    }
    window.addEventListener("xiaochao:viewportchange", schedule);
    window.KeypadCanvas = {
      refresh: schedule,
      destroy: function () {
        destroyed = true;
        if (frame) {
          (window.cancelAnimationFrame || window.clearTimeout)(frame);
          frame = 0;
        }
        if (observer) observer.disconnect();
        if (resizeObserver) resizeObserver.disconnect();
        window.removeEventListener("xiaochao:viewportchange", schedule);
        pad.classList.remove("keypad-canvas-mode");
        if (window.KeypadCanvas && window.KeypadCanvas.destroy === this.destroy) delete window.KeypadCanvas;
      }
    };
    schedule();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
