# Zoom-inset : placement amélioré + drag/resize manuel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Améliorer le placement automatique du zoom-inset (zone vide + coin naturel) et permettre de le déplacer/redimensionner à la souris.

**Architecture:** La géométrie/scoring pure part dans un module UMD testable `media/inset_layout.js` (modèle `media/error_math.js`). `media/panel.html` construit un contexte numérique et délègue le placement, puis branche le drag/resize sur une shape Plotly éditable via le listener `plotly_relayout` existant.

**Tech Stack:** JavaScript pur (Node pour les tests, navigateur webview pour la glue), Plotly.js v3.6.0 (embarqué), `node --check`, harnais de test maison sans dépendance.

## Global Constraints

- Langue de travail **française** : commentaires, messages de commit, docs.
- **Aucune dépendance** ajoutée (ni npm, ni build). Le module est du JS pur.
- Pas de coupling JS/Python autre que le contrat existant ; ici tout est côté webview.
- `media/inset_layout.js` est **pur** (aucun accès Plotly/DOM) : il ne reçoit que des nombres.
- Toute la logique Plotly (shapes éditables, `relayout`, `Plotly.react`) reste dans `panel.html`.
- Vérif syntaxe : `node --check extension.js` doit rester silencieux.
- Tests node existants intacts : `node test/test_error_curves.js` (26 tests OK).

---

### Task 1: Module pur `media/inset_layout.js` (grille fine + score réordonné + bornage)

**Files:**
- Create: `media/inset_layout.js`
- Test: `test/test_inset_layout.js`

**Interfaces:**
- Consumes: rien (module autonome).
- Produces (export UMD `InsetLayout`) :
  - `makeInsetCandidates(xDomain, yDomain, opts?) -> candidate[]` où `candidate = {xDomain:[x0,x1], yDomain:[y0,y1], x0,x1,y0,y1, outerXDomain, outerYDomain, sizeIndex, cornerKind}` et `cornerKind ∈ {0,1,2}`.
  - `scoreInsetCandidate(candidate, ctx) -> number` (à minimiser). `ctx = {xDomain, yDomain, xFull:[lo,hi], yFull:[lo,hi], selectedPaper?:{x0,x1,y0,y1}, traces?:[{x:number[], y:number[]}], annotationRects?:[{x0,x1,y0,y1}]}`.
  - `chooseInsetDomain(ctx) -> {xDomain:[x0,x1], yDomain:[y0,y1]}`.
  - `clampPlacement(rect, xDomain, yDomain, minSize?) -> {xDomain, yDomain}`.

- [ ] **Step 1: Écrire les tests (échec attendu — fichier module absent)**

Créer `test/test_inset_layout.js` :

