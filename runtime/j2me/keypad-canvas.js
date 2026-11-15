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
        theme: document.body.dataset.theme || "classic",
        panel: style.getPropertyValue("--phone-panel").trim() || "#303846",
        key: style.getPropertyValue("--phone-key").trim() || "#353c4b",
        active: style.getPropertyValue("--phone-key-active").trim() || "#4a78c2",
        text: style.getPropertyValue("--phone-text").trim() || "#e8ecf2",
        dim: "#8995a8"
      };
    }

    function parsePx(value, fallback) {
      var parsed = parseFloat(value);
      return isFinite(parsed) && parsed > 0 ? parsed : fallback;
    }

    function textStyles() {
      var root = getComputedStyle(pad);
      var unit = parsePx(root.getPropertyValue("--u"), 30);
      var mini = document.getElementById("ret") || document.querySelector("#keypad .mini");
      var number = document.querySelector("#numpad b") || document.querySelector("#numpad .key");
      var auxiliary = document.querySelector("#numpad i") || number;
      var miniStyle = mini ? getComputedStyle(mini) : null;
      var numberStyle = number ? getComputedStyle(number) : null;
      var auxiliaryStyle = auxiliary ? getComputedStyle(auxiliary) : null;
      var family = (miniStyle && miniStyle.fontFamily) || "system-ui, -apple-system, \"Segoe UI\", Roboto, Arial, sans-serif";
      return {
        unit: unit,
        family: family,
        mini: {
          size: parsePx(miniStyle && miniStyle.fontSize, unit * 0.36),
          weight: (miniStyle && miniStyle.fontWeight) || "600"
        },
        number: {
          size: parsePx(numberStyle && numberStyle.fontSize, unit * 0.45),
          weight: (numberStyle && numberStyle.fontWeight) || "500"
        },
        auxiliary: {
          size: parsePx(auxiliaryStyle && auxiliaryStyle.fontSize, unit * 0.24),
          weight: (auxiliaryStyle && auxiliaryStyle.fontWeight) || "400"
        }
      };
    }

    function font(styles, role, size) {
      var style = styles[role] || styles.mini;
      return (style.weight || "400") + " " + Math.max(9, size || style.size) + "px " + styles.family;
    }

    function makeGradient(top, bottom, x, y, h) {
      var fill = ctx.createLinearGradient(0, y, 0, y + h);
      fill.addColorStop(0, top);
      fill.addColorStop(1, bottom);
      return fill;
    }

    function paintButton(item, color, radius, kind) {
      if (!item) return;
      var active = item.node.classList.contains("down") || item.node.classList.contains("tap");
      var y = active && kind !== "dir" ? item.y + 1 : item.y;
      var activeDir = active && kind === "dir";
      var themed = color.theme !== "classic";
      var top = activeDir ? "rgba(74,120,194,.55)" : active ? (themed ? color.active : "#4a78c2") : (kind === "soft" ? "#3a4253" : kind === "dir" ? color.panel : themed ? color.key : "#353c4b");
      var bottom = activeDir ? top : active ? (themed ? color.active : "#3a62a3") : (kind === "soft" ? "#2b313e" : kind === "dir" ? color.panel : themed ? color.key : "#282e3a");
      ctx.fillStyle = top === bottom ? top : makeGradient(top, bottom, item.x, y, item.h);
      ctx.shadowColor = "rgba(13,16,21,.9)";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = activeDir ? 0 : active ? 1 : 2;
      roundedRect(ctx, item.x, y, item.w, item.h, radius);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.shadowOffsetY = 0;
    }

    function drawArrow(item, id, color, styles) {
      if (!item) return;
      var active = item.node.classList.contains("down");
      var cx = item.x + item.w / 2, cy = item.y + item.h / 2;
      var size = Math.max(5, Math.min(styles.unit * 0.22, Math.min(item.w, item.h) * 0.25));
      ctx.strokeStyle = active ? "#081018" : color.text;
      ctx.lineWidth = Math.max(2, Math.min(3, styles.unit * 0.1));
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
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

    function drawDpad(base, color, styles) {
      var dpad = rectFor("dpad", base);
      if (!dpad) return;
      var cx = dpad.x + dpad.w / 2, cy = dpad.y + dpad.h / 2, radius = Math.min(dpad.w, dpad.h) / 2;
      var dpadGradient = ctx.createRadialGradient(cx + radius * 0.25, cy - radius * 0.35, 1, cx, cy, radius);
      dpadGradient.addColorStop(0, "#3a4253");
      dpadGradient.addColorStop(1, "#262c38");
      ctx.fillStyle = dpadGradient;
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
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();
      ["up", "left", "right", "down"].forEach(function (id) {
        var item = rectFor(id, base);
        paintButton(item, color, 0, "dir");
        drawArrow(item, id, color, styles);
      });
      var ok = rectFor("ok", base);
      if (ok) {
        var active = ok.node.classList.contains("down");
        ctx.fillStyle = makeGradient(active ? "#4a78c2" : "#4a5466", active ? "#3a62a3" : "#333a48", ok.x, ok.y, ok.h);
        ctx.shadowColor = "rgba(0,0,0,.4)";
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;
        ctx.beginPath(); ctx.arc(ok.x + ok.w / 2, ok.y + ok.h / 2, Math.min(ok.w, ok.h) * 0.42, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    }

    function drawTextButton(item, text, color, styles, role, kind) {
      if (!item) return;
      paintButton(item, color, Math.min(item.w, item.h) * 0.18, kind);
      drawTextLabel(item, text, color, styles, role);
    }

    function drawTextLabel(item, text, color, styles, role) {
      if (!item) return;
      ctx.fillStyle = color.text;
      ctx.font = font(styles, role || "mini");
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, item.x + item.w / 2, item.y + item.h / 2);
    }

    function drawSoft(item, color) {
      if (!item) return;
      paintButton(item, color, Math.min(item.w, item.h) * 0.18, "soft");
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

    function drawNumbers(base, color, styles) {
      Object.keys(labels).forEach(function (id) {
        var item = rectFor(id, base), label = labels[id];
        if (!item) return;
        paintButton(item, color, Math.min(item.w, item.h) * 0.28, "number");
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.fillStyle = color.text;
        ctx.font = font(styles, "number");
        ctx.fillText(label[0], item.x + item.w * 0.35, item.y + item.h / 2);
        ctx.fillStyle = color.dim;
        ctx.font = font(styles, "auxiliary");
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
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      var color = colors();
      var styles = textStyles();
      // MRP shares this renderer but can inherit a cached J2ME config global.
      var requestedOrientation = window.__XIAOCHAO_RUNTIME__ === true && window.config && window.config.orientation;
      var orientation = requestedOrientation === "portrait" || requestedOrientation === "landscape"
        ? requestedOrientation
        : document.body.dataset.viewportOrientation || document.body.dataset.orientation;
      var portrait = orientation === "portrait";
      if (!portrait) drawDpad(canvasRect, color, styles);
      drawSoft(rectFor("choice", canvasRect), color);
      drawSoft(rectFor("back", canvasRect), color);
      drawTextButton(rectFor("ret", canvasRect), "↩", color, styles, "mini", "soft");
      drawTextButton(rectFor("clear", canvasRect), "C", color, styles, "mini", "soft");
      if (portrait) {
        // Paint the d-pad after portrait action slots so its arrows remain visible
        // where the DOM mask would otherwise cut the soft-key backgrounds away.
        drawDpad(canvasRect, color, styles);
        // Keep the action labels readable where the d-pad overlaps their slots.
        drawTextLabel(rectFor("ret", canvasRect), "↩", color, styles, "mini");
        drawTextLabel(rectFor("clear", canvasRect), "C", color, styles, "mini");
      }
      drawNumbers(canvasRect, color, styles);
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
