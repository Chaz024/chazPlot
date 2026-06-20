# Overlay HTML déplacer/redimensionner l'encart — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le drag/resize natif (shape Plotly éditable) de l'encart de zoom par un overlay HTML : déplacer en saisissant tout l'intérieur, redimensionner via 4 poignées de coin.

**Architecture:** Maths pures pixel↔paper et transformation de placement dans le module testable `media/inset_layout.js` ; glue DOM/Plotly (overlay, pointer events, intégration) dans `media/panel.html`. C'est l'overlay qui capte les `pointer` events — plus Plotly — ce qui supprime la ré-entrance `plotly_relayout`. La bordure colorée visible reste une shape Plotly non-éditable (export PNG).

**Tech Stack:** JavaScript (pas de build, pas de dépendance), Plotly.js bundlé, tests Node (`node test/...`).

## Global Constraints

- Langue de travail **française** : commentaires, messages de commit, docs, strings UI.
- Le module Python n'est **pas touché** ; le chantier `types-interactifs` (diff non commité de `_mpl_to_plotly.py`) est **hors périmètre** — ne pas le committer.
- `media/inset_layout.js` reste un **module pur UMD sans dépendance** (aucun accès DOM/Plotly).
- Convention paper : `y` va de `0` (bas) à `1` (haut). Convention pixel : `y` va de `0` (haut) vers le bas.
- `size` = `el._fullLayout._size` = `{l, t, w, h}` (marge gauche, marge haute, largeur, hauteur de l'aire de tracé en px).
- `placement` = `{xDomain: [x0, x1], yDomain: [y0, y1]}` en coords paper.
- Taille mini de l'encart : `0.12` (paper), comme l'appel `clampPlacement` actuel.
- Vérif syntaxe JS : `node --check extension.js`. `panel.html` n'a pas de test-runner (relecture + test manuel).

---

### Task 1: Fonctions de géométrie pures (`inset_layout.js`)

**Files:**
- Modify: `media/inset_layout.js` (4 fonctions + ajout aux exports, ~ligne 154)
- Test: `test/test_inset_layout.js` (nouveaux `check(...)` avant la ligne finale `console.log`)

**Interfaces:**
- Consumes: rien (fonctions autonomes).
- Produces (exportées sur l'objet du module, consommées par `panel.html` en Task 2) :
  - `paperRectToPixels(placement, size) -> {left, top, width, height}` (px)
  - `pixelDeltaToPaper(dxPx, dyPx, size) -> {dx, dy}` (paper)
  - `movePlacement(placement, dxPaper, dyPaper) -> {xDomain, yDomain}` (translation brute)
  - `resizePlacement(placement, corner, dxPaper, dyPaper, minSize) -> {xDomain, yDomain}` ; `corner` ∈ `'nw'|'ne'|'sw'|'se'`, ancre le coin opposé, impose `minSize`.

- [ ] **Step 1: Écrire les tests (échec attendu)**

Dans `test/test_inset_layout.js`, **avant** la ligne finale `console.log("\n" + passed + " tests OK");`, ajouter :

```javascript
// --- paperRectToPixels ---
check("paperRectToPixels: mappe domaine -> pixels (y inverse)", function () {
  const size = { l: 50, t: 20, w: 400, h: 300 };
  const px = IL.paperRectToPixels({ xDomain: [0.25, 0.75], yDomain: [0.0, 1.0] }, size);
  assert.ok(Math.abs(px.left - (50 + 0.25 * 400)) < 1e-9, "left");
  assert.ok(Math.abs(px.width - (0.5 * 400)) < 1e-9, "width");
  assert.ok(Math.abs(px.top - 20) < 1e-9, "top (yDomain haut=1 -> top=t)");
  assert.ok(Math.abs(px.height - 300) < 1e-9, "height");
});

// --- pixelDeltaToPaper ---
check("pixelDeltaToPaper: dy inverse, normalise par la taille", function () {
  const size = { l: 0, t: 0, w: 200, h: 100 };
  const d = IL.pixelDeltaToPaper(20, 10, size);
  assert.ok(Math.abs(d.dx - 0.1) < 1e-9, "dx");
  assert.ok(Math.abs(d.dy - (-0.1)) < 1e-9, "dy inverse");
});

// --- movePlacement ---
check("movePlacement: translate les deux domaines", function () {
  const p = IL.movePlacement({ xDomain: [0.2, 0.4], yDomain: [0.5, 0.7] }, 0.1, -0.05);
  assert.ok(Math.abs(p.xDomain[0] - 0.3) < 1e-9 && Math.abs(p.xDomain[1] - 0.5) < 1e-9, "x");
  assert.ok(Math.abs(p.yDomain[0] - 0.45) < 1e-9 && Math.abs(p.yDomain[1] - 0.65) < 1e-9, "y");
});

// --- resizePlacement ---
check("resizePlacement: coin 'se' ancre le coin 'nw'", function () {
  // se = est + sud : bouge x1 (droite) et y0 (bas) ; x0 et y1 ancres
  const p = IL.resizePlacement({ xDomain: [0.2, 0.6], yDomain: [0.3, 0.7] }, "se", 0.1, -0.1, 0.12);
  assert.ok(Math.abs(p.xDomain[0] - 0.2) < 1e-9, "x0 ancre");
  assert.ok(Math.abs(p.xDomain[1] - 0.7) < 1e-9, "x1 deplace (+0.1)");
  assert.ok(Math.abs(p.yDomain[1] - 0.7) < 1e-9, "y1 ancre");
  assert.ok(Math.abs(p.yDomain[0] - 0.2) < 1e-9, "y0 deplace (dy=-0.1)");
});
check("resizePlacement: respecte la taille mini contre le coin ancre", function () {
  // nw = ouest + nord : bouge x0 et y1 ; on tente d'ecraser au-dela du mini
  const p = IL.resizePlacement({ xDomain: [0.2, 0.6], yDomain: [0.3, 0.7] }, "nw", 0.5, -0.5, 0.12);
  assert.ok(Math.abs(p.xDomain[0] - 0.48) < 1e-9, "x0 borne par mini (x1 - 0.12)");
  assert.ok(Math.abs(p.yDomain[1] - 0.42) < 1e-9, "y1 borne par mini (y0 + 0.12)");
});
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `node test/test_inset_layout.js`
Expected: ÉCHEC — `IL.paperRectToPixels is not a function` (fonctions non définies).

- [ ] **Step 3: Implémenter les 4 fonctions**

Dans `media/inset_layout.js`, **après** `clampPlacement` (qui se termine ~ligne 152) et **avant** le `return { ... };`, ajouter :

```javascript
  // ---- geometrie pixel <-> paper (pour l'overlay de drag/resize) ----
  // placement paper -> rectangle pixel dans l'aire de trace. size = _fullLayout._size.
  function paperRectToPixels(placement, size) {
    const x0 = placement.xDomain[0], x1 = placement.xDomain[1];
    const y0 = placement.yDomain[0], y1 = placement.yDomain[1];
    return {
      left: size.l + x0 * size.w,
      top: size.t + (1 - y1) * size.h,   // y paper monte, y pixel descend
      width: (x1 - x0) * size.w,
      height: (y1 - y0) * size.h
    };
  }

  // delta de deplacement en pixels -> delta en paper (dy inverse).
  function pixelDeltaToPaper(dxPx, dyPx, size) {
    return { dx: dxPx / size.w, dy: -dyPx / size.h };
  }

  // translation brute des deux domaines (bornage delegue a clampPlacement).
  function movePlacement(placement, dxPaper, dyPaper) {
    return {
      xDomain: [placement.xDomain[0] + dxPaper, placement.xDomain[1] + dxPaper],
      yDomain: [placement.yDomain[0] + dyPaper, placement.yDomain[1] + dyPaper]
    };
  }

  // deplace le coin saisi, ancre le coin oppose, impose la taille mini.
  // corner : 'n'/'s' = haut/bas (paper), 'e'/'w' = droite/gauche.
  function resizePlacement(placement, corner, dxPaper, dyPaper, minSize) {
    const ms = minSize == null ? 0.12 : minSize;
    let x0 = placement.xDomain[0], x1 = placement.xDomain[1];
    let y0 = placement.yDomain[0], y1 = placement.yDomain[1];
    if (corner.indexOf("e") >= 0) { x1 = Math.max(x1 + dxPaper, x0 + ms); }
    if (corner.indexOf("w") >= 0) { x0 = Math.min(x0 + dxPaper, x1 - ms); }
    if (corner.indexOf("n") >= 0) { y1 = Math.max(y1 + dyPaper, y0 + ms); }
    if (corner.indexOf("s") >= 0) { y0 = Math.min(y0 + dyPaper, y1 - ms); }
    return { xDomain: [x0, x1], yDomain: [y0, y1] };
  }
```

Puis, dans le `return { ... };` final, ajouter les 4 exports (après `clampPlacement: clampPlacement`) :

```javascript
    clampPlacement: clampPlacement,
    paperRectToPixels: paperRectToPixels,
    pixelDeltaToPaper: pixelDeltaToPaper,
    movePlacement: movePlacement,
    resizePlacement: resizePlacement
```

(Veiller à ce que la ligne `clampPlacement: clampPlacement` se termine désormais par une virgule.)

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `node test/test_inset_layout.js`
Expected: tous les `ok -` passent, dont les 5 nouveaux ; ligne finale « N tests OK ».

- [ ] **Step 5: Commit**

```bash
git add media/inset_layout.js test/test_inset_layout.js
git commit -m "feat(inset): geometrie pixel<->paper + move/resize purs"
```

---

### Task 2: Overlay HTML & intégration (`panel.html`)

**Files:**
- Modify: `media/panel.html` — bloc `<style>` (CSS overlay) ; suppression de `handleInsetDrag` (~l. 892-937) ; nouvelles fonctions overlay ; `applyZoomInset` (~l. 959-991) ; `clearZoomInset` (~l. 994-1004) ; `cancelZoomInset` (~l. 1013-1025) ; `armZoomInset` (~l. 1027-1038) ; listener `plotly_relayout` (~l. 1102-1119) ; handler `window.resize` (~l. 1130-1141).

**Interfaces:**
- Consumes (Task 1) : `InsetLayout.paperRectToPixels`, `InsetLayout.pixelDeltaToPaper`, `InsetLayout.movePlacement`, `InsetLayout.resizePlacement`, `InsetLayout.clampPlacement`.
- Consumes (existant) : `applyZoomInset(el, selection, placementOverride)`, `el._spInsetSelection`, `el._spInsetPlacement`, `el._spBaseLayout`, `el._fullLayout._size`, `el._spHasInset`, `el._spInsetActive`.
- Produces : `mountInsetOverlay(el)`, `positionInsetOverlay(el)`, `unmountInsetOverlay(el)` (utilisées par `applyZoomInset`/`clearZoomInset`/`window.resize`).

> Pas de test automatisé pour cette glue (cohérent avec l'existant : seule la logique pure est testée). Vérification : `node --check extension.js` (inchangé mais sain de le lancer), relecture, et test manuel dans l'Extension Development Host (Step 8).

- [ ] **Step 1: Ajouter le CSS de l'overlay**

Dans `media/panel.html`, à la fin du bloc `<style> … </style>`, ajouter :

```css
    .inset-overlay {
      position: absolute; box-sizing: border-box; z-index: 5;
      cursor: move; background: transparent; touch-action: none;
    }
    .inset-handle {
      position: absolute; width: 12px; height: 12px; box-sizing: border-box;
      background: #fff; border: 2px solid rgba(55,148,255,0.95);
      border-radius: 2px; touch-action: none;
    }
    .inset-handle-nw { left: -6px; top: -6px; cursor: nwse-resize; }
    .inset-handle-ne { right: -6px; top: -6px; cursor: nesw-resize; }
    .inset-handle-sw { left: -6px; bottom: -6px; cursor: nesw-resize; }
    .inset-handle-se { right: -6px; bottom: -6px; cursor: nwse-resize; }
```

- [ ] **Step 2: Supprimer l'ancien mécanisme de drag**

Dans `media/panel.html`, **supprimer entièrement** la fonction `handleInsetDrag` (de la ligne de commentaire `// Drag/resize de la bordure d'inset …` jusqu'à la fonction incluse, ~l. 889-937 ; ceci retire aussi le bloc « DEBUG TEMPORAIRE (a retirer) »).

Dans le listener `plotly_relayout` (`renderPlotly`, ~l. 1102), **supprimer** la branche 1 :

```javascript
        // 1. Drag/resize d'un inset existant (bordure editable)
        if (!el._spInsetActive && el._spHasInset){
          handleInsetDrag(el, update);
          return;
        }
```

Le corps du listener commence désormais directement par le commentaire « 2. Capture de la zone a zoomer ».

- [ ] **Step 3: Ajouter les fonctions de l'overlay**

Dans `media/panel.html`, juste **avant** `function applyZoomInset(` (~l. 939), insérer :

```javascript
  // ----------------------------------------------------------
  // Overlay HTML de l'encart : corps = deplacer, 4 coins = redimensionner.
  // C'est l'overlay (pas Plotly) qui capte les pointer events -> pas de
  // re-entrance plotly_relayout. La bordure visible reste une shape Plotly.
  // ----------------------------------------------------------
  const INSET_MIN_SIZE = 0.12;
  const INSET_CORNERS = ["nw", "ne", "sw", "se"];

  function mountInsetOverlay(el){
    if (el._spInsetOverlay){ return el._spInsetOverlay; }
    const wrap = el.parentElement;
    if (!wrap){ return null; }
    if (getComputedStyle(wrap).position === "static"){ wrap.style.position = "relative"; }
    const overlay = document.createElement("div");
    overlay.className = "inset-overlay";
    overlay.addEventListener("pointerdown", function(ev){
      if (ev.target !== overlay){ return; }      // une poignee gere son resize
      startInsetDrag(el, ev, InsetLayout.movePlacement);
    });
    INSET_CORNERS.forEach(function(corner){
      const h = document.createElement("div");
      h.className = "inset-handle inset-handle-" + corner;
      h.addEventListener("pointerdown", function(ev){
        startInsetDrag(el, ev, function(p, dx, dy){
          return InsetLayout.resizePlacement(p, corner, dx, dy, INSET_MIN_SIZE);
        });
      });
      overlay.appendChild(h);
    });
    wrap.appendChild(overlay);
    el._spInsetOverlay = overlay;
    return overlay;
  }

  function positionInsetOverlay(el){
    const overlay = el._spInsetOverlay;
    const placement = el._spInsetPlacement;
    const size = el._fullLayout && el._fullLayout._size;
    if (!overlay || !placement || !size){ return; }
    const box = InsetLayout.paperRectToPixels(placement, size);
    overlay.style.left = (el.offsetLeft + box.left) + "px";
    overlay.style.top = (el.offsetTop + box.top) + "px";
    overlay.style.width = box.width + "px";
    overlay.style.height = box.height + "px";
    overlay.style.display = el._spInsetActive ? "none" : "block";
  }

  function unmountInsetOverlay(el){
    const overlay = el._spInsetOverlay;
    if (overlay && overlay.parentElement){ overlay.parentElement.removeChild(overlay); }
    el._spInsetOverlay = null;
  }

  // pointerdown -> drag : `transform(startPlacement, dxPaper, dyPaper)` produit
  // le placement brut, borne ensuite par clampPlacement.
  function startInsetDrag(el, ev, transform){
    if (el._spInsetActive){ return; }            // arming d'une zone : ne pas gener
    const sel = el._spInsetSelection;
    const size = el._fullLayout && el._fullLayout._size;
    const startPlacement = el._spInsetPlacement;
    if (!sel || !size || !startPlacement){ return; }
    ev.preventDefault();
    ev.stopPropagation();
    const target = ev.currentTarget;
    try { target.setPointerCapture(ev.pointerId); } catch (e) {}
    const startX = ev.clientX, startY = ev.clientY;
    const baseLayout = el._spBaseLayout || {};
    const xDomain = (baseLayout[sel.xaxisKey] || {}).domain || [0.08, 0.96];
    const yDomain = (baseLayout[sel.yaxisKey] || {}).domain || [0.12, 0.94];
    let raf = null, pending = null;
    function onMove(e){
      pending = e;
      if (raf){ return; }
      raf = requestAnimationFrame(function(){
        raf = null;
        const d = InsetLayout.pixelDeltaToPaper(pending.clientX - startX, pending.clientY - startY, size);
        const next = transform(startPlacement, d.dx, d.dy);
        const placement = InsetLayout.clampPlacement(
          { x0: next.xDomain[0], x1: next.xDomain[1], y0: next.yDomain[0], y1: next.yDomain[1] },
          xDomain, yDomain, INSET_MIN_SIZE);
        applyZoomInset(el, sel, placement);
        positionInsetOverlay(el);
      });
    }
    function onUp(e){
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      try { target.releasePointerCapture(e.pointerId); } catch (err) {}
      if (raf){ cancelAnimationFrame(raf); raf = null; }
    }
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  }
```

- [ ] **Step 4: Adapter `applyZoomInset` (bordure non-éditable + montage overlay)**

Dans `applyZoomInset`, la 2ᵉ shape poussée (la bordure de l'encart, ~l. 968-975) : remplacer `editable: true` par `editable: false`.

**Supprimer** la ligne `el._spInsetBorderIndex = shapes.length - 1;` (~l. 976).

Remplacer le bloc final (~l. 987-991) :

```javascript
    const baseConfig = el._spConfig || plotlyConfig(el._spFig || {});
    const insetConfig = Object.assign({}, baseConfig, {
      edits: Object.assign({}, baseConfig.edits, { shapePosition: true })
    });
    Plotly.react(el, baseData.concat(additions), baseLayout, insetConfig);
```

par :

```javascript
    const baseConfig = el._spConfig || plotlyConfig(el._spFig || {});
    Plotly.react(el, baseData.concat(additions), baseLayout, baseConfig);
    mountInsetOverlay(el);
    requestAnimationFrame(function(){ positionInsetOverlay(el); });
```

- [ ] **Step 5: Démontage et réaffichage de l'overlay**

Dans `clearZoomInset` (~l. 994), **supprimer** la ligne `el._spInsetBorderIndex = null;` et ajouter `unmountInsetOverlay(el);` avant le `Plotly.react` de remise à zéro :

```javascript
  function clearZoomInset(el){
    if (!el || typeof Plotly === "undefined"){ return; }
    if (el._spInsetActive){ cancelZoomInset(el); }
    if (!el._spHasInset){ return; }
    el._spHasInset = false;
    el._spInsetSelection = null;
    el._spInsetPlacement = null;
    unmountInsetOverlay(el);
    markZoomInsetButton(el);
    Plotly.react(el, clone(el._spBaseData || []), baseLayoutForPlot(el), el._spConfig || plotlyConfig(el._spFig || {}));
  }
```

Dans `armZoomInset` (~l. 1027), masquer l'overlay pendant le tracé d'une nouvelle zone — ajouter, juste avant `Plotly.relayout(el, { dragmode: "zoom" });` :

```javascript
    if (el._spInsetOverlay){ el._spInsetOverlay.style.display = "none"; }
```

Dans `cancelZoomInset` (~l. 1013), réafficher l'overlay si un encart existe — ajouter, juste avant le `try { Plotly.relayout(el, dragUpdate); } catch (e) {}` final :

```javascript
    if (el._spInsetOverlay){ positionInsetOverlay(el); }
```

- [ ] **Step 6: Repositionner l'overlay au redimensionnement de la fenêtre**

Dans le handler `window.addEventListener("resize", …)` (~l. 1131), remplacer la ligne :

```javascript
        try { Plotly.relayout(p.el, { height: listPlotHeight(p.el, p.fig) }); } catch (e) {}
```

par :

```javascript
        try {
          Plotly.relayout(p.el, { height: listPlotHeight(p.el, p.fig) }).then(function(){
            if (p.el._spHasInset){ positionInsetOverlay(p.el); }
          });
        } catch (e) {}
```

- [ ] **Step 7: Vérif syntaxe + grep de cohérence**

Run: `node --check extension.js`
Expected: aucune sortie (succès).

Run: `grep -n "handleInsetDrag\|_spInsetBorderIndex\|shapePosition" media/panel.html`
Expected: **aucune** occurrence (tout l'ancien mécanisme retiré).

- [ ] **Step 8: Test manuel (Extension Development Host)**

Ouvrir le dossier `spyder-plots/` dans VS Code, F5 (« Run Extension »). Dans la fenêtre de dev, **nouveau terminal**, puis `python test/test_plots.py`. Sur une figure interactive :
1. Cliquer « agrandir une zone », tracer une sélection → l'encart apparaît avec 4 poignées.
2. **Déplacer** : saisir n'importe où dans l'intérieur de l'encart → il suit le curseur.
3. **Redimensionner** : tirer chacun des 4 coins → le coin opposé reste ancré, taille mini respectée.
4. Redimensionner la fenêtre VS Code → l'overlay se recale sur l'encart.
5. Exporter l'encart en PNG (bouton de sauvegarde) → la bordure bleue de l'encart est présente (les poignées n'apparaissent pas : chrome HTML, attendu).
6. Supprimer l'encart / re-sélectionner une autre zone → pas d'overlay résiduel.

Expected: tous les points OK. Si un point échoue, déboguer avant de committer (superpowers:systematic-debugging).

- [ ] **Step 9: Commit**

```bash
git add media/panel.html
git commit -m "feat(inset): overlay HTML (interieur=deplacer, coins=redimensionner)"
```

---

### Task 3: Documentation

**Files:**
- Modify: `spyder-plots/CLAUDE.md` (paragraphe décrivant `inset_layout.js`)

**Interfaces:** aucune.

- [ ] **Step 1: Mettre à jour `CLAUDE.md`**

Dans `spyder-plots/CLAUDE.md`, remplacer le paragraphe commençant par « Le placement du zoom-inset (« agrandir une zone » en mode overlay) … » par :

```markdown
Le placement du zoom-inset (« agrandir une zone » en mode overlay) — génération
des candidats, scoring (évite données/annotations, préfère un coin vide),
bornage, et **géométrie pixel↔paper + transformations move/resize** — vit dans
`media/inset_layout.js` (module pur UMD : `self.InsetLayout` dans le webview,
`require` sous Node), testé par `test/test_inset_layout.js`. Le déplacement et le
redimensionnement de l'encart se font via un **overlay HTML** dans `panel.html`
(corps = déplacer, 4 poignées de coin = redimensionner) ; c'est l'overlay qui
capte les `pointer` events. La bordure colorée visible reste une shape Plotly
non-éditable (présente dans les exports PNG).
```

- [ ] **Step 2: Vérification finale**

Run: `node test/test_inset_layout.js`
Expected: tous les tests passent.

Run: `node --check extension.js`
Expected: aucune sortie.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: overlay HTML pour deplacer/redimensionner l'encart"
```

---

## Notes d'implémentation

- **Bornage centralisé** : `movePlacement`/`resizePlacement` sont purement
  géométriques ; le bornage au domaine principal et la taille mini finale passent
  par `clampPlacement` (déjà testé). `resizePlacement` impose `minSize` localement
  pour ancrer correctement le coin opposé ; `clampPlacement` reste le filet de
  sécurité au bord du domaine.
- **Pas de ré-entrance** : l'overlay possède ses propres `pointer` events ; on ne
  passe plus par `plotly_relayout` pour le drag, d'où la suppression des gardes
  d'idempotence devenus inutiles.
- **YAGNI** : pas de poignées de bord (milieu d'arête), pas de rotation, pas de
  snap — seulement les 4 coins.
- **Hors périmètre** : le diff non commité de `_mpl_to_plotly.py`
  (`types-interactifs`) n'est pas touché et ne doit pas être committé ici.
```