```js
// Harnais de test sans dependance pour media/inset_layout.js
// Lancer : node test/test_inset_layout.js
"use strict";
const assert = require("assert");
const IL = require("../media/inset_layout.js");

let passed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log("ok   - " + name); }
  catch (e) { console.error("FAIL - " + name + " : " + e.message); process.exitCode = 1; }
}

const X = [0.08, 0.96];
const Y = [0.12, 0.94];

// --- makeInsetCandidates ---
check("makeInsetCandidates: tous les candidats sont dans le domaine", function () {
  const c = IL.makeInsetCandidates(X, Y);
  assert.ok(c.length > 0, "aucun candidat");
  c.forEach(function (k) {
    assert.ok(k.x0 >= X[0] - 1e-9 && k.x1 <= X[1] + 1e-9, "hors domaine x");
    assert.ok(k.y0 >= Y[0] - 1e-9 && k.y1 <= Y[1] + 1e-9, "hors domaine y");
  });
});
check("makeInsetCandidates: les 4 coins sont presents (cornerKind=2 >= 4)", function () {
  const c = IL.makeInsetCandidates(X, Y);
  const corners = c.filter(function (k) { return k.cornerKind === 2; });
  assert.ok(corners.length >= 4, "coins attendus >=4, recu " + corners.length);
});
check("makeInsetCandidates: grille plus fine (>3 positions x distinctes)", function () {
  const c = IL.makeInsetCandidates(X, Y);
  const xs = {};
  c.forEach(function (k) { xs[k.x0.toFixed(4)] = true; });
  assert.ok(Object.keys(xs).length > 3, "positions x distinctes <= 3");
});

// --- scoreInsetCandidate ---
function cand(x0, x1, y0, y1, sizeIndex, cornerKind) {
  return { x0: x0, x1: x1, y0: y0, y1: y1, xDomain: [x0, x1], yDomain: [y0, y1],
           outerXDomain: X, outerYDomain: Y, sizeIndex: sizeIndex || 0, cornerKind: cornerKind || 0 };
}
check("scoreInsetCandidate: une region vide bat une region chargee", function () {
  // points groupes dans le coin bas-gauche (paper ~ 0.1,0.15)
  const ctx = { xDomain: X, yDomain: Y, xFull: [0, 10], yFull: [0, 10],
                traces: [{ x: [0, 0.1, 0.2, 0.3], y: [0, 0.1, 0.2, 0.3] }] };
  const occupied = cand(0.08, 0.30, 0.12, 0.34, 0, 2); // couvre le cluster
  const empty = cand(0.74, 0.96, 0.72, 0.94, 0, 2);    // coin oppose vide
  assert.ok(IL.scoreInsetCandidate(empty, ctx) < IL.scoreInsetCandidate(occupied, ctx),
    "le vide devrait mieux scorer");
});
check("scoreInsetCandidate: coin < bord < centre (occupation egale)", function () {
  const ctx = { xDomain: X, yDomain: Y, xFull: [0, 10], yFull: [0, 10], traces: [] };
  const corner = cand(0.74, 0.96, 0.72, 0.94, 0, 2);
  const edge = cand(0.40, 0.62, 0.72, 0.94, 0, 1);
  const center = cand(0.40, 0.62, 0.40, 0.62, 0, 0);
  const sc = IL.scoreInsetCandidate(corner, ctx);
  const se = IL.scoreInsetCandidate(edge, ctx);
  const sm = IL.scoreInsetCandidate(center, ctx);
  assert.ok(sc < se, "coin doit battre bord");
  assert.ok(se < sm, "bord doit battre centre");
});
check("scoreInsetCandidate: recouvrir la selection est redhibitoire", function () {
  const ctx = { xDomain: X, yDomain: Y, xFull: [0, 10], yFull: [0, 10], traces: [],
                selectedPaper: { x0: 0.40, x1: 0.62, y0: 0.40, y1: 0.62 } };
  const overlapsSel = cand(0.40, 0.62, 0.40, 0.62, 0, 0); // centre, sur la selection
  const cleanCenter = cand(0.74, 0.96, 0.12, 0.34, 0, 2); // coin, hors selection
  assert.ok(IL.scoreInsetCandidate(cleanCenter, ctx) < IL.scoreInsetCandidate(overlapsSel, ctx),
    "ne jamais couvrir la selection");
});

// --- chooseInsetDomain ---
check("chooseInsetDomain: evite le cluster de points", function () {
  const ctx = { xDomain: X, yDomain: Y, xFull: [0, 10], yFull: [0, 10],
                traces: [{ x: [0, 0.1, 0.2, 0.3, 0.4], y: [0, 0.1, 0.2, 0.3, 0.4] }] };
  const p = IL.chooseInsetDomain(ctx);
  // aucun point du cluster ne tombe dans l'inset choisi
  const xs = ctx.traces[0].x, ys = ctx.traces[0].y;
  let inside = 0;
  for (let i = 0; i < xs.length; i++) {
    const px = X[0] + (xs[i] - 0) / (10 - 0) * (X[1] - X[0]);
    const py = Y[0] + (ys[i] - 0) / (10 - 0) * (Y[1] - Y[0]);
    if (px >= p.xDomain[0] && px <= p.xDomain[1] && py >= p.yDomain[0] && py <= p.yDomain[1]) { inside++; }
  }
  assert.strictEqual(inside, 0, "l'inset ne devrait couvrir aucun point");
});

// --- clampPlacement ---
check("clampPlacement: rectangle valide inchange", function () {
  const r = IL.clampPlacement({ x0: 0.5, x1: 0.7, y0: 0.5, y1: 0.7 }, X, Y, 0.12);
  assert.ok(Math.abs(r.xDomain[0] - 0.5) < 1e-9 && Math.abs(r.xDomain[1] - 0.7) < 1e-9);
  assert.ok(Math.abs(r.yDomain[0] - 0.5) < 1e-9 && Math.abs(r.yDomain[1] - 0.7) < 1e-9);
});
check("clampPlacement: hors domaine ramene dans les bornes", function () {
  const r = IL.clampPlacement({ x0: -0.2, x1: 0.0, y0: 1.0, y1: 1.2 }, X, Y, 0.12);
  assert.ok(r.xDomain[0] >= X[0] - 1e-9 && r.xDomain[1] <= X[1] + 1e-9, "x hors bornes");
  assert.ok(r.yDomain[0] >= Y[0] - 1e-9 && r.yDomain[1] <= Y[1] + 1e-9, "y hors bornes");
});
check("clampPlacement: trop petit ramene a la taille mini", function () {
  const r = IL.clampPlacement({ x0: 0.5, x1: 0.52, y0: 0.5, y1: 0.51 }, X, Y, 0.12);
  assert.ok(r.xDomain[1] - r.xDomain[0] >= 0.12 - 1e-9, "largeur mini non respectee");
  assert.ok(r.yDomain[1] - r.yDomain[0] >= 0.12 - 1e-9, "hauteur mini non respectee");
});

console.log("\n" + passed + " tests OK");
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `node test/test_inset_layout.js`
Expected: erreur `Cannot find module '../media/inset_layout.js'`.

- [ ] **Step 3: Implémenter le module**

Créer `media/inset_layout.js` :

```js
// ============================================================
// inset_layout.js
// Placement du zoom-inset : generation de candidats, scoring,
// bornage. Fonctions pures (aucun acces Plotly/DOM, que des
// nombres en entree). Charge dans le webview (self.InsetLayout)
// et sous Node (require). Aucune dependance.
// ============================================================
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  else { root.InsetLayout = api; }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---- helpers geometriques purs ----
  function rectArea(rect) {
    if (!rect) { return 0; }
    return Math.max(0, rect.x1 - rect.x0) * Math.max(0, rect.y1 - rect.y0);
  }
  function rectOverlapArea(a, b) {
    if (!a || !b) { return 0; }
    const x = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
    const y = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
    return x * y;
  }
  // Valeur de donnee -> coordonnee paper, via la plage complete et le domaine.
  function valueToPaper(value, fullRange, domain) {
    if (!fullRange || fullRange[0] === fullRange[1]) { return null; }
    const t = (value - fullRange[0]) / (fullRange[1] - fullRange[0]);
    return domain[0] + t * (domain[1] - domain[0]);
  }

  // ---- generation des candidats ----
  // Grille fine : `steps` positions par axe (coins inclus). cornerKind = nombre
  // de bords du domaine touches (2 = vrai coin, 1 = bord, 0 = interieur).
  function makeInsetCandidates(xDomain, yDomain, opts) {
    opts = opts || {};
    const sizes = opts.sizes || [0.34, 0.29, 0.24, 0.20];
    const steps = opts.steps || 6;
    const dx = Math.max(0.1, xDomain[1] - xDomain[0]);
    const dy = Math.max(0.1, yDomain[1] - yDomain[0]);
    const eps = Math.min(dx, dy) * 0.02;
    const candidates = [];
    const seen = {};
    sizes.forEach(function (scale, sizeIndex) {
      const w = dx * scale;
      const h = dy * scale;
      const xMax = xDomain[1] - w;
      const yMax = yDomain[1] - h;
      if (xMax < xDomain[0] - 1e-9 || yMax < yDomain[0] - 1e-9) { return; }
      for (let i = 0; i < steps; i++) {
        const tx = steps === 1 ? 0 : i / (steps - 1);
        const x0 = xDomain[0] + tx * (xMax - xDomain[0]);
        for (let j = 0; j < steps; j++) {
          const ty = steps === 1 ? 0 : j / (steps - 1);
          const y0 = yDomain[0] + ty * (yMax - yDomain[0]);
          const x1 = x0 + w;
          const y1 = y0 + h;
          const key = [x0, x1, y0, y1].map(function (v) { return v.toFixed(4); }).join(":");
          if (seen[key]) { continue; }
          seen[key] = true;
          const touchesX = (x0 - xDomain[0] <= eps) || (xDomain[1] - x1 <= eps);
          const touchesY = (y0 - yDomain[0] <= eps) || (yDomain[1] - y1 <= eps);
          candidates.push({
            xDomain: [x0, x1], yDomain: [y0, y1],
            x0: x0, x1: x1, y0: y0, y1: y1,
            outerXDomain: xDomain, outerYDomain: yDomain,
            sizeIndex: sizeIndex,
            cornerKind: (touchesX ? 1 : 0) + (touchesY ? 1 : 0)
          });
        }
      }
    });
    return candidates;
  }

  // ---- scoring (a minimiser) ----
  // Priorites decroissantes : selection (jamais couverte) > occupation des
  // donnees > recouvrement d'annotations > coin naturel > taille.
  function scoreInsetCandidate(candidate, ctx) {
    const candidateArea = Math.max(rectArea(candidate), 1e-4);
    let score = 0;

    // 1. recouvrement de la selection : redhibitoire
    if (ctx.selectedPaper) {
      score += (rectOverlapArea(candidate, ctx.selectedPaper) / candidateArea) * 9000;
    }

    // 2. occupation : fraction des points echantillonnes dans le candidat
    let total = 0, inside = 0;
    const traces = ctx.traces || [];
    for (let t = 0; t < traces.length; t++) {
      const xs = traces[t].x || [], ys = traces[t].y || [];
      const count = Math.min(xs.length, ys.length);
      if (count === 0) { continue; }
      const step = Math.max(1, Math.floor(count / 2200));
      for (let i = 0; i < count; i += step) {
        const xv = xs[i], yv = ys[i];
        if (xv == null || yv == null || isNaN(xv) || isNaN(yv)) { continue; }
        const px = valueToPaper(xv, ctx.xFull, candidate.outerXDomain);
        const py = valueToPaper(yv, ctx.yFull, candidate.outerYDomain);
        if (px == null || py == null) { continue; }
        total++;
        if (px >= candidate.x0 && px <= candidate.x1 && py >= candidate.y0 && py <= candidate.y1) { inside++; }
      }
    }
    const occupancy = total > 0 ? inside / total : 0;
    score += occupancy * 1000;

    // 3. recouvrement d'annotations
    const rects = ctx.annotationRects || [];
    for (let r = 0; r < rects.length; r++) {
      const overlap = rectOverlapArea(candidate, rects[r]);
      if (overlap > 0) { score += 120 + (overlap / candidateArea) * 500; }
    }

    // 4. coin naturel : bonus negatif (coin < bord < centre)
    score += (2 - candidate.cornerKind) * 2;

    // 5. taille : a occupation egale, prefere le plus grand
    score += candidate.sizeIndex * 3;

    return score;
  }

  // ---- choix du meilleur candidat ----
  function chooseInsetDomain(ctx) {
    const xDomain = ctx.xDomain || [0.08, 0.96];
    const yDomain = ctx.yDomain || [0.12, 0.94];
    const candidates = makeInsetCandidates(xDomain, yDomain, ctx.options);
    if (candidates.length === 0) { return { xDomain: [0.62, 0.96], yDomain: [0.60, 0.94] }; }
    let best = candidates[0];
    let bestScore = scoreInsetCandidate(best, ctx);
    for (let i = 1; i < candidates.length; i++) {
      const s = scoreInsetCandidate(candidates[i], ctx);
      if (s < bestScore) { best = candidates[i]; bestScore = s; }
    }
    return { xDomain: best.xDomain, yDomain: best.yDomain };
  }

  // ---- bornage d'un placement manuel (drag/resize) ----
  // Rectangle paper -> placement borne au domaine principal, taille mini imposee.
  function clampPlacement(rect, xDomain, yDomain, minSize) {
    const ms = minSize == null ? 0.12 : minSize;
    const outW = xDomain[1] - xDomain[0];
    const outH = yDomain[1] - yDomain[0];
    const w = Math.min(Math.max(rect.x1 - rect.x0, ms), outW);
    const h = Math.min(Math.max(rect.y1 - rect.y0, ms), outH);
    const x0 = Math.min(Math.max(rect.x0, xDomain[0]), xDomain[1] - w);
    const y0 = Math.min(Math.max(rect.y0, yDomain[0]), yDomain[1] - h);
    return { xDomain: [x0, x0 + w], yDomain: [y0, y0 + h] };
  }

  return {
    makeInsetCandidates: makeInsetCandidates,
    scoreInsetCandidate: scoreInsetCandidate,
    chooseInsetDomain: chooseInsetDomain,
    clampPlacement: clampPlacement
  };
});
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `node test/test_inset_layout.js`
Expected: tous les `ok`, dernière ligne `N tests OK`, code retour 0.

