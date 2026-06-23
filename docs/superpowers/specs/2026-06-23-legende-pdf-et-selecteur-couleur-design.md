# Design — Édition de légende persistée en PDF + sélecteur de couleur 2D

Date : 2026-06-23
Extension : Chaz Plots (`spyder-plots/`, npm `chaz-plots`)
Langue de travail : français (UI, commentaires, commits).
Branche : se greffe sur `feat/export-pdf-mode-erreur-redim` (non mergée). Suit
directement l'éditeur d'entrée de légende ajouté dans la spec
`2026-06-22-taille-auto-et-legende-design.md`.

## Contexte

L'éditeur d'entrée de légende existe (`media/legend_edit.js` + panneau
`legendEditor` dans `panel.html`, bouton crayon de la modebar). Deux manques
remontés à l'usage :

- **A — Le PDF ne conserve pas les éditions de légende.** Modifier la couleur /
  le nom / le style d'une courbe se voit bien à l'écran et à l'export **PNG/SVG**,
  mais **pas à l'export PDF** : le PDF ressort avec les couleurs d'origine.
- **B — Le mode avancé des couleurs manque d'un vrai sélecteur.** On veut, en
  mode avancé, un **sélecteur 2D** (carré saturation/luminosité + bande de
  teinte + champ hex) pour choisir n'importe quelle couleur visuellement, en
  plus des pastilles et palettes nommées déjà présentes.

## Volet A — Édition de légende persistée à l'export PDF

### Cause

Le routage PDF est hybride (cf. CLAUDE.md « Génération PDF ») :

