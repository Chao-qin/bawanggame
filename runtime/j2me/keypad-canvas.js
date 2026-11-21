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
      star: ["*", "+"], num0: ["0", "␣"], pound: ["#", "⇧"]
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

    function visualDirection(id) {
      if (window.TouchLayout && typeof window.TouchLayout.visualDpad === "function") {
        return window.TouchLayout.visualDpad(id, typeof config !== "undefined" ? config.touchLayout : null);
      }
      return id;
    }

    function font(styles, role, size) {
      var style = styles[role];
      return (style.weight || "400") + " " + Math.max(1, size || style.size) + "px " + styles.family;
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
      var y = item.y;
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
        if (!item) return;
        var active = item.node.classList.contains("down");
        ctx.fillStyle = active ? "rgba(74,120,194,.65)" : "rgba(61,77,91,.22)";
        roundedRect(ctx, item.x, item.y, item.w, item.h, Math.min(item.w, item.h) * .24);
        ctx.fill();
        var cx0 = item.x + item.w / 2, cy0 = item.y + item.h / 2;
        var size = Math.min(item.w, item.h) * .2;
        ctx.strokeStyle = active ? "#081018" : color.text;
        ctx.lineWidth = Math.max(2, styles.unit * .09);
        ctx.lineCap = "square";
        ctx.beginPath();
        if (visualDirection(id) === "up") { ctx.moveTo(cx0-size, cy0+size*.35); ctx.lineTo(cx0, cy0-size*.35); ctx.lineTo(cx0+size, cy0+size*.35); }
        else if (visualDirection(id) === "down") { ctx.moveTo(cx0-size, cy0-size*.35); ctx.lineTo(cx0, cy0+size*.35); ctx.lineTo(cx0+size, cy0-size*.35); }
        else if (visualDirection(id) === "left") { ctx.moveTo(cx0+size*.35, cy0-size); ctx.lineTo(cx0-size*.35, cy0); ctx.lineTo(cx0+size*.35, cy0+size); }
        else { ctx.moveTo(cx0-size*.35, cy0-size); ctx.lineTo(cx0+size*.35, cy0); ctx.lineTo(cx0-size*.35, cy0+size); }
        ctx.stroke();
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

    function drawSoft(item, color) {
      if (!item) return;
      paintButton(item, color, Math.min(item.w, item.h) * 0.24, "soft");
    }

    function drawFeatureGlyph(item, id, color, styles) {
      if (!item) return;
      var active = item.node.classList.contains("down") || item.node.classList.contains("tap");
      var stroke = active ? "#081018" : color.text;
      var cx = item.x + item.w / 2;
      var cy = item.y + item.h / 2;
      var size = Math.min(item.w, item.h) * 0.18;
      ctx.strokeStyle = stroke;
      ctx.fillStyle = stroke;
      ctx.lineWidth = Math.max(2, styles.unit * .085);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      if (id === "choice" || id === "back") {
        ctx.moveTo(cx - size * 1.25, cy);
        ctx.lineTo(cx + size * 1.25, cy);
      } else if (id === "ret") {
        ctx.arc(cx, cy, size * 1.25, Math.PI * .15, Math.PI * 1.65, false);
        ctx.moveTo(cx - size * 1.35, cy - size * .1);
        ctx.lineTo(cx - size * 1.35, cy - size * .9);
        ctx.lineTo(cx - size * .55, cy - size * .9);
      } else {
        ctx.moveTo(cx - size * 1.2, cy - size * 1.2);
        ctx.lineTo(cx + size * 1.2, cy + size * 1.2);
        ctx.moveTo(cx + size * 1.2, cy - size * 1.2);
        ctx.lineTo(cx - size * 1.2, cy + size * 1.2);
      }
      ctx.stroke();
    }

    function drawNumbers(base, color, styles) {
      Object.keys(labels).forEach(function (id) {
        var item = rectFor(id, base), label = labels[id];
        if (!item) return;
        var primaryNode = item.node.querySelector("b");
        var auxiliaryNode = item.node.querySelector("i");
        var primary = primaryNode && primaryNode.textContent.trim() || label[0];
        var auxiliary = auxiliaryNode && auxiliaryNode.textContent.trim() || label[1];
        paintButton(item, color, Math.min(item.w, item.h) * 0.28, "number");
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.fillStyle = color.text;
        ctx.font = font(styles, "number");
        ctx.fillText(primary, item.x + item.w * 0.35, item.y + item.h / 2);
        ctx.fillStyle = color.dim;
        ctx.font = font(styles, "auxiliary");
        ctx.fillText(auxiliary, item.x + item.w * 0.56, item.y + item.h / 2 + item.h * 0.03);
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
      ["choice", "back", "ret", "clear"].forEach(function (id) {
        var item = rectFor(id, canvasRect);
        drawSoft(item, color);
        drawFeatureGlyph(item, id, color, styles);
      });
      if (portrait) drawDpad(canvasRect, color, styles);
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
