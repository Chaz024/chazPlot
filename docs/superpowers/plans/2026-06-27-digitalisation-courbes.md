# Digitalisation automatique de courbes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extraire les points de données d'une figure depuis un PNG/SVG quelconque (non produit par l'extension), avec séparation auto par couleur+style et repli manuel à clics.

**Architecture:** Un module pur `media/curve_digitize.js` (UMD, `self.CurveDigitize` côté webview / `require` sous Node) fait tout le traitement d'image sur un modèle `{width,height,data:RGBA}` et est testé sous Node avec des images synthétiques. La glue (canvas `getImageData`, UI calibration/revue/manuel, sorties) vit dans `media/panel.html`. Les sorties réutilisent l'existant : `createFigureFromData`, export CSV, et un nouveau message `generateCodeFromSpec` qui passe par `media/plotly_to_py.js`.

**Tech Stack:** JavaScript pur (aucune dépendance, aucun réseau), Node `assert` pour les tests, VS Code webview + Canvas 2D pour la glue.

## Global Constraints

- Aucune dépendance npm, aucun accès réseau (CSP webview sans `connect-src`). [verbatim de la spec]
- Modules webview en UMD : `self.X` côté webview, `module.exports` sous Node. [pattern existant]
- Tout module webview = URI injectée dans `extension.js:webviewHtml()` + placeholder `<script>` dans `media/panel.html` + entrée dans `test/check_panel_html.js`. [pattern existant]
- Langue de travail : **français** (UI, commentaires, messages de commit).
- Pas de build : JS vérifié par `node --check`. Tests purs : `node test/<fichier>.js`.
- TDD strict : test qui échoue d'abord, puis implémentation minimale.

---

### Task 1: Scaffold du module + harnais de test + `pixelsToData`

**Files:**
- Create: `media/curve_digitize.js`
- Test: `test/test_curve_digitize.js`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `pixelsToData(points, box, calib) → [{x,y}]` où `points=[{xpx,ypx}]`, `box={x0,y0,x1,y1}` (pixels, `y` vers le bas), `calib={xmin,xmax,ymin,ymax,xlog,ylog}`.
  - Image model utilisée partout : `{ width, height, data }` avec `data` = `Uint8ClampedArray` RGBA plat.
  - Helpers de test partagés (dans le fichier de test) : `makeImage(w,h,bg)`, `setPx(img,x,y,[r,g,b])`, `drawSeg(img,x0,y0,x1,y1,c)`, `drawVLine`, `drawHLine`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `test/test_curve_digitize.js` :