- **Figure simple** (pas d'encart, hors erreurs/comparaison) → l'extension écrit
  le **PDF matplotlib natif** (`fig.pdf`), rendu par le backend **à la création**
  de la figure.
- **Vue composée** (encart / erreurs / comparaison) → **PDF raster** généré par
  le webview depuis l'élément Plotly vivant (`PdfExport.buildPdf`).

Quand une légende est éditée, les modifications sont appliquées à l'élément
Plotly vivant et persistées dans `fig.plotly.data` (`updateFigure` →
`storage.save`), **mais jamais dans `fig.pdf`**. Le PDF natif est donc
définitivement périmé, y compris après un *Reload Window* (les éditions sont
rechargées dans `fig.plotly`, le `fig.pdf` reste l'original). Le flag en mémoire
`el._spHasInset` ne suffit pas : l'information « cette figure est éditée » doit
**survivre au rechargement**.

PNG/SVG ne sont pas concernés : ils passent toujours par `Plotly.toImage` sur
l'élément vivant, donc reflètent les éditions.

### Solution (source de vérité côté extension)

Le PDF vectoriel natif n'est plus fidèle dès la première édition. On bascule
alors une figure éditée sur le **chemin raster** (déjà utilisé pour les vues
composées), et on pilote cette bascule depuis l'extension pour qu'elle survive
au reload :

1. **`extension.js:updateFigureTrace(id, traceIndex, patch)`** marque
   `fig.edited = true` et le **persiste** (storage + index `chazPlots.index`
   léger pour les `loadAll`). `storage.js` doit sérialiser/relire ce champ.
2. **`extension.js:saveOne()`** calcule
   `const allowNative = isPdf && fig.pdf && fig.id !== "compare" && !fig.edited;`
   `nativePdf` n'est renseigné que si `allowNative` ; et l'option `allowNative`
   est passée au webview dans le message `exportPlotly`.
3. **`panel.html:exportPlotly()`**, branche PDF : ne signale `useNative` que si
   `!isCompare && !el._spHasInset && msg.options.allowNative !== false`. Sinon →
   `buildRasterPdfDataUrl(el)` (PDF raster de l'élément vivant, donc édité).

Aucun nouveau pipeline : on réutilise le raster existant. `fig.pdf` reste intact
(non destructif — permet un futur « réinitialiser »).

### Compromis assumé

Une figure dont la légende a été éditée s'exporte en **PDF raster haute
résolution** au lieu de vectoriel — comportement identique aux vues
encart/erreurs/comparaison. À documenter dans README « Génération PDF ».

### Tests

- Logique cross-process non testable unitairement → **recette dev-host** :
  éditer une couleur de légende, exporter en PDF, vérifier la couleur ; recharger
  la fenêtre, ré-exporter en PDF, vérifier que la couleur éditée est conservée.
- `node --check extension.js` et `node --check storage.js`.

## Volet B — Sélecteur de couleur 2D en mode avancé

### Répartition (conventions du repo : logique pure testée / glue DOM non testée)

**Logique pure → on étend `media/legend_edit.js`** (déjà porteur de `toHexColor`
/ `hexToRgba`) avec les conversions d'espace colorimétrique, exportées dans
l'API du module :

- `rgbToHsv(r, g, b) → {h, s, v}` (h ∈ [0,360), s/v ∈ [0,1]).
- `hsvToRgb(h, s, v) → {r, g, b}` (0–255 entiers).
- `hexToHsv(hex) → {h, s, v}` (via `toHexColor` pour normaliser l'entrée).
- `hsvToHex(h, s, v) → "#rrggbb"`.

Pas de nouveau module → aucune URI à injecter dans `webviewHtml()` /
`check_panel_html.js`.

**Glue DOM → `media/panel.html`**, dans la section avancée `<details>`
(`#leAdvancedColors`), **au-dessus** des palettes nommées qui restent
inchangées :

- Un **carré S/V** (`#leSvSquare`) : dégradés CSS superposés — blanc→teinte en
  horizontal (saturation), transparent→noir en vertical (luminosité) — avec un
  curseur rond positionné en absolu.
- Une **bande de teinte** verticale (`#leHueStrip`) : dégradé spectre HSV
  (rouge→jaune→vert→cyan→bleu→magenta→rouge) avec un curseur.
- Un **champ hex** (`#leHex`) synchronisé.

Interactions (`pointer` events, même registre que l'overlay encart) :

- Drag sur la bande → H depuis la position Y (linéaire). Met à jour la teinte de
  fond du carré S/V.
- Drag sur le carré → S depuis X, V depuis Y (inversé). 
- À chaque mouvement : `hsvToHex` → écrit `#leColor` (l'`<input type=color>`
  existant reste le **porteur de valeur**, donc « Appliquer » fonctionne sans
  changement), `#leHex`, l'aperçu, et **restyle la courbe en direct** (aperçu
  live pendant le drag).
- **Persistance au relâcher** (`pointerup`) : `persistLegendPatch` /
  `restyleLegendTrace` (message `updateFigure`), pas à chaque mouvement.
- Sync inverse : modifier `#leColor` ou `#leHex` repositionne les curseurs via
  `hexToHsv`.
- `openLegendEditor` initialise les curseurs depuis la couleur de la courbe.

Le sélecteur **pilote la même valeur** (`#leColor`) que le flux existant : zéro
changement au chemin d'application/persistance final. Pastilles de base et
« Appliquer palette » conservées.

### Aperçu live et persistance

L'aperçu est **live pendant le drag** (`Plotly.restyle` en continu sur la trace
ciblée) ; la persistance disque (`updateFigure`) n'a lieu qu'au **relâcher**,
pour éviter une avalanche d'écritures et de messages.

### Tests

- `test/test_legend_edit.js` : aller-retours `hsvToHex(hexToHsv(x)) ≈ x` sur un
  jeu de hex (primaires, gris, couleurs `BASE_COLORS`), bornes (`s=0` → gris,
  `v=0` → noir), et cohérence `rgbToHsv`/`hsvToRgb`.
- Glue DOM (drag, curseurs) non testée unitairement → recette dev-host.
- `node --check` n'est pas applicable au HTML ; `test/check_panel_html.js` reste
  vert (pas de nouveau placeholder de module).

## Hors périmètre (YAGNI)

- Pas de re-render PDF vectoriel des éditions (impossible sans moteur matplotlib
  dans le webview).
- Pas de bouton « réinitialiser les éditions » (le champ `fig.edited` le rend
  possible plus tard, mais non demandé).
- Pas de gestion alpha/transparence dans le sélecteur (couleurs opaques
  uniquement, comme aujourd'hui).

## Fichiers touchés

- `media/legend_edit.js` — conversions HSV (logique pure).
- `media/panel.html` — markup du sélecteur 2D + glue pointer + branche
  `allowNative` dans `exportPlotly`.
- `extension.js` — `updateFigureTrace` (`fig.edited`), `saveOne` (`allowNative`
  + `nativePdf`).
- `storage.js` — persistance du champ `edited`.
- `test/test_legend_edit.js` — tests des conversions HSV.
- `README.md` + `CLAUDE.md` — note « PDF raster pour figure éditée » ; au passage,
  documenter `plot_nav.js` et `figure_filter.js` (absents de CLAUDE.md).
