// media/curve_digitize.js — module pur de digitalisation de courbes depuis une
// image raster {width,height,data:RGBA}. UMD : self.CurveDigitize / require.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CurveDigitize = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function lin(frac, a, b) { return a + frac * (b - a); }
  function logmap(frac, a, b) { return Math.pow(10, lin(frac, Math.log(a) / Math.LN10, Math.log(b) / Math.LN10)); }

  function pixelsToData(points, box, calib) {
    const w = box.x1 - box.x0, h = box.y1 - box.y0;
    return points.map(function (p) {
      const fx = w ? (p.xpx - box.x0) / w : 0;
      const fy = h ? (box.y1 - p.ypx) / h : 0; // y pixel vers le bas -> inversion
      const x = calib.xlog ? logmap(fx, calib.xmin, calib.xmax) : lin(fx, calib.xmin, calib.xmax);
      const y = calib.ylog ? logmap(fy, calib.ymin, calib.ymax) : lin(fy, calib.ymin, calib.ymax);
      return { x: x, y: y };
    });
  }

  function detectBackground(img, box) {
    const counts = {};
    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = box.x0; x <= box.x1; x++) {
        const i = (y * img.width + x) * 4;
        const k = (img.data[i] >> 3) + "_" + (img.data[i + 1] >> 3) + "_" + (img.data[i + 2] >> 3);
        counts[k] = (counts[k] || 0) + 1;
      }
    }
    let best = null, bestN = -1;
    for (const k in counts) { if (counts[k] > bestN) { bestN = counts[k]; best = k; } }
    const p = best.split("_").map(Number);
    return { r: (p[0] << 3) | 7, g: (p[1] << 3) | 7, b: (p[2] << 3) | 7 };
  }

  function lum(r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b; }
  function sat(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return mx === 0 ? 0 : (mx - mn) / mx;
  }
  function isAxisPixel(r, g, b) { return lum(r, g, b) < 110 && sat(r, g, b) < 0.35; }

  function detectPlotBox(img, opts) {
    opts = opts || {};
    const W = img.width, H = img.height;
    const colCount = new Array(W).fill(0), rowCount = new Array(H).fill(0);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (isAxisPixel(img.data[i], img.data[i + 1], img.data[i + 2])) { colCount[x]++; rowCount[y]++; }
      }
    }
    const vThresh = (opts.vFrac || 0.5) * H, hThresh = (opts.hFrac || 0.5) * W;
    const cols = [], rows = [];
    for (let x = 0; x < W; x++) if (colCount[x] >= vThresh) cols.push(x);
    for (let y = 0; y < H; y++) if (rowCount[y] >= hThresh) rows.push(y);
    if (!cols.length || !rows.length) return null;
    return { x0: cols[0], y0: rows[0], x1: cols[cols.length - 1], y1: rows[rows.length - 1] };
  }

  return {
    pixelsToData: pixelsToData,
    detectBackground: detectBackground,
    detectPlotBox: detectPlotBox
  };
});