```js
// test/test_curve_digitize.js — tests du module pur de digitalisation de courbes.
// Lancer : node test/test_curve_digitize.js
"use strict";
const assert = require("assert");
const CD = require("../media/curve_digitize.js");

let passed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log("ok   - " + name); }
  catch (e) { console.error("FAIL - " + name + " : " + e.message); process.exitCode = 1; }
}

// --- helpers image synthetique ---
function makeImage(w, h, bg) {
  bg = bg || [255, 255, 255];
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = bg[0]; data[i * 4 + 1] = bg[1]; data[i * 4 + 2] = bg[2]; data[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data: data };
}
function setPx(img, x, y, c) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
}
function drawHLine(img, y, x0, x1, c) { for (let x = x0; x <= x1; x++) setPx(img, x, y, c); }
function drawVLine(img, x, y0, y1, c) { for (let y = y0; y <= y1; y++) setPx(img, x, y, c); }
function drawSeg(img, x0, y0, x1, y1, c) {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  for (;;) {
    setPx(img, x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}

check("pixelsToData : lineaire, y pixel inverse", function () {
  const box = { x0: 0, y0: 0, x1: 100, y1: 100 };
  const calib = { xmin: 0, xmax: 10, ymin: 0, ymax: 20, xlog: false, ylog: false };
  const out = CD.pixelsToData([{ xpx: 50, ypx: 50 }, { xpx: 0, ypx: 100 }, { xpx: 100, ypx: 0 }], box, calib);
  assert.ok(Math.abs(out[0].x - 5) < 1e-9 && Math.abs(out[0].y - 10) < 1e-9);
  assert.ok(Math.abs(out[1].x - 0) < 1e-9 && Math.abs(out[1].y - 0) < 1e-9);
  assert.ok(Math.abs(out[2].x - 10) < 1e-9 && Math.abs(out[2].y - 20) < 1e-9);
});

check("pixelsToData : echelle log en X", function () {
  const box = { x0: 0, y0: 0, x1: 100, y1: 100 };
  const calib = { xmin: 1, xmax: 1000, ymin: 0, ymax: 1, xlog: true, ylog: false };
  const out = CD.pixelsToData([{ xpx: 50, ypx: 0 }], box, calib);
  assert.ok(Math.abs(out[0].x - Math.pow(10, 1.5)) < 1e-6);
});

// exporter les helpers pour les taches suivantes du meme fichier
module.exports = { makeImage: makeImage, setPx: setPx, drawHLine: drawHLine, drawVLine: drawVLine, drawSeg: drawSeg };

console.log("\n" + passed + " tests OK");
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `node test/test_curve_digitize.js`
Expected: FAIL — `Cannot find module '../media/curve_digitize.js'`.

- [ ] **Step 3: Implémenter le minimum**

Créer `media/curve_digitize.js` :

```js
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

  return {
    pixelsToData: pixelsToData
  };
});
```

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

Run: `node test/test_curve_digitize.js`
Expected: PASS (2 tests OK).

- [ ] **Step 5: Commit**

```bash
git add media/curve_digitize.js test/test_curve_digitize.js
git commit -m "feat(digitalisation): module pur + pixelsToData (TDD)"
```

---

### Task 2: `detectBackground`

**Files:**
- Modify: `media/curve_digitize.js`
- Test: `test/test_curve_digitize.js`

**Interfaces:**
- Consumes: image model, `box`.
- Produces: `detectBackground(img, box) → {r,g,b}` (couleur la plus fréquente dans la boîte, quantifiée par buckets de 8).

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter dans `test/test_curve_digitize.js`, avant la ligne `console.log("\n" + passed ...)` :

```js
check("detectBackground : fond blanc malgre quelques pixels colores", function () {
  const img = makeImage(40, 30);
  drawSeg(img, 0, 0, 39, 29, [200, 0, 0]); // une diagonale rouge
  const bg = CD.detectBackground(img, { x0: 0, y0: 0, x1: 39, y1: 29 });
  assert.ok(bg.r >= 240 && bg.g >= 240 && bg.b >= 240, "fond proche du blanc");
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `node test/test_curve_digitize.js`
Expected: FAIL — `CD.detectBackground is not a function`.

- [ ] **Step 3: Implémenter le minimum**

Dans `media/curve_digitize.js`, ajouter avant le `return {` :

```js
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
```

Et ajouter `detectBackground: detectBackground,` dans l'objet retourné.

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

Run: `node test/test_curve_digitize.js`
Expected: PASS (3 tests OK).

- [ ] **Step 5: Commit**

```bash
git add media/curve_digitize.js test/test_curve_digitize.js
git commit -m "feat(digitalisation): detectBackground (TDD)"
```

---

### Task 3: `detectPlotBox`

**Files:**
- Modify: `media/curve_digitize.js`
- Test: `test/test_curve_digitize.js`

**Interfaces:**
- Consumes: image model, `opts` optionnel `{vFrac,hFrac}`.
- Produces: `detectPlotBox(img, opts) → {x0,y0,x1,y1} | null`. `x0<x1`, `y0<y1`. Détecte les spines (longues lignes sombres peu saturées). `null` si aucune spine.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter dans `test/test_curve_digitize.js` :

```js
check("detectPlotBox : cadre noir detecte", function () {
  const img = makeImage(120, 100);
  drawVLine(img, 10, 10, 90, [0, 0, 0]);
  drawVLine(img, 110, 10, 90, [0, 0, 0]);
  drawHLine(img, 10, 10, 110, [0, 0, 0]);
  drawHLine(img, 90, 10, 110, [0, 0, 0]);
  const box = CD.detectPlotBox(img);
  assert.deepStrictEqual(box, { x0: 10, y0: 10, x1: 110, y1: 90 });
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `node test/test_curve_digitize.js`
Expected: FAIL — `CD.detectPlotBox is not a function`.

- [ ] **Step 3: Implémenter le minimum**

Dans `media/curve_digitize.js`, ajouter avant le `return {` :

```js
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
```

Et ajouter `detectPlotBox: detectPlotBox,` dans l'objet retourné. (Note : `lum`/`sat`/`isAxisPixel` sont réutilisés par les tâches suivantes.)

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

Run: `node test/test_curve_digitize.js`
Expected: PASS (4 tests OK).

- [ ] **Step 5: Commit**

```bash
git add media/curve_digitize.js test/test_curve_digitize.js
git commit -m "feat(digitalisation): detectPlotBox (TDD)"
```

---

### Task 4: `clusterCurveColors`

**Files:**
- Modify: `media/curve_digitize.js`
- Test: `test/test_curve_digitize.js`

**Interfaces:**
- Consumes: image model, `box`, `opts` optionnel `{bg, bgDist, mergeTol, minPixels}`.
- Produces: `clusterCurveColors(img, box, opts) → [{color:[r,g,b], pixels:[{x,y}]}]`, triés par population décroissante, petits clusters filtrés. N'inspecte que l'intérieur strict `]x0,x1[ × ]y0,y1[`.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter dans `test/test_curve_digitize.js` :

```js
check("clusterCurveColors : 2 courbes colorees -> 2 clusters", function () {
  const img = makeImage(120, 100);
  drawVLine(img, 10, 10, 90, [0, 0, 0]); drawVLine(img, 110, 10, 90, [0, 0, 0]);
  drawHLine(img, 10, 10, 110, [0, 0, 0]); drawHLine(img, 90, 10, 110, [0, 0, 0]);
  const box = { x0: 10, y0: 10, x1: 110, y1: 90 };
  drawSeg(img, 20, 80, 100, 20, [220, 0, 0]);   // rouge montante
  drawSeg(img, 20, 20, 100, 80, [0, 0, 220]);   // bleue descendante
  const clusters = CD.clusterCurveColors(img, box);
  assert.strictEqual(clusters.length, 2);
  const reds = clusters.filter(function (c) { return c.color[0] > 150 && c.color[2] < 80; });
  const blues = clusters.filter(function (c) { return c.color[2] > 150 && c.color[0] < 80; });
  assert.strictEqual(reds.length, 1);
  assert.strictEqual(blues.length, 1);
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `node test/test_curve_digitize.js`
Expected: FAIL — `CD.clusterCurveColors is not a function`.

- [ ] **Step 3: Implémenter le minimum**

Dans `media/curve_digitize.js`, ajouter avant le `return {` :

```js
  function clusterCurveColors(img, box, opts) {
    opts = opts || {};
    const bg = opts.bg || detectBackground(img, box);
    const bgDist = opts.bgDist != null ? opts.bgDist : 40;
    const mergeTol = opts.mergeTol != null ? opts.mergeTol : 40;
    const minPixels = opts.minPixels != null ? opts.minPixels : 8;
    const clusters = [];
    for (let y = box.y0 + 1; y < box.y1; y++) {
      for (let x = box.x0 + 1; x < box.x1; x++) {
        const i = (y * img.width + x) * 4;
        const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
        if (Math.abs(r - bg.r) + Math.abs(g - bg.g) + Math.abs(b - bg.b) < bgDist) continue;
        let found = null;
        for (let k = 0; k < clusters.length; k++) {
          const c = clusters[k].color;
          if (Math.abs(c[0] - r) + Math.abs(c[1] - g) + Math.abs(c[2] - b) <= mergeTol) { found = clusters[k]; break; }
        }
        if (found) found.pixels.push({ x: x, y: y });
        else clusters.push({ color: [r, g, b], pixels: [{ x: x, y: y }] });
      }
    }
    return clusters
      .filter(function (c) { return c.pixels.length >= minPixels; })
      .sort(function (a, b) { return b.pixels.length - a.pixels.length; });
  }
```

Et ajouter `clusterCurveColors: clusterCurveColors,` dans l'objet retourné.

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

Run: `node test/test_curve_digitize.js`
Expected: PASS (5 tests OK).

- [ ] **Step 5: Commit**

```bash
git add media/curve_digitize.js test/test_curve_digitize.js
git commit -m "feat(digitalisation): clusterCurveColors (TDD)"
```

---

### Task 5: `detectLineStyle`

**Files:**
- Modify: `media/curve_digitize.js`
- Test: `test/test_curve_digitize.js`

**Interfaces:**
- Consumes: `pixels=[{x,y}]`, `box` (non utilisé pour l'instant mais gardé pour signature stable).
- Produces: `detectLineStyle(pixels, box) → {style:'solid'|'dashed'|'dotted'|'markers'}`. Classement via couverture par colonne + hauteur verticale moyenne par colonne.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter dans `test/test_curve_digitize.js` :

```js
check("detectLineStyle : solid / dashed / dotted / markers", function () {
  const box = { x0: 0, y0: 0, x1: 100, y1: 50 };
  function cols(present, builder) {
    const px = [];
    for (let x = 0; x < 100; x++) if (present(x)) builder(px, x);
    return px;
  }
  const solid = cols(function () { return true; }, function (px, x) { px.push({ x: x, y: 25 }); });
  const dashed = cols(function (x) { return (x % 10) < 6; }, function (px, x) { px.push({ x: x, y: 25 }); });
  const dotted = cols(function (x) { return (x % 5) === 0; }, function (px, x) { px.push({ x: x, y: 25 }); });
  const markers = cols(function (x) { return (x % 20) < 3; }, function (px, x) {
    for (let dy = -2; dy <= 2; dy++) px.push({ x: x, y: 25 + dy });
  });
  assert.strictEqual(CD.detectLineStyle(solid, box).style, "solid");
  assert.strictEqual(CD.detectLineStyle(dashed, box).style, "dashed");
  assert.strictEqual(CD.detectLineStyle(dotted, box).style, "dotted");
  assert.strictEqual(CD.detectLineStyle(markers, box).style, "markers");
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `node test/test_curve_digitize.js`
Expected: FAIL — `CD.detectLineStyle is not a function`.

- [ ] **Step 3: Implémenter le minimum**

Dans `media/curve_digitize.js`, ajouter avant le `return {` :

```js
  function detectLineStyle(pixels, box) {
    if (!pixels.length) return { style: "markers" };
    const colRows = {};
    let minx = Infinity, maxx = -Infinity;
    for (let k = 0; k < pixels.length; k++) {
      const p = pixels[k];
      (colRows[p.x] = colRows[p.x] || []).push(p.y);
      if (p.x < minx) minx = p.x;
      if (p.x > maxx) maxx = p.x;
    }
    const span = maxx - minx + 1;
    let present = 0, totalHeight = 0;
    for (let x = minx; x <= maxx; x++) {
      const ys = colRows[x];
      if (!ys) continue;
      present++;
      totalHeight += Math.max.apply(null, ys) - Math.min.apply(null, ys) + 1;
    }
    const coverage = present / span;
    const avgHeight = totalHeight / present;
    if (avgHeight >= 3 && coverage < 0.85) return { style: "markers" };
    if (coverage >= 0.85) return { style: "solid" };
    if (coverage >= 0.45) return { style: "dashed" };
    return { style: "dotted" };
  }
```

Et ajouter `detectLineStyle: detectLineStyle,` dans l'objet retourné.

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

Run: `node test/test_curve_digitize.js`
Expected: PASS (6 tests OK).

- [ ] **Step 5: Commit**

```bash
git add media/curve_digitize.js test/test_curve_digitize.js
git commit -m "feat(digitalisation): detectLineStyle (TDD)"
```

---

### Task 6: `extractCurves` (+ helper `columnBands`)

**Files:**
- Modify: `media/curve_digitize.js`
- Test: `test/test_curve_digitize.js`

**Interfaces:**
- Consumes: `clusters` (sortie de `clusterCurveColors`), `box`, `opts` optionnel `{ambigJump}`.
- Produces: `extractCurves(clusters, box, opts) → [{color, style, pixels, points:[{xpx,ypx}], ambiguous:[{x0,x1}]}]`. Suivi par continuité (extrapolation linéaire) ; colonnes multi-bandes → zones ambiguës fusionnées.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter dans `test/test_curve_digitize.js` :

```js
check("extractCurves : courbe simple, pas d'ambiguite", function () {
  const img = makeImage(120, 100);
  const box = { x0: 10, y0: 10, x1: 110, y1: 90 };
  drawSeg(img, 20, 80, 100, 30, [220, 0, 0]);
  const clusters = CD.clusterCurveColors(img, box);
  const curves = CD.extractCurves(clusters, box);
  assert.strictEqual(curves.length, 1);
  assert.ok(curves[0].points.length > 50);
  assert.strictEqual(curves[0].ambiguous.length, 0);
  // monotonie globale : y pixel decroit quand x croit
  const first = curves[0].points[0], last = curves[0].points[curves[0].points.length - 1];
  assert.ok(last.ypx < first.ypx);
});

check("extractCurves : croisement MEME couleur -> zone ambigue signalee", function () {
  const img = makeImage(120, 100);
  const box = { x0: 10, y0: 10, x1: 110, y1: 90 };
  drawSeg(img, 20, 30, 100, 80, [0, 0, 0]);
  drawSeg(img, 20, 80, 100, 30, [0, 0, 0]);
  const clusters = CD.clusterCurveColors(img, box, { bg: { r: 255, g: 255, b: 255 } });
  const curves = CD.extractCurves(clusters, box);
  // une seule couleur -> un cluster, croisement -> ambigu
  assert.ok(curves[0].ambiguous.length >= 1);
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `node test/test_curve_digitize.js`
Expected: FAIL — `CD.extractCurves is not a function`.

- [ ] **Step 3: Implémenter le minimum**

Dans `media/curve_digitize.js`, ajouter avant le `return {` :

```js
  function columnBands(ys) {
    ys = ys.slice().sort(function (a, b) { return a - b; });
    const bands = [];
    let start = ys[0], prev = ys[0];
    for (let i = 1; i < ys.length; i++) {
      if (ys[i] - prev > 1) { bands.push((start + prev) / 2); start = ys[i]; }
      prev = ys[i];
    }
    bands.push((start + prev) / 2);
    return bands;
  }

  function extractCurves(clusters, box, opts) {
    opts = opts || {};
    return clusters.map(function (c) {
      const byCol = {};
      for (let k = 0; k < c.pixels.length; k++) {
        const p = c.pixels[k];
        (byCol[p.x] = byCol[p.x] || []).push(p.y);
      }
      const xs = Object.keys(byCol).map(Number).sort(function (a, b) { return a - b; });
      const points = [], ambiguous = [];
      let lastY = null, lastX = null, slope = 0;
      for (let j = 0; j < xs.length; j++) {
        const x = xs[j];
        const bands = columnBands(byCol[x]);
        let chosen;
        if (bands.length === 1) {
          chosen = bands[0];
        } else {
          const pred = lastY != null ? lastY + slope * (x - lastX) : bands[0];
          chosen = bands[0]; let best = Infinity;
          for (let b = 0; b < bands.length; b++) {
            const d = Math.abs(bands[b] - pred);
            if (d < best) { best = d; chosen = bands[b]; }
          }
          ambiguous.push({ x0: x, x1: x });
        }
        if (lastY != null && x > lastX) slope = (chosen - lastY) / (x - lastX);
        points.push({ xpx: x, ypx: chosen });
        lastY = chosen; lastX = x;
      }
      const merged = [];
      for (let a = 0; a < ambiguous.length; a++) {
        const m = merged[merged.length - 1];
        if (m && ambiguous[a].x0 <= m.x1 + 1) m.x1 = ambiguous[a].x1;
        else merged.push({ x0: ambiguous[a].x0, x1: ambiguous[a].x1 });
      }
      return {
        color: c.color,
        style: detectLineStyle(c.pixels, box).style,
        pixels: c.pixels,
        points: points,
        ambiguous: merged
      };
    });
  }
```

Et ajouter `extractCurves: extractCurves,` dans l'objet retourné.

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

Run: `node test/test_curve_digitize.js`
Expected: PASS (8 tests OK).

- [ ] **Step 5: Commit**

```bash
git add media/curve_digitize.js test/test_curve_digitize.js
git commit -m "feat(digitalisation): extractCurves + columnBands (TDD)"
```

---

### Task 7: `traceFromSeeds` (mode manuel)

**Files:**
- Modify: `media/curve_digitize.js`
- Test: `test/test_curve_digitize.js`

**Interfaces:**
- Consumes: `pixels=[{x,y}]` (masque d'une couleur ambiguë), `box`, `seeds=[{x,y}]`.
- Produces: `traceFromSeeds(pixels, box, seeds) → [{points:[{xpx,ypx}], ambiguous:[]}]` — une courbe par graine, tracée gauche+droite par continuité de pente.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter dans `test/test_curve_digitize.js` :

```js
check("traceFromSeeds : separe 2 courbes meme couleur qui se croisent", function () {
  const img = makeImage(120, 100);
  const c = [0, 0, 0];
  drawSeg(img, 20, 30, 100, 80, c); // A : monte (y pixel croit)
  drawSeg(img, 20, 80, 100, 30, c); // B : descend (y pixel decroit)
  const box = { x0: 10, y0: 10, x1: 110, y1: 90 };
  const pixels = [];
  for (let y = 11; y < 90; y++) for (let x = 11; x < 110; x++) {
    const i = (y * img.width + x) * 4;
    if (img.data[i] < 128) pixels.push({ x: x, y: y });
  }
  const traced = CD.traceFromSeeds(pixels, box, [{ x: 20, y: 30 }, { x: 20, y: 80 }]);
  assert.strictEqual(traced.length, 2);
  const a = traced[0].points, b = traced[1].points;
  // A part haut (y~30) et finit bas (y~80) ; B l'inverse
  assert.ok(a[a.length - 1].ypx > a[0].ypx);
  assert.ok(b[b.length - 1].ypx < b[0].ypx);
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `node test/test_curve_digitize.js`
Expected: FAIL — `CD.traceFromSeeds is not a function`.

- [ ] **Step 3: Implémenter le minimum**

Dans `media/curve_digitize.js`, ajouter avant le `return {` :

```js
  function nearestIndex(xs, x) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < xs.length; i++) { const d = Math.abs(xs[i] - x); if (d < bd) { bd = d; best = i; } }
    return best;
  }

  function traceFromSeeds(pixels, box, seeds) {
    const byCol = {};
    for (let k = 0; k < pixels.length; k++) {
      const p = pixels[k];
      (byCol[p.x] = byCol[p.x] || []).push(p.y);
    }
    const xs = Object.keys(byCol).map(Number).sort(function (a, b) { return a - b; });
    return seeds.map(function (seed) {
      function traceDir(dir) {
        const pts = [];
        let lastY = seed.y, lastX = seed.x, slope = 0;
        let k = nearestIndex(xs, seed.x) + dir;
        for (; k >= 0 && k < xs.length; k += dir) {
          const x = xs[k];
          const bands = columnBands(byCol[x]);
          const pred = lastY + slope * (x - lastX);
          let chosen = bands[0], best = Infinity;
          for (let b = 0; b < bands.length; b++) {
            const d = Math.abs(bands[b] - pred);
            if (d < best) { best = d; chosen = bands[b]; }
          }
          if (x !== lastX) slope = (chosen - lastY) / (x - lastX);
          pts.push({ xpx: x, ypx: chosen });
          lastY = chosen; lastX = x;
        }
        return pts;
      }
      const left = traceDir(-1).reverse();
      const right = traceDir(1);
      return { points: left.concat([{ xpx: seed.x, ypx: seed.y }], right), ambiguous: [] };
    });
  }
```

Et ajouter `traceFromSeeds: traceFromSeeds,` dans l'objet retourné.

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

Run: `node test/test_curve_digitize.js`
Expected: PASS (9 tests OK).

- [ ] **Step 5: Commit**

```bash
git add media/curve_digitize.js test/test_curve_digitize.js
git commit -m "feat(digitalisation): traceFromSeeds mode manuel (TDD)"
```

---

### Task 8: `buildSpec` (assemblage de la spec Plotly)

**Files:**
- Modify: `media/curve_digitize.js`
- Test: `test/test_curve_digitize.js`

**Interfaces:**
- Consumes: `curves` (sortie `extractCurves`/`traceFromSeeds`, enrichies d'un `style`/`color`/`name` optionnel), `box`, `calib`, `title`.
- Produces: `buildSpec(curves, box, calib, title) → {title, plotly:{data:[scatter], layout}}`. Mappe les points via `pixelsToData`, `mode:'markers'` si `style==='markers'` sinon `'lines'`, `line.dash` selon style, `layout.xaxis.type='log'` si `calib.xlog`.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter dans `test/test_curve_digitize.js` :

```js
check("buildSpec : produit une spec scatter calibree", function () {
  const box = { x0: 0, y0: 0, x1: 100, y1: 100 };
  const calib = { xmin: 0, xmax: 10, ymin: 0, ymax: 10, xlog: false, ylog: false };
  const curves = [
    { color: [220, 0, 0], style: "solid", points: [{ xpx: 0, ypx: 100 }, { xpx: 100, ypx: 0 }], name: "rouge" },
    { color: [0, 0, 0], style: "markers", points: [{ xpx: 50, ypx: 50 }] }
  ];
  const spec = CD.buildSpec(curves, box, calib, "Test");
  assert.strictEqual(spec.title, "Test");
  assert.strictEqual(spec.plotly.data.length, 2);
  assert.strictEqual(spec.plotly.data[0].type, "scatter");
  assert.strictEqual(spec.plotly.data[0].mode, "lines");
  assert.strictEqual(spec.plotly.data[1].mode, "markers");
  assert.deepStrictEqual(spec.plotly.data[0].x, [0, 10]);
  assert.deepStrictEqual(spec.plotly.data[0].y, [0, 10]);
  assert.strictEqual(spec.plotly.data[0].name, "rouge");
});

check("buildSpec : echelle log reportee dans le layout", function () {
  const box = { x0: 0, y0: 0, x1: 100, y1: 100 };
  const calib = { xmin: 1, xmax: 100, ymin: 0, ymax: 1, xlog: true, ylog: false };
  const spec = CD.buildSpec([{ color: [0, 0, 0], style: "solid", points: [{ xpx: 0, ypx: 0 }] }], box, calib, "");
  assert.strictEqual(spec.plotly.layout.xaxis.type, "log");
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `node test/test_curve_digitize.js`
Expected: FAIL — `CD.buildSpec is not a function`.

- [ ] **Step 3: Implémenter le minimum**

Dans `media/curve_digitize.js`, ajouter avant le `return {` :

```js
  const DASH_FOR = { solid: "solid", dashed: "dash", dotted: "dot", markers: "solid" };
  function rgbCss(c) { return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"; }

  function buildSpec(curves, box, calib, title) {
    const data = curves.map(function (c, i) {
      const pts = pixelsToData(c.points, box, calib);
      return {
        type: "scatter",
        mode: c.style === "markers" ? "markers" : "lines",
        x: pts.map(function (p) { return p.x; }),
        y: pts.map(function (p) { return p.y; }),
        line: { color: rgbCss(c.color), dash: DASH_FOR[c.style] || "solid" },
        marker: { color: rgbCss(c.color) },
        name: c.name || ("courbe " + (i + 1))
      };
    });
    const layout = { xaxis: {}, yaxis: {} };
    if (calib.xlog) layout.xaxis.type = "log";
    if (calib.ylog) layout.yaxis.type = "log";
    return { title: title || "", plotly: { data: data, layout: layout } };
  }
```

Et ajouter `buildSpec: buildSpec,` dans l'objet retourné.

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

Run: `node test/test_curve_digitize.js`
Expected: PASS (11 tests OK).

- [ ] **Step 5: Commit**

```bash
git add media/curve_digitize.js test/test_curve_digitize.js
git commit -m "feat(digitalisation): buildSpec spec Plotly (TDD)"
```

---

### Task 9: Câblage extension — URI du module + message `generateCodeFromSpec`

**Files:**
- Modify: `extension.js` (zone `webviewHtml`, ~1116-1147 ; zone handler de messages, ~995)

**Interfaces:**
- Consumes: `PlotlyToPy.toMatplotlib(spec)` (déjà requis en tête de `extension.js`).
- Produces:
  - placeholder `{{curveDigitizeUri}}` substitué dans `panel.html`.
  - message webview→extension `generateCodeFromSpec {spec}` → ouvre un éditeur Python.

- [ ] **Step 1: Ajouter l'URI du module (suivre le pattern `boardLayoutUri`)**

Dans `extension.js`, après le bloc `boardLayoutUri` (~1116-1118), ajouter :

```js
  const curveDigitizeUri = webview.asWebviewUri(
    vscode.Uri.file(path.join(extContext.extensionPath, "media", "curve_digitize.js"))
  );
```

Puis dans la chaîne de `.replace(...)`, après `.replace(/{{boardLayoutUri}}/g, String(boardLayoutUri))` (~1147), ajouter (en déplaçant le `;` final) :

```js
      .replace(/{{boardLayoutUri}}/g, String(boardLayoutUri))
      .replace(/{{curveDigitizeUri}}/g, String(curveDigitizeUri));
```

- [ ] **Step 2: Ajouter le handler `generateCodeFromSpec`**

Dans `extension.js`, juste après le bloc `else if (msg.type === "createFigureFromData") { ... }` (~995), ajouter :

```js
    else if (msg.type === "generateCodeFromSpec") {
      try {
        const code = PlotlyToPy.toMatplotlib({ title: msg.title || "", plotly: msg.spec });
        const header = "# Code reconstruit par Chaz Plots a partir d'une image digitalisee\n"
          + "# (points extraits du raster ; reproduit la courbe).\n\n";
        vscode.workspace.openTextDocument({ language: "python", content: header + code })
          .then(function (doc) { return vscode.window.showTextDocument(doc); })
          .then(undefined, function (err) {
            vscode.window.showErrorMessage("Chaz Plots : impossible d'ouvrir l'editeur (" + String(err) + ")");
          });
      } catch (e) {
        vscode.window.showErrorMessage("Chaz Plots : echec de la generation du code (" + String(e) + ")");
      }
    }
```

(Note : la spec digitalisée a la forme `{title, plotly:{data,layout}}` ; on passe `plotly` dans `msg.spec` et `title` dans `msg.title`.)

- [ ] **Step 3: Vérifier la syntaxe**

Run: `node --check extension.js`
Expected: aucune sortie (OK).

- [ ] **Step 4: Commit**

```bash
git add extension.js
git commit -m "feat(digitalisation): URI module + message generateCodeFromSpec"
```

---

### Task 10: Glue webview — bouton, overlay, calibration, revue, manuel, sorties

**Files:**
- Modify: `media/panel.html`
- Modify: `test/check_panel_html.js` (placeholders + requiredIds)

**Interfaces:**
- Consumes: `self.CurveDigitize.*`, Canvas 2D (`getImageData`), `routeSystemImage` existant, messages `createFigureFromData` / `saveCsv` / `generateCodeFromSpec`.
- Produces (ids requis ajoutés à `check_panel_html.js`) : `digitizeImage`, `digitizeOverlay`, `digCalibXmin`, `digCalibXmax`, `digCalibYmin`, `digCalibYmax`, `digXlog`, `digYlog`, `digCurveList`, `digManualBtn`, `digOutFigure`, `digOutCsv`, `digOutCode`, `digClose`.

- [ ] **Step 1: Déclarer le placeholder + charger le module**

Dans `media/panel.html`, après la ligne `<script src="{{boardLayoutUri}}"></script>` (~19), ajouter :

```html
<script src="{{curveDigitizeUri}}"></script>
```

- [ ] **Step 2: Ajouter le placeholder et les ids dans le garde-fou**

Dans `test/check_panel_html.js`, ajouter `"{{curveDigitizeUri}}"` à la liste `placeholders` (après `"{{boardLayoutUri}}"`), et ajouter à `requiredIds` :

```js
  "digitizeImage", "digitizeOverlay", "digCalibXmin", "digCalibXmax",
  "digCalibYmin", "digCalibYmax", "digXlog", "digYlog", "digCurveList",
  "digManualBtn", "digOutFigure", "digOutCsv", "digOutCode", "digClose",
```

- [ ] **Step 3: Ajouter le bouton de barre d'outils**

Dans `media/panel.html`, à côté du bouton `importImage` (« Image → code »), ajouter :

```html
<button id="digitizeImage" title="Extraire les points d'une figure depuis un PNG/SVG quelconque (non genere par Chaz Plots) : detection auto des courbes par couleur/style, calibration des axes, sortie figure/CSV/code">Digitaliser</button>
```

- [ ] **Step 4: Ajouter l'overlay HTML (caché par défaut)**

Dans `media/panel.html`, avant `</body>`, ajouter le squelette de l'overlay :

```html
<div id="digitizeOverlay" class="overlay" style="display:none">
  <div class="overlay-card">
    <div class="overlay-head">Digitalisation d'une image<button id="digClose" title="Fermer">✕</button></div>
    <canvas id="digCanvas"></canvas>
    <div class="dig-calib">
      <label>X min <input id="digCalibXmin" type="number" step="any"></label>
      <label>X max <input id="digCalibXmax" type="number" step="any"></label>
      <label><input id="digXlog" type="checkbox"> X log</label>
      <label>Y min <input id="digCalibYmin" type="number" step="any"></label>
      <label>Y max <input id="digCalibYmax" type="number" step="any"></label>
      <label><input id="digYlog" type="checkbox"> Y log</label>
    </div>
    <div id="digCurveList" class="dig-curves"></div>
    <div class="dig-actions">
      <button id="digManualBtn" title="L'auto a echoue ? Cliquer un point de depart sur chaque courbe litigieuse">Recommencer en manuel</button>
      <button id="digOutFigure">Nouvelle figure</button>
      <button id="digOutCsv">Exporter CSV</button>
      <button id="digOutCode">Generer le code</button>
    </div>
  </div>
</div>
```

- [ ] **Step 5: Ajouter la glue JS (dans le `<script>` principal de `panel.html`)**

Ajouter ce bloc dans le script principal :

```js
// ----- Digitalisation d'une image quelconque -----
const digState = { img: null, box: null, curves: [], imageEl: null };

function digOpen(imgEl) {
  const ov = document.getElementById("digitizeOverlay");
  const canvas = document.getElementById("digCanvas");
  const w = imgEl.naturalWidth, h = imgEl.naturalHeight;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(imgEl, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const img = { width: w, height: h, data: data.data };
  digState.img = img;
  digState.box = CurveDigitize.detectPlotBox(img) || { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
  const clusters = CurveDigitize.clusterCurveColors(img, digState.box);
  digState.curves = CurveDigitize.extractCurves(clusters, digState.box);
  renderDigCurveList();
  ov.style.display = "flex";
}

function renderDigCurveList() {
  const host = document.getElementById("digCurveList");
  host.innerHTML = "";
  digState.curves.forEach(function (c, i) {
    const row = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = true; cb.dataset.idx = String(i);
    const sw = document.createElement("span");
    sw.style.cssText = "display:inline-block;width:12px;height:12px;margin:0 6px;background:rgb(" + c.color.join(",") + ")";
    const txt = document.createElement("span");
    txt.textContent = c.style + " — " + c.points.length + " pts" + (c.ambiguous.length ? " ⚠ " + c.ambiguous.length + " zone(s) ambigue(s)" : "");
    row.appendChild(cb); row.appendChild(sw); row.appendChild(txt);
    host.appendChild(row);
  });
}

function digCalib() {
  return {
    xmin: parseFloat(document.getElementById("digCalibXmin").value),
    xmax: parseFloat(document.getElementById("digCalibXmax").value),
    ymin: parseFloat(document.getElementById("digCalibYmin").value),
    ymax: parseFloat(document.getElementById("digCalibYmax").value),
    xlog: document.getElementById("digXlog").checked,
    ylog: document.getElementById("digYlog").checked
  };
}

function digSelectedCurves() {
  const boxes = document.querySelectorAll("#digCurveList input[type=checkbox]");
  const keep = [];
  boxes.forEach(function (b) { if (b.checked) keep.push(digState.curves[Number(b.dataset.idx)]); });
  return keep;
}

function digValidCalib(cal) {
  return [cal.xmin, cal.xmax, cal.ymin, cal.ymax].every(function (v) { return isFinite(v); })
    && cal.xmin !== cal.xmax && cal.ymin !== cal.ymax;
}

function digBuildSpec() {
  const cal = digCalib();
  if (!digValidCalib(cal)) { notify("Renseignez X min/max et Y min/max.", "warn"); return null; }
  return CurveDigitize.buildSpec(digSelectedCurves(), digState.box, cal, "Digitalisation");
}

document.getElementById("digClose").addEventListener("click", function () {
  document.getElementById("digitizeOverlay").style.display = "none";
});
document.getElementById("digOutFigure").addEventListener("click", function () {
  const spec = digBuildSpec(); if (!spec) return;
  vscode.postMessage({ type: "createFigureFromData", title: spec.title, plotly: spec.plotly });
  document.getElementById("digitizeOverlay").style.display = "none";
});
document.getElementById("digOutCode").addEventListener("click", function () {
  const spec = digBuildSpec(); if (!spec) return;
  vscode.postMessage({ type: "generateCodeFromSpec", title: spec.title, spec: spec.plotly });
});
document.getElementById("digOutCsv").addEventListener("click", function () {
  const spec = digBuildSpec(); if (!spec) return;
  const rows = [["serie", "x", "y"]];
  spec.plotly.data.forEach(function (t) {
    for (let i = 0; i < t.x.length; i++) rows.push([t.name, t.x[i], t.y[i]]);
  });
  vscode.postMessage({ type: "saveCsv", base: "digitalisation", csv: rows.map(function (r) { return r.join(","); }).join("\n") });
});

// Mode manuel : clic d'amorce sur le canvas pour chaque courbe litigieuse
let digManual = false, digSeeds = [];
document.getElementById("digManualBtn").addEventListener("click", function () {
  digManual = true; digSeeds = [];
  notify("Mode manuel : cliquez un point de depart sur chaque courbe, puis « Nouvelle figure ».", "info");
});
document.getElementById("digCanvas").addEventListener("click", function (ev) {
  if (!digManual) return;
  const canvas = document.getElementById("digCanvas");
  const r = canvas.getBoundingClientRect();
  const x = Math.round((ev.clientX - r.left) * canvas.width / r.width);
  const y = Math.round((ev.clientY - r.top) * canvas.height / r.height);
  digSeeds.push({ x: x, y: y });
  // masque = tous les pixels d'avant-plan dans la boite
  const img = digState.img, box = digState.box;
  const bg = CurveDigitize.detectBackground(img, box);
  const mask = [];
  for (let yy = box.y0 + 1; yy < box.y1; yy++) for (let xx = box.x0 + 1; xx < box.x1; xx++) {
    const i = (yy * img.width + xx) * 4;
    if (Math.abs(img.data[i] - bg.r) + Math.abs(img.data[i + 1] - bg.g) + Math.abs(img.data[i + 2] - bg.b) >= 40)
      mask.push({ x: xx, y: yy });
  }
  const traced = CurveDigitize.traceFromSeeds(mask, box, digSeeds);
  digState.curves = traced.map(function (t, i) { return { color: [30, 30, 30], style: "solid", points: t.points, ambiguous: [], name: "courbe " + (i + 1) }; });
  renderDigCurveList();
});

// Entree 1 : bouton barre d'outils
document.getElementById("digitizeImage").addEventListener("click", function () {
  ensureImageInput(); // reutilise l'input file cache de l'import image
  importFileMode = "digitize";
  importImageInput.click();
});
```

(Note : on réutilise l'`<input type=file>` caché créé par `ensureImageInput()` pour l'import image. Ajouter une variable `importFileMode` lue dans le handler `change` de cet input : si `"digitize"`, charger l'image dans un `Image()` puis appeler `digOpen(imgEl)` au lieu de `routeSystemImage`. Modifier le handler `change` de `ensureImageInput` en conséquence.)

- [ ] **Step 6: Brancher l'entrée par glisser (image non-Chaz)**

Dans la fonction qui traite un drop d'image sans données Chaz (là où aujourd'hui un message discret « pas de données » est montré), proposer la digitalisation : charger l'image dans un `Image()` et appeler `digOpen(imgEl)`. Concrètement, dans `routeSystemImage`, après échec d'extraction côté extension, le webview ne sait pas encore que c'est non-Chaz (la décision est côté extension). Pour rester simple et local au webview : le **bouton** et l'**input file** sont la voie principale ; pour le glisser, ajouter dans le handler `drop` existant des images une branche « si Shift+Alt » → `digOpen`. Documenter ce raccourci dans l'info-bulle.

```js
// dans le handler drop des images (la ou .png/.svg est routee) :
// if (ev.altKey) { const im = new Image(); im.onload = function(){ digOpen(im); }; im.src = url; return; }
```

- [ ] **Step 7: Vérifier syntaxe + garde-fou panel.html**

Run: `node --check extension.js && node test/check_panel_html.js`
Expected: `node --check` silencieux ; `check_panel_html` affiche « OK check_panel_html : N placeholders, M ids. » sans erreur.

- [ ] **Step 8: Commit**

```bash
git add media/panel.html test/check_panel_html.js
git commit -m "feat(digitalisation): UI webview (overlay, calibration, revue, manuel, sorties)"
```

---

### Task 11: Documentation (README + CLAUDE.md)

**Files:**
- Modify: `README.md` (section « Limites connues » + une entrée fonctionnelle)
- Modify: `CLAUDE.md` (nouvelle sous-section décrivant la digitalisation)

**Interfaces:**
- Consumes: rien.
- Produces: doc utilisateur + doc d'architecture.

- [ ] **Step 1: README — décrire la fonctionnalité et ses limites**

Ajouter dans `README.md` un paragraphe « Digitalisation d'une image quelconque » : bouton « Digitaliser », détection auto par couleur+style, calibration par 4 nombres (min/max des axes), cases log, revue/décochage des courbes, mode manuel à clics pour les cas ambigus. Sous « Limites connues » : même couleur+même style superposées → manuel/best-effort ; légende/texte dans la boîte → à décocher ; spines pleines requises pour la détection de boîte ; axes secondaires/cassés non gérés ; pas d'OCR (4 nombres à saisir).

- [ ] **Step 2: CLAUDE.md — sous-section d'architecture**

Ajouter sous la zone « Figure auto-portée » une sous-section « Digitalisation (PNG quelconque → points) » : module pur **webview** `media/curve_digitize.js` (`CurveDigitize`, URI injectée, contrairement à `plotly_to_py.js`/`figure_codec.js` extension-only) ; fonctions `detectPlotBox`/`detectBackground`/`clusterCurveColors`/`detectLineStyle`/`extractCurves`/`traceFromSeeds`/`pixelsToData`/`buildSpec` ; glue overlay `digitizeOverlay` dans `panel.html` ; sorties via `createFigureFromData` / `saveCsv` / nouveau message `generateCodeFromSpec` (→ `PlotlyToPy`) ; testé par `test/test_curve_digitize.js`. Ajouter `generateCodeFromSpec` à la liste du protocole de messages webview→extension.

- [ ] **Step 3: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs(digitalisation): README + CLAUDE.md"
```

---

## Self-Review

**Spec coverage :**
- Module pur + 8 fonctions → Tasks 1-8. ✓
- Calibration 4 nombres + log → Task 10 (champs `digCalib*`, `digXlog/digYlog`). ✓
- Séparation couleur+style → Tasks 4-5 + revue Task 10. ✓
- Dégradation gracieuse / mode manuel → Task 7 (math) + Task 10 (UI clics). ✓
- Sorties figure/CSV/code → Task 9 (`generateCodeFromSpec`) + Task 10 (3 boutons). ✓
- Câblage module webview (URI + placeholder + check_panel_html) → Tasks 9-10. ✓
- Tests synthétiques → Tasks 1-8 ; garde-fous → Tasks 9-10. ✓
- Limites documentées → Task 11. ✓

**Placeholder scan :** aucun « TODO/TBD » dans les steps de code ; Task 10 steps 5-6 décrivent une intégration à du code webview existant non entièrement reproductible hors contexte (input file caché, handler drop) — ce sont des points d'intégration réels, pas des placeholders, avec le code neuf fourni et les modifications existantes décrites précisément.

**Type consistency :** `box={x0,y0,x1,y1}`, `points=[{xpx,ypx}]`, `calib={xmin,xmax,ymin,ymax,xlog,ylog}`, courbe `{color,style,pixels,points,ambiguous}` — cohérents de la Task 1 à la Task 10. `buildSpec(curves, box, calib, title)` et `generateCodeFromSpec {title, spec}` (où `spec=plotly`) cohérents entre Tasks 8-10. ✓
