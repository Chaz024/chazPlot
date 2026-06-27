# Digitalisation automatique de courbes depuis un PNG quelconque

Date : 2026-06-27
Statut : design validé, prêt pour planification

## Problème

Reconstruire les **points de données** d'une figure à partir d'un **PNG/SVG
quelconque qui n'a PAS été produit par l'extension** (donc sans données Chaz Plots
embarquées). C'est distinct de la « figure auto-portée » (`figure_codec.js` /
`plotly_to_py.js`), qui ne lit que les données que notre propre export a embarquées.

Objectif énoncé par l'utilisateur : **automatique et fiable, y compris quand les
courbes se superposent.**

## Réalité technique (cadre et plafond d'automatisation)

Contraintes d'architecture : **pas de dépendances, pas de réseau** (le CSP du webview
n'a pas de `connect-src`). Donc pas de modèle de vision, pas de lib d'OCR. Tout se fait
en **JS pur sur un `<canvas>`** (`getImageData`).

Conséquences honnêtes, qui cadrent le design :

- **Automatisable et fiable** : détection de la boîte de tracé, séparation des courbes
  de **couleurs différentes** (même quand elles se croisent), extraction des points
  colonne par colonne.
- **Bloque le « 100 % auto »** : la calibration des valeurs d'axe (pixels → vraies
  valeurs) suppose de lire les graduations. Sans OCR → l'utilisateur tape **min/max de
  chaque axe (4 nombres)**. Le reste est automatique.
- **Physiquement ambigu** : deux courbes de **même couleur ET même style** qui se
  superposent — l'information « quel point va à quelle courbe » est perdue dans le
  raster. On gère par **best-effort + avertissement**, et par un **mode manuel** où
  l'utilisateur clique un point de départ par courbe litigieuse.

Décisions utilisateur :

- Calibration : **quasi-auto + 4 nombres** (clics de rattrapage si la boîte détectée
  est fausse).
- Séparation des courbes : clé = **(couleur + style)** — trait plein / tireté /
  pointillé / marqueurs. Sur un graphe bien fait, deux courbes diffèrent par l'un ou
  l'autre.
- Dégradation gracieuse : auto d'abord ; si échec, **proposer de recommencer en
  manuel** (clic d'amorce sur les courbes litigieuses) avec suivi par continuité.
- Phasage : **tout d'un coup** (dégradation gracieuse complète, pas de v2 différée).

## Architecture

Approche retenue : **module pur `media/curve_digitize.js` + panneau interactif dans le
webview**. Tout le traitement d'image est pur et testé sous Node ; la glue (canvas, UI,
sorties) vit dans `panel.html`. Les sorties **réutilisent l'existant** (nouvelle figure,
CSV, génération de code).

Approche rejetée : faire l'extraction dans le **backend Python** (numpy). Plus simple
pour le traitement d'image, mais casse le contrat — le backend est invoqué par le Python
de l'utilisateur, jamais appelé par l'extension, et au moment de la digitalisation il n'y
a pas de Python garanti. Mauvaise couche.

```
PNG/SVG quelconque ──▶ panel.html (canvas getImageData)
                              │
                              ▼
                  CurveDigitize (module pur)
        boîte → fond → clusters couleur → style → extraction/continuité → pixels→données
                              │
                              ▼
        spec {title, plotly:{data:[scatter…], layout:{calib}}}
                              │
         ┌────────────────────┼─────────────────────┐
         ▼                    ▼                     ▼
  createFigureFromData   export CSV        generateCodeFromSpec
   (nouvelle figure)     (existant)        (→ PlotlyToPy.toMatplotlib)
```

## Module pur `media/curve_digitize.js` (`CurveDigitize`)

Module UMD (`self.CurveDigitize` côté webview, `require` sous Node), aucune dépendance
DOM. Travaille sur un modèle d'image simple `{ width, height, data }` où `data` est un
RGBA plat (= forme d'`ImageData`, donc fabricable en test Node).

Fonctions (toutes pures) :

1. **`detectPlotBox(img, opts)` → `{x0, y0, x1, y1}`**
   Densité de pixels « sombres & peu saturés » par ligne et par colonne ; les spines
   (longues lignes pleines) donnent les bords gauche/droite (colonnes) et haut/bas
   (lignes). `x0 < x1`, `y0 < y1` en coordonnées pixel (y croît vers le bas). Seuils dans
   `opts` ; rattrapage manuel dans l'UI.

2. **`detectBackground(img, box)` → `{r, g, b}`**
   Couleur la plus fréquente à l'intérieur de la boîte. Les pixels « avant-plan » sont
   ceux dont la distance au fond dépasse un seuil.

3. **`clusterCurveColors(img, box, opts)` → `[{ color:[r,g,b], pixels:[{x,y}…] }]`**
   Quantification des couleurs d'avant-plan + fusion des buckets proches (distance <
   tol), triés par population, clusters trop petits filtrés (bruit). Légende/texte dans
   la boîte peuvent former des clusters → décochables à l'étape revue.

