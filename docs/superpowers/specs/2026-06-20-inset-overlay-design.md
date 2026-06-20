# Overlay HTML pour déplacer/redimensionner l'encart (zoom-inset) — Design

**Date :** 2026-06-20
**Statut :** validé

## Problème

L'encart de zoom (« agrandir une zone » en mode overlay) est aujourd'hui une
**shape Plotly éditable** (`editable: true`, `edits.shapePosition`). Avec ce
modèle, les bords/coins servent à redimensionner et l'intérieur à déplacer, mais
les zones de saisie des poignées de Plotly ont une **taille en pixels fixe**.
Sur un petit encart, elles couvrent presque tout l'intérieur : il ne reste qu'un
point central minuscule pour déplacer. On ne peut pas, sur une shape éditable
Plotly, garder le déplacement par l'intérieur tout en désactivant le
redimensionnement.

**Comportement voulu :** déplacer l'encart en saisissant **n'importe où dans
l'intérieur** ; redimensionner uniquement via des **poignées de coin** (les 4
coins).

## Approche retenue

Sortir du modèle natif des shapes éditables. Un **overlay HTML** transparent,
positionné en absolu au-dessus de la zone de l'encart dans le webview, gère les
interactions :

- **corps de l'overlay** = déplacer ;
- **4 poignées de coin** (petits carrés CSS) = redimensionner.

C'est nous qui gérons les `pointer` events (plus Plotly), ce qui **élimine la
ré-entrance `plotly_relayout`** qui a déjà causé plusieurs correctifs
(`b033f00`, `c4c718e`). La bordure *visible* de l'encart reste une shape Plotly
non-éditable, afin d'apparaître dans les exports PNG.

Approches écartées :
- *Poignées en shapes Plotly* (rects éditables aux coins + pad de déplacement) :
  reste dans Plotly mais sémantique relayout délicate, même terrain que les bugs
  de ré-entrance déjà rencontrés.
- *Agrandir la taille mini + modèle Plotly inchangé* : palliatif, ne livre pas
  « déplacer partout dans l'intérieur ».

## Architecture & répartition

Le découpage suit les conventions existantes (`media/error_math.js`,
`media/inset_layout.js`) : **maths pures dans un module testable**, **glue
DOM/Plotly dans `panel.html`**.

- **`media/inset_layout.js`** (module pur UMD, étendu) : 4 nouvelles fonctions de
  géométrie pixel↔paper et de transformation du placement (move/resize). Aucune
  dépendance DOM/Plotly.
- **`media/panel.html`** (glue) : création/positionnement de l'overlay, écoute
  des `pointer` events, appel à `applyZoomInset`.
- **`test/test_inset_layout.js`** : cas pour les 4 fonctions pures.

## Module pur — `inset_layout.js`