- [ ] **Step 5: Vérifier la syntaxe du module**

Run: `node --check media/inset_layout.js`
Expected: aucune sortie.

- [ ] **Step 6: Commit**

```bash
git add media/inset_layout.js test/test_inset_layout.js
git commit -m "feat(inset): module pur de placement (grille fine, score reordonne, bornage)"
```

---

### Task 2: Câbler le module dans le webview et déléguer le placement

**Files:**
- Modify: `extension.js:524-545` (ajout `insetLayoutUri`)
- Modify: `media/panel.html:7` (balise script) et `media/panel.html:654-807` (suppression helpers + réécriture `chooseInsetDomain`)

**Interfaces:**
- Consumes: `InsetLayout.chooseInsetDomain`, `InsetLayout.makeInsetCandidates` (Task 1).
- Produces: `chooseInsetDomain(baseData, baseLayout, selection) -> {xDomain, yDomain}` (signature inchangée pour `applyZoomInset`).

- [ ] **Step 1: Exposer le script au webview dans `extension.js`**

Dans `webviewHtml` (après le bloc `errorMathUri`, ligne 529-531), ajouter :

```js
  const insetLayoutUri = webview.asWebviewUri(
    vscode.Uri.file(path.join(extContext.extensionPath, "media", "inset_layout.js"))
  );
```