4. **`detectLineStyle(pixels, box)` → `{ style:'solid'|'dashed'|'dotted'|'markers', markerPositions? }`**
   Couverture par colonne (solid ≈ 1, dashed/dotted < 1) + motif des trous (run-length
   des colonnes vides) + détection de blobs réguliers (marqueurs). Sert à (a) classer le
   style, (b) séparer deux courbes de même couleur quand le style diffère nettement
   (ex. marqueurs vs trait). Deux courbes même couleur + même style entrelacées → non
   séparables ici → mode manuel.

5. **`extractCurves(clusters, box, opts)` → `[{ color, style, points:[{xpx,ypx}], ambiguous:[{x0,x1}] }]`**
   Pour chaque courbe : balayage des colonnes `]x0, x1[`, runs contigus → bandes, centre
   = candidat. Suivi par continuité (extrapolation linéaire des 2 derniers points) ;
   colonne à plusieurs bandes éloignées → on choisit la plus proche et on **signale la
   zone ambiguë**.

6. **`traceFromSeeds(mask, box, seeds)` → `[{ points, ambiguous }]`** (mode manuel)
   Suit chaque courbe depuis un point d'amorce cliqué ; résout les croisements par
   « continuer tout droit » (continuité de pente).

7. **`pixelsToData(points, box, calib)` → `[{x, y}]`**
   `calib = { xmin, xmax, ymin, ymax, xlog, ylog }`. Mapping affine, y pixel inversé
   (`y1` = bas = `ymin`). Log : interpolation en `log10` puis `10**`.

## Glue webview (`panel.html`) — overlay `digitizeOverlay`

Points d'entrée (2) :
- **Glisser un PNG/SVG non-Chaz** (avec Shift, limite VS Code connue) : `routeSystemImage`
  → `extractEmbeddedFigure` renvoie `null` → proposer **« Extraire les points
  (digitalisation) »** au lieu du message discret actuel.
- **Bouton barre d'outils « Digitaliser une image »** (`#digitizeImage`) → `<input
  type=file accept=".png,.svg,image/png,image/svg+xml">` caché, pas de Shift.

Flux de l'overlay :
1. Image → `<canvas>` offscreen → `getImageData` → `detectPlotBox` + clustering + style +
   `extractCurves` (auto direct).
2. **Calibration** : image avec la boîte en surimpression, **poignées déplaçables**
   (rattrapage), 4 champs `xmin/xmax/ymin/ymax`, cases **log** par axe.
3. **Revue des courbes** : liste (pastille couleur + style + nb points), **cases
   inclure/exclure** (vire légende/texte), zones ambiguës en avertissement.
4. **Si l'auto échoue** : bouton **« Recommencer en manuel »** → clic d'un point de
   départ par courbe litigieuse → `traceFromSeeds`.
5. **Sorties** : « Nouvelle figure » (`createFigureFromData`), « Exporter CSV »,
   « Générer le code ».

## Sorties — réutilisation

La digitalisation produit une spec `{ title, plotly:{ data:[{type:'scatter', mode,
x, y, line:{color,dash}, name}], layout:{ axes calibrés } } }` qui alimente :
- `createFigureFromData` (nouvelle figure dans l'historique — déjà câblé),
- l'export CSV existant,
- **« Image → code »** via `plotly_to_py.js` : nouveau message webview→extension
  **`generateCodeFromSpec {spec}`** appelant `PlotlyToPy.toMatplotlib` puis ouvrant
  l'éditeur Python (parallèle de `generateCodeFromImage`).

## Tests

- **`test/test_curve_digitize.js`** (Node, images synthétiques) :
  - `detectPlotBox` sur cadre synthétique → boîte correcte.
  - `clusterCurveColors` : 2 lignes colorées → 2 clusters.
  - `detectLineStyle` : solid / dashed / dotted / markers → classés correctement.
  - `extractCurves` : forme en V ; croisement de 2 couleurs → chacune tracée.
  - croisement **même couleur** → zone ambiguë signalée.
  - `traceFromSeeds` : 2 courbes même couleur qui se croisent + graines → séparées.
  - `pixelsToData` : mapping linéaire et log corrects.
- **`test/check_panel_html.js`** : nouveaux ids requis + placeholder `{{curveDigitizeUri}}`.
- **`extension.js:webviewHtml()`** : injection `{{curveDigitizeUri}}` (module **webview**
  → URI requise, contrairement à `plotly_to_py.js`/`figure_codec.js` qui sont
  extension-only).

## Limites assumées (à documenter README + CLAUDE.md)

- Même couleur **et** même style superposées → graines manuelles / best-effort, jamais
  garanti.
- Légende/texte à l'intérieur de la boîte → faux clusters, à décocher (ou recadrer).
- `detectPlotBox` suppose des spines pleines ; grilles très contrastées peuvent gêner.
- Axes log gérés (case) ; axes secondaires / cassés non gérés.
- Anti-aliasing absorbé par tolérance ; courbes très fines ou peu contrastées
  possiblement ratées.
- Reste **semi-assisté** par les 4 nombres de calibration (pas d'OCR).
