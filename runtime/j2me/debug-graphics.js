/*
 * 绘图诊断（仅在 ?gfxdiag=1 时启用，默认零开销）
 *
 * 目的：把"这张贴图没出来"变成可读的数字。Canvas 2D 在两种情况下会**静默不画**：
 *   1. 源矩形超出源图范围（雪碧图取错格子 / 图集尺寸不对）
 *   2. 目标矩形完全落在画布之外（变换算错）
 * 这两种都不抛异常，肉眼只能看到"图没了"，所以这里逐次统计。
 */
(function () {
  if (!/[?&]gfxdiag=1(?:&|$)/.test(location.search)) return;

  var stats = {
    total: 0,        // 九参数 drawImage 总数
    oob: 0,          // 源矩形越界（会静默不画）
    zero: 0,         // 源/目标尺寸 <= 0（会静默不画）
    offscreen: 0,    // 目标矩形完全在画布外（会静默不画）
    sources: {},     // 源画布尺寸分布，用来确认图集尺寸
    samples: []      // 前若干条异常样本
  };

  var orig = CanvasRenderingContext2D.prototype.drawImage;

  function note(kind, img, sx, sy, sw, sh, dx, dy, dw, dh, self) {
    var s = stats.sources;
    var key = (img.width || img.naturalWidth || 0) + "x" + (img.height || img.naturalHeight || 0);
    s[key] = (s[key] || 0) + 1;
    if (stats.samples.length < 12) {
      stats.samples.push({
        kind: kind,
        src: [img.width || img.naturalWidth || 0, img.height || img.naturalHeight || 0],
        rect: [sx, sy, sw, sh],
        dst: [dx, dy, dw, dh],
        canvas: [self.canvas.width, self.canvas.height]
      });
    }
  }

  CanvasRenderingContext2D.prototype.drawImage = function (img, sx, sy, sw, sh, dx, dy, dw, dh) {
    if (arguments.length >= 9) {
      stats.total++;
      var w = img.width || img.naturalWidth || 0;
      var h = img.height || img.naturalHeight || 0;
      if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) {
        stats.zero++;
        note("zero", img, sx, sy, sw, sh, dx, dy, dw, dh, this);
      } else if (sx < 0 || sy < 0 || sx + sw > w || sy + sh > h) {
        stats.oob++;
        note("oob", img, sx, sy, sw, sh, dx, dy, dw, dh, this);
      } else if (dx + dw <= 0 || dy + dh <= 0 || dx >= this.canvas.width || dy >= this.canvas.height) {
        stats.offscreen++;
        note("offscreen", img, sx, sy, sw, sh, dx, dy, dw, dh, this);
      }
    }
    return orig.apply(this, arguments);
  };

  window.GfxDiagnostics = {
    active: true,
    stats: function () {
      var src = Object.keys(stats.sources).map(function (k) { return [k, stats.sources[k]]; });
      src.sort(function (a, b) { return b[1] - a[1]; });
      return {
        total: stats.total,
        oob: stats.oob,
        zero: stats.zero,
        offscreen: stats.offscreen,
        sources: src.slice(0, 4),
        samples: stats.samples.slice()
      };
    },
    reset: function () {
      stats.total = stats.oob = stats.zero = stats.offscreen = 0;
      stats.sources = {};
      stats.samples = [];
    }
  };
})();