Toutes les fonctions prennent/rendent des nombres.
`size` = `el._fullLayout._size` = `{l, t, w, h}` (marge gauche, marge haute,
largeur et hauteur de l'aire de tracé, en px). Convention paper : `y` va de `0`
en bas à `1` en haut ; convention pixel : `y` va de `0` en haut vers le bas.
`placement` = `{xDomain: [x0, x1], yDomain: [y0, y1]}` en coords paper.

- `paperRectToPixels(placement, size)` → `{left, top, width, height}` en px.
  - `left = size.l + xDomain[0] * size.w`
  - `width = (xDomain[1] - xDomain[0]) * size.w`
  - `top = size.t + (1 - yDomain[1]) * size.h`  (inversion de y)
  - `height = (yDomain[1] - yDomain[0]) * size.h`
- `pixelDeltaToPaper(dxPx, dyPx, size)` → `{dx, dy}` en paper.
  - `dx = dxPx / size.w`
  - `dy = -dyPx / size.h`  (inversion de y : descendre en pixels = baisser en paper)
- `movePlacement(placement, dxPaper, dyPaper)` → translation brute des deux
  domaines (`x0+dx, x1+dx, y0+dy, y1+dy`). Pas de bornage ici.
- `resizePlacement(placement, corner, dxPaper, dyPaper, minSize)` → déplace le
  coin saisi, **ancre le coin opposé**, impose la taille mini `minSize` (en
  paper) en repoussant le bord mobile par rapport au bord ancré. `corner` ∈
  `'nw' | 'ne' | 'sw' | 'se'` (`n`/`s` = haut/bas en paper, `e`/`w` =
  droite/gauche). Pas de bornage au domaine externe ici.

La glue appelle ensuite `clampPlacement(placement, xDomain, yDomain, minSize)`
(déjà existant) comme **filet de sécurité** pour borner au domaine principal.
Ainsi `movePlacement`/`resizePlacement` restent purement géométriques et le
bornage reste centralisé dans `clampPlacement`.

### Exports du module

Ajouter aux exports existants : `paperRectToPixels`, `pixelDeltaToPaper`,
`movePlacement`, `resizePlacement`.

## Overlay DOM & interactions (`panel.html`)

- `mountInsetOverlay(el, selection)` : crée un `<div>` overlay (bordure CSS — la
  bordure colorée *visible et exportable* reste la shape Plotly, voir
  Intégration) contenant **4 poignées de coin** (petits carrés CSS, un par
  coin). L'overlay est ajouté dans `el.parentElement`, qu'on force en
  `position: relative` si nécessaire. Référence stockée sur `el._spInsetOverlay`.
- `positionInsetOverlay(el)` : si `el._spInsetPlacement` et
  `el._fullLayout._size` existent, calcule la box via
  `InsetLayout.paperRectToPixels(...)`, ajoute l'offset de `el` dans le wrapper
  (`el.offsetLeft` / `el.offsetTop`), et applique `left/top/width/height` à
  l'overlay. Sinon, ne fait rien.
- **Corps de l'overlay** = déplacer : `pointerdown` mémorise la position de
  départ et `el._spInsetPlacement` ; `pointermove` (avec `setPointerCapture`,
  throttle `requestAnimationFrame`) accumule le delta px depuis le départ →
  `pixelDeltaToPaper` → `movePlacement(placementDépart, dx, dy)` →
  `clampPlacement` → `applyZoomInset(el, sel, placement)` → `positionInsetOverlay`.
- **Poignée de coin** = redimensionner : même chaîne avec
  `resizePlacement(placementDépart, corner, dx, dy, minSize)` puis
  `clampPlacement`. `corner` déterminé par la poignée saisie.
- On part du placement **mémorisé au `pointerdown`** (pas du courant) pour éviter
  toute dérive cumulative pendant le drag.
- `minSize` = `0.12` (même valeur que l'appel `clampPlacement` actuel).
- Overlay en `pointer-events: none` tant que `el._spInsetActive` (arming d'une
  nouvelle sélection) pour ne pas bloquer le tracé de la nouvelle zone.

## Intégration & nettoyage (`panel.html`)

- `applyZoomInset` : la 2ᵉ shape poussée (bordure de l'encart) passe
  `editable: false` ; retirer l'option config `edits: { shapePosition: true }`
  (l'objet `insetConfig` redevient le `baseConfig`). Après le `Plotly.react`,
  appeler `mountInsetOverlay` (si absent) puis `positionInsetOverlay`. Comme
  `Plotly.react` peut être asynchrone pour `_fullLayout._size`, positionner via
  un `requestAnimationFrame` (ou `Plotly.react(...).then(...)`).
- **Supprimer** `handleInsetDrag` (l. ~892-937) et la branche (1) du listener
  `plotly_relayout` (l. ~1103-1107). Le listener ne garde que la capture de
  sélection (branche 2).
- `_spInsetBorderIndex` n'est plus nécessaire au drag ; il peut être supprimé
  (les références dans `clearZoomInset` aussi). Vérifier qu'aucune autre lecture
  ne subsiste.
- **Repositionnement au resize** : dans le handler `window.resize` existant
  (l. ~1131), après le relayout de hauteur de chaque plot, si `p.el._spHasInset`,
  appeler `positionInsetOverlay(p.el)`.
- `clearZoomInset` : démonter l'overlay (retirer `el._spInsetOverlay` du DOM,
  remettre la référence à `null`) en plus de la remise à zéro existante.
- **Retirer le bloc `console.log` de debug temporaire** (l. ~909-915, commenté
  « DEBUG TEMPORAIRE (a retirer) »).

## Tests & vérification

- **Pur** : étendre `test/test_inset_layout.js` avec des cas pour
  `paperRectToPixels`, `pixelDeltaToPaper`, `movePlacement`, `resizePlacement`
  (dont l'ancrage du coin opposé et l'imposition de la taille mini). Lancer
  `node test/test_inset_layout.js`.
- **Syntaxe** : `node --check extension.js` (inchangé). `panel.html` n'a pas de
  test-runner ; relecture manuelle.
- **Manuel** (Extension Development Host) : `python test/test_plots.py`,
  sélectionner une zone →
  - déplacer l'encart en saisissant **n'importe où dans l'intérieur** ;
  - redimensionner via **chacun des 4 coins** (le coin opposé reste ancré) ;
  - redimensionner la fenêtre VS Code → l'overlay se repositionne ;
  - exporter en PNG → la bordure de l'encart est présente (les poignées, chrome
    HTML, n'apparaissent pas — attendu).

## Hors périmètre (YAGNI)

- Poignées de bord (milieu d'arête) : seulement les 4 coins.
- Rotation, aspect-ratio verrouillé, snap.
- Le chantier `types-interactifs` (diff non commité de `_mpl_to_plotly.py`) est
  **indépendant** et n'est pas touché par ce travail.