Et dans la chaîne de `.replace(...)` (après la ligne `errorMathUri`, ligne 544), ajouter :

```js
      .replace(/{{insetLayoutUri}}/g, String(insetLayoutUri));
```

(Attention : la ligne `errorMathUri` actuelle se termine par `;` car c'est la dernière du `return template...`. Mettre le `.replace` de `insetLayoutUri` **avant** ce `;`, ou transformer en chaîne continue. Concrètement, remplacer la ligne `.replace(/{{errorMathUri}}/g, String(errorMathUri));` par les deux lignes :)

```js
      .replace(/{{errorMathUri}}/g, String(errorMathUri))
      .replace(/{{insetLayoutUri}}/g, String(insetLayoutUri));
```

- [ ] **Step 2: Charger le script dans `panel.html`**

Dans `media/panel.html`, après la ligne 7 (`<script src="{{errorMathUri}}"></script>`), ajouter :

```html
<script src="{{insetLayoutUri}}"></script>
```

- [ ] **Step 3: Supprimer les helpers déplacés et réécrire `chooseInsetDomain`**

Dans `media/panel.html` :

1. **Supprimer** `function rectArea(rect){...}` (lignes 654-657) et `function rectOverlapArea(a, b){...}` (lignes 659-664) — désormais dans le module et plus utilisés ailleurs dans `panel.html`.

2. **Supprimer** `function makeInsetCandidates(xDomain, yDomain){...}` (lignes 712-754) et `function scoreInsetCandidate(...){...}` (lignes 756-787).

3. **Remplacer** entièrement `function chooseInsetDomain(...){...}` (lignes 789-807) par cette version qui construit un contexte numérique et délègue :

```js
  // Construit le contexte numerique (coordonnees paper, points convertis) et
  // delegue le choix de placement au module pur InsetLayout.
  function chooseInsetDomain(baseData, baseLayout, selection){
    const xAxis = baseLayout[selection.xaxisKey] || {};
    const yAxis = baseLayout[selection.yaxisKey] || {};
    const xDomain = Array.isArray(xAxis.domain) ? xAxis.domain : [0.08, 0.96];
    const yDomain = Array.isArray(yAxis.domain) ? yAxis.domain : [0.12, 0.94];
    const traces = matchingAxisTraces(baseData, selection.xRef, selection.yRef);
    const xFull = fullAxisRange(baseLayout, traces, selection.xaxisKey, "x");
    const yFull = fullAxisRange(baseLayout, traces, selection.yaxisKey, "y");
    if (!xFull || !yFull || traces.length === 0){
      const cands = InsetLayout.makeInsetCandidates(xDomain, yDomain);
      return cands.length ? { xDomain: cands[0].xDomain, yDomain: cands[0].yDomain }
                          : { xDomain: [0.62, 0.96], yDomain: [0.60, 0.94] };
    }
    const selectedPaper = selectionPaperRect(baseLayout, selection, xFull, yFull, xDomain, yDomain, xAxis, yAxis);
    const baseAnns = Array.isArray(baseLayout.annotations) ? baseLayout.annotations : [];
    const annotationRects = [];
    baseAnns.forEach(function(a){
      const r = annotationPaperRect(a, baseLayout, selection, xFull, yFull, xDomain, yDomain);
      if (r){ annotationRects.push(r); }
    });
    // points convertis en nombres (dates gerees par pointNumber)
    const numTraces = traces.map(function(t){
      const xs = Array.isArray(t.x) ? t.x : [];
      const ys = Array.isArray(t.y) ? t.y : [];
      const n = Math.min(xs.length, ys.length);
      const ox = new Array(n), oy = new Array(n);
      for (let i = 0; i < n; i++){ ox[i] = pointNumber(xs[i], xAxis); oy[i] = pointNumber(ys[i], yAxis); }
      return { x: ox, y: oy };
    });
    return InsetLayout.chooseInsetDomain({
      xDomain: xDomain, yDomain: yDomain, xFull: xFull, yFull: yFull,
      selectedPaper: selectedPaper, traces: numTraces, annotationRects: annotationRects
    });
  }
```

(Note : `valueToPaper` reste dans `panel.html` — il est encore utilisé par `rangeToPaperDomain` et `annotationPaperRect`.)

- [ ] **Step 4: Vérifier la syntaxe du JS de `panel.html`**

Le JS du webview est dans une balise `<script>`. Extraire le bloc et le vérifier :

Run:
```bash
node -e "const fs=require('fs');const h=fs.readFileSync('media/panel.html','utf8');const m=h.match(/<script nonce=\"\{\{nonce\}\}\">([\s\S]*?)<\/script>/);if(!m){console.error('bloc script introuvable');process.exit(1);}require('vm').compileFunction(m[1]);console.log('panel.html script OK');"
```
Expected: `panel.html script OK` (aucune erreur de syntaxe).

- [ ] **Step 5: Non-régression node**

Run: `node --check extension.js`
Expected: aucune sortie.

Run: `node test/test_inset_layout.js`
Expected: tous OK (module inchangé, sanity).

- [ ] **Step 6: Vérification manuelle (Extension Development Host)**

Ouvrir le dossier dans VS Code, F5, puis dans un **nouveau** terminal du dev host : `python test/test_plots.py`. Sur une figure avec courbes : armer l'inset (bouton), tracer une zone → l'encart apparaît, placé dans une zone vide / un coin naturel (pas par-dessus les courbes). Comportement au moins aussi bon qu'avant.

- [ ] **Step 7: Commit**

```bash
git add extension.js media/panel.html
git commit -m "refactor(inset): delegue le placement au module InsetLayout"
```

---

### Task 3: Déplacement + redimensionnement manuel de l'inset

**Files:**
- Modify: `media/panel.html` — `applyZoomInset` (960-1004), `clearZoomInset` (1006-1013), listener `plotly_relayout` (1110-1123), nouveau helper `handleInsetDrag`.

**Interfaces:**
- Consumes: `InsetLayout.clampPlacement` (Task 1) ; `applyZoomInset(el, selection, placementOverride?)`.
- Produces: état sur l'élément `el._spInsetSelection`, `el._spInsetBorderIndex` ; helper `handleInsetDrag(el, update) -> boolean`.

- [ ] **Step 1: `applyZoomInset` accepte un placement explicite + shape éditable**

Dans `media/panel.html`, modifier `applyZoomInset`.

1a. Signature (ligne 960) — remplacer :
```js
  function applyZoomInset(el, selection){
```
par :
```js
  function applyZoomInset(el, selection, placementOverride){
```

1b. Calcul du placement (ligne 967) — remplacer :
```js
    const placement = chooseInsetDomain(baseData, baseLayout, selection);
```
par :
```js
    const placement = placementOverride || chooseInsetDomain(baseData, baseLayout, selection);
    el._spInsetSelection = selection;
```

1c. Shape de sélection non éditable — dans le premier `shapes.push({...})` (la zone source, lignes 979-985), ajouter `editable: false` :
```js
    shapes.push({
      type: "rect", xref: selection.xRef, yref: selection.yRef,
      x0: selection.xRange[0], x1: selection.xRange[1],
      y0: selection.yRange[0], y1: selection.yRange[1],
      fillcolor: "rgba(55,148,255,0.08)",
      line: { color: "rgba(55,148,255,0.95)", width: 2, dash: "dash" },
      editable: false
    });
```

1d. Shape de bordure éditable + mémoriser son index — dans le second `shapes.push({...})` (la bordure paper, lignes 986-992), ajouter `editable: true`, puis enregistrer l'index :
```js
    shapes.push({
      type: "rect", xref: "paper", yref: "paper",
      x0: placement.xDomain[0], x1: placement.xDomain[1],
      y0: placement.yDomain[0], y1: placement.yDomain[1],
      fillcolor: "rgba(255,255,255,0)",
      line: { color: "rgba(55,148,255,0.95)", width: 2 },
      editable: true
    });
    el._spInsetBorderIndex = shapes.length - 1;
```

1e. Activer l'édition de shapes dans la config du `react` (ligne 1003) — remplacer :
```js
    Plotly.react(el, baseData.concat(additions), baseLayout, el._spConfig || plotlyConfig(el._spFig || {}));
```
par :
```js
    const baseConfig = el._spConfig || plotlyConfig(el._spFig || {});
    const insetConfig = Object.assign({}, baseConfig, {
      edits: Object.assign({}, baseConfig.edits, { shapePosition: true })
    });
    Plotly.react(el, baseData.concat(additions), baseLayout, insetConfig);
```

- [ ] **Step 2: `clearZoomInset` nettoie l'état d'inset**

Dans `clearZoomInset` (lignes 1006-1013), après `el._spHasInset = false;` (ligne 1010), ajouter :
```js
    el._spInsetSelection = null;
    el._spInsetBorderIndex = null;
```

- [ ] **Step 3: Helper `handleInsetDrag`**

Ajouter ce helper juste avant `function applyZoomInset` (vers la ligne 959) :

```js
  // Drag/resize de la bordure d'inset : lit les nouvelles bornes paper du
  // shape editable, borne le placement, et reconstruit l'inset. Renvoie true
  // si l'update concernait bien la bordure.
  function handleInsetDrag(el, update){
    const bi = el._spInsetBorderIndex;
    if (bi == null){ return false; }
    const cur = (el.layout && Array.isArray(el.layout.shapes) && el.layout.shapes[bi]) || {};
    const rect = {};
    let touched = false;
    ["x0", "x1", "y0", "y1"].forEach(function(k){
      const key = "shapes[" + bi + "]." + k;
      if (update[key] !== undefined){ rect[k] = Number(update[key]); touched = true; }
      else { rect[k] = Number(cur[k]); }
    });
    if (!touched){ return false; }
    // le drag peut inverser les bornes
    const nrect = {
      x0: Math.min(rect.x0, rect.x1), x1: Math.max(rect.x0, rect.x1),
      y0: Math.min(rect.y0, rect.y1), y1: Math.max(rect.y0, rect.y1)
    };
    const sel = el._spInsetSelection;
    if (!sel){ return false; }
    const baseLayout = el._spBaseLayout || {};
    const xAxis = baseLayout[sel.xaxisKey] || {};
    const yAxis = baseLayout[sel.yaxisKey] || {};
    const xDomain = Array.isArray(xAxis.domain) ? xAxis.domain : [0.08, 0.96];
    const yDomain = Array.isArray(yAxis.domain) ? yAxis.domain : [0.12, 0.94];
    const placement = InsetLayout.clampPlacement(nrect, xDomain, yDomain, 0.12);
    applyZoomInset(el, sel, placement);
    return true;
  }
```

- [ ] **Step 4: Brancher le drag dans le listener `plotly_relayout`**

Remplacer le corps du listener (lignes 1111-1122) par :

```js
      el.on("plotly_relayout", function(update){
        // 1. Drag/resize d'un inset existant (bordure editable)
        if (!el._spInsetActive && el._spHasInset){
          handleInsetDrag(el, update);
          return;
        }
        // 2. Capture de la zone a zoomer (inset arme)
        if (!el._spInsetActive){ return; }
        const selection = parseZoomInsetSelection(update);
        if (!selection){ return; }
        const state = el._spInsetActive;
        el._spInsetActive = null;
        const wrap = el.parentElement;
        if (wrap){ wrap.classList.remove("inset-armed"); }
        if (state.coordsEl){ state.coordsEl.textContent = ""; }
        markZoomInsetButton(el);
        applyZoomInset(el, selection);
      });
```

- [ ] **Step 5: Vérifier la syntaxe du JS de `panel.html`**

Run:
```bash
node -e "const fs=require('fs');const h=fs.readFileSync('media/panel.html','utf8');const m=h.match(/<script nonce=\"\{\{nonce\}\}\">([\s\S]*?)<\/script>/);if(!m){console.error('bloc script introuvable');process.exit(1);}require('vm').compileFunction(m[1]);console.log('panel.html script OK');"
```
Expected: `panel.html script OK`.

- [ ] **Step 6: Vérification manuelle (Extension Development Host)**

F5, nouveau terminal, `python test/test_plots.py`. Sur une figure :
1. Armer l'inset, tracer une zone → encart placé automatiquement.
2. **Déplacer** l'encart (glisser le corps de la bordure bleue) → l'encart se repositionne, les traces (et annotations) suivent ; la zone source en pointillés **ne bouge pas**.
3. **Redimensionner** (tirer un bord/coin de la bordure) → la vue zoomée se réajuste ; jamais hors-graphe, jamais plus petit que ~0,12.

Si Plotly v3.6.0 ne permet pas le resize de la bordure (seulement le déplacement), noter le constat : repli possible vers un overlay DOM (Approche B) — hors périmètre de ce plan, à rediscuter.

- [ ] **Step 7: Commit**

```bash
git add media/panel.html
git commit -m "feat(inset): deplacement et redimensionnement manuel de l'encart"
```

---

### Task 4: Documentation + vérification finale

**Files:**
- Modify: `CLAUDE.md` (section décrivant `panel.html` / `error_math.js`)

**Interfaces:** aucune.

- [ ] **Step 1: Mettre à jour `CLAUDE.md`**

Dans la section « `media/panel.html` », à la fin du paragraphe mentionnant `media/error_math.js`, ajouter :

```markdown
Le placement du zoom-inset (« agrandir une zone » en mode overlay) — génération
des candidats, scoring (évite données/annotations, préfère un coin vide) et
bornage du drag — vit dans `media/inset_layout.js` (module pur UMD :
`self.InsetLayout` dans le webview, `require` sous Node), testé par
`test/test_inset_layout.js`. La glue Plotly (bordure éditable, écoute
`plotly_relayout` pour déplacer/redimensionner l'encart) reste dans `panel.html`.
```

- [ ] **Step 2: Vérification finale complète**

Run: `node test/test_inset_layout.js`
Expected: tous OK.

Run: `node test/test_error_curves.js`
Expected: 26 tests OK (lot précédent intact).

Run: `node --check extension.js`
Expected: aucune sortie.

Run: `python test/test_convert.py`
Expected: vert (converter non touché — sanity).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: zoom-inset (placement ameliore + drag/resize)"
```

---

## Notes d'implémentation

- **DRY** : `media/inset_layout.js` possède ses propres `rectArea`/`rectOverlapArea`/`valueToPaper` (≈5 lignes chacune) ; `panel.html` garde son `valueToPaper` car d'autres helpers de glue (`rangeToPaperDomain`, `annotationPaperRect`) l'utilisent. Duplication minime et assumée, comme la frontière `error_math.js`/`panel.html`.
- **YAGNI** : pas de carving de marge, pas de snapping, pas de poignées custom, pas de persistance disque de la position de l'inset.
- **Frontière de test** : tout ce qui est pur (candidats, score, bornage) est testé en node ; la glue Plotly est vérifiée manuellement dans le dev host (pas de runner pour le webview).
- **Risque Plotly** : confirmer tôt (Task 3, Step 6) que la bordure éditable donne déplacement **et** redimensionnement. Repli éventuel = overlay DOM (Approche B), non couvert ici.
