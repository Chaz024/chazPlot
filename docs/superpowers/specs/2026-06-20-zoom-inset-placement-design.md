# Zoom-inset : placement automatique amélioré + déplacement/redimensionnement manuel — Design

> Statut : design validé en brainstorming, prêt pour le plan d'implémentation.
> Date : 2026-06-20. Branche : `feat/erreur-courbes`.

## Contexte

Le webview `media/panel.html` propose un **zoom-inset** : l'utilisateur arme
l'outil (bouton), trace une zone à agrandir, et un encart (paire d'axes Plotly
supplémentaire avec un `domain` en coordonnées *paper*) apparaît avec la vue
zoomée. Le placement de cet encart est décidé par `chooseInsetDomain` →
`makeInsetCandidates` (4 tailles × 3×3 ancrages) + `scoreInsetCandidate`.

### Problèmes observés

1. **L'inset recouvre les courbes** alors qu'il reste de la place vide ailleurs.
2. **Le coin choisi est contre-intuitif.**

Causes : la grille de candidats est trop grossière (9 ancrages par taille → les
poches vides entre ancrages sont ratées) et le score compte les points de courbe
en valeur absolue (poids 1), sans notion de « coin naturel ».

### Décisions de cadrage (brainstorming)

- Stratégie quand aucune zone vide assez grande n'existe : **placement manuel**
  (l'inset apparaît à un défaut, l'utilisateur le repositionne).
- Niveau d'interaction : **déplacer + redimensionner**.
- Mécanique de drag : **Approche A — shape Plotly éditable native** (Plotly
  v3.6.0 embarqué supporte l'attribut `editable` par shape).
- On **améliore aussi le score** du placement automatique (le défaut).

## Objectifs

- Le placement **automatique** vise une zone vide et un coin naturel le plus
  souvent possible (corrige les deux symptômes à la source).
- L'utilisateur peut **toujours corriger** : déplacer et redimensionner l'encart
  à la souris.
- La logique géométrique pure devient **testable unitairement** (node), suivant
  la convention déjà en place pour `media/error_math.js`.

Hors périmètre (YAGNI) : carving d'une marge dédiée (rétrécir le graphe
principal), snapping aux coins, poignées de drag personnalisées, persistance
disque de la position de l'inset.

## Architecture

Deux moitiés, comme pour l'existant :

- **`media/inset_layout.js`** (nouveau, module UMD pur — `self.InsetLayout` dans
  le webview, `require` sous node) : toute la géométrie/scoring testable.
- **`media/panel.html`** (glue Plotly) : shape éditable, listener `relayout`,
  reconstruction via `Plotly.react`. Non testable unitairement → recette
  manuelle dans l'Extension Development Host.

Le couplage entre les deux reste un contrat de fonctions pures (entrées =
domaines/ranges/points/annotations en nombres ; sorties = `{xDomain, yDomain}`
et scores).

---

## Partie 1 — Placement automatique amélioré

### 1.1 Extraction vers `media/inset_layout.js`

Déplacer depuis `panel.html` vers un module UMD pur les fonctions de géométrie
de placement, sans dépendance Plotly :

- `makeInsetCandidates(xDomain, yDomain)`
- `scoreInsetCandidate(candidate, selectedPaper, traces, annotations, ...)`
- `chooseInsetDomain(...)`
- `clampPlacement(rect, xDomain, yDomain, minSize)` (nouveau, voir Partie 2)
- les helpers géométriques purs qu'elles utilisent et qui ne touchent pas Plotly
  (`rectArea`, `rectOverlapArea`, `valueToPaper`, etc.). Les helpers qui lisent
  l'état Plotly (`axisRangeNumbers`, `matchingAxisTraces`…) restent dans
  `panel.html` ; on leur passe leurs résultats en arguments numériques.

Wrapper UMD identique à `error_math.js` :

```js
(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.InsetLayout = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  // ... fonctions pures ...
  return { makeInsetCandidates, scoreInsetCandidate, chooseInsetDomain, clampPlacement };
});
```

`panel.html` charge le script (balise `<script src>` avec nonce/CSP, comme
`plotly.min.js`) et appelle `InsetLayout.chooseInsetDomain(...)`.

### 1.2 Grille de candidats plus fine

`makeInsetCandidates` : pour chaque taille, balayer `x0` et `y0` sur une grille
de **N positions par axe** (cible N≈5–7, à régler par test) couvrant la plage
disponible `[domain0, domain1 - taille]`, au lieu des 3 actuelles. Les **coins**
(positions extrêmes sur les deux axes) sont toujours inclus. Dédoublonnage
conservé (`seen`). Le nombre de candidats reste borné (≈ tailles × N² ≤ ~200),
coût négligeable.

Chaque candidat porte des métadonnées pour le score :
- `sizeIndex` (0 = plus grand) ;
- `cornerKind` : `2` si collé à deux bords (vrai coin), `1` si un seul bord,
  `0` sinon (intérieur) — calculé par proximité aux bornes du domaine.

### 1.3 Score réordonné par priorités

`scoreInsetCandidate` renvoie un score à **minimiser**, somme de termes pondérés
du plus fort au plus faible :

1. **Recouvrement de la sélection** (zone zoomée) — poids rédhibitoire
   (~9000 × ratio de recouvrement). Inchangé : l'inset ne couvre jamais la zone
   source.
2. **Occupation** = fraction des points de courbe échantillonnés tombant dans le
   candidat (0..1), poids dominant (~1000). Une région **vide** (occupation 0)
   bat *toujours* une région chargée, quelle que soit la taille. → corrige
   « recouvre les courbes ».
3. **Recouvrement d'annotations** — gardé (~120 + ratio×500 par annotation
   chevauchée).
4. **Coin naturel** — bonus négatif : `cornerKind == 2` (coin) < `1` (bord) <
   `0` (centre). Poids faible (~2 par cran). → corrige « coin contre-intuitif ».
5. **Taille** — `sizeIndex × ~3`, poids faible : à occupation égale on préfère
   le plus grand, mais l'évitement des données et le coin priment.

Les poids exacts sont fixés par les tests (1.4) ; les ordres de grandeur
ci-dessus garantissent la hiérarchie des priorités.

L'échantillonnage des points reste celui de l'existant (pas adaptatif, ~2200
points max par trace) pour borner le coût.

### 1.4 Tests `test/test_inset_layout.js`

Nouveau, sur le modèle de `test/test_error_curves.js` (lancé par
`node test/test_inset_layout.js`, sortie `OK`/échecs, code retour non nul si
échec). Cas :

- `makeInsetCandidates` : tous les candidats sont dans le domaine ; les 4 coins
  sont présents ; grille plus fine (N>3 positions distinctes par axe).
- `scoreInsetCandidate` :
  - une région **vide** obtient un score strictement inférieur à une région
    contenant des points (mêmes taille/position autrement) ;
  - à occupation égale, **coin < bord < centre** ;
  - tout recouvrement de la sélection rend le score rédhibitoire (supérieur à
    n'importe quel candidat ne la recouvrant pas).
- `chooseInsetDomain` : points concentrés dans un coin → inset choisi dans une
  zone vide (pas sur les points), idéalement le coin opposé.
- `clampPlacement` (Partie 2) : rectangle hors-domaine ramené dans les bornes ;
  rectangle trop petit ramené à la taille mini ; rectangle valide inchangé.

---

## Partie 2 — Déplacement + redimensionnement manuel (Approche A)

### 2.1 Shape de bordure éditable

Dans `applyZoomInset` (`panel.html`), le **rect-bordure** de l'inset (shape
*paper* déjà poussé) reçoit `editable: true`. Le **rect de sélection** (zone
source, en pointillés) reçoit `editable: false` pour ne pas être déplacé par
erreur. On mémorise l'index du shape-bordure sur l'élément :
`el._spInsetBorderIndex`.

L'édition de shapes est activée via la config (`edits.shapePosition: true` et/ou
l'attribut `editable` par shape) **uniquement quand un inset existe**. Sans
inset, aucun shape n'est éditable → aucun effet de bord sur le reste de la
figure. Le choix précis (config globale vs attribut par shape) est tranché à
l'implémentation selon le comportement réel de Plotly v3.6.0 ; le contrat est :
seule la bordure de l'inset est manipulable.

### 2.2 `applyZoomInset(el, selection, placementOverride)`

Refactor : signature étendue d'un 3ᵉ paramètre optionnel `placementOverride`.

- Si `placementOverride` est fourni → l'utiliser tel quel comme placement.
- Sinon → `InsetLayout.chooseInsetDomain(...)` comme aujourd'hui.

On stocke `el._spInsetSelection = selection` à chaque application, pour pouvoir
reconstruire l'inset lors d'un drag ultérieur.

### 2.3 Branche drag dans le listener `plotly_relayout`

Le listener existant (capture de la zone zoomée quand `_spInsetActive`) reçoit
une **nouvelle branche**, évaluée quand `el._spHasInset` est vrai :

1. Détecter dans l'`update` les clés `shapes[borderIndex].x0|x1|y0|y1` (l'index
   = `el._spInsetBorderIndex`).
2. Reconstituer le rectangle paper (compléter avec les valeurs courantes du
   layout pour les bornes non présentes dans l'update).
3. `placement = InsetLayout.clampPlacement(rect, xDomainPrincipal,
   yDomainPrincipal, minSize)` :
   - borne le rectangle au domaine des axes principaux source ;
   - impose une **taille mini** (~0,12 paper sur chaque axe) pour garder l'inset
     lisible ;
   - renvoie `{xDomain:[x0,x1], yDomain:[y0,y1]}`.
4. `applyZoomInset(el, el._spInsetSelection, placement)` → reconstruit axes +
   traces + annotations + les deux shapes de façon cohérente, en **une seule**
   `Plotly.react`.

L'event `plotly_relayout` d'un drag de shape se déclenche au **relâché** de la
souris (pas en continu), donc un `Plotly.react` par geste suffit.

### 2.4 Robustesse

- Domaines en *paper* → l'inset déplacé survit au resize de la fenêtre (qui ne
  relayoute que la hauteur).
- `clearZoomInset` réinitialise déjà l'état (`_spHasInset`, react sur la base) ;
  il nettoiera aussi `_spInsetSelection`/`_spInsetBorderIndex`.
- Bornage systématique → le drag ne peut pas sortir l'inset du graphe ni le
  réduire à l'illisible.

---

## Partie 3 — Tests & vérification

### Unitaire (node, sans navigateur)

- `node test/test_inset_layout.js` → cas de la Partie 1.4 (vert).

### Non-régression

- `node --check extension.js` → aucune sortie.
- Vérif syntaxe du JS de `panel.html` (extrait et `node --check`, comme le repo
  le fait déjà pour le JS du webview).
- `node test/test_error_curves.js` → 26 tests OK (lot précédent intact).
- `python test/test_convert.py` → vert (converter non touché ici).

### Recette manuelle (Extension Development Host)

Via `test/test_plots.py` (figures riches : courbes, `fill_between`, `errorbar`,
annotations) :

1. Armer l'inset, tracer une zone → vérifier que le coin auto évite les courbes
   et tombe dans un coin naturel.
2. **Déplacer** l'encart → traces et annotations suivent ; la sélection source
   (pointillés) ne bouge pas.
3. **Redimensionner** l'encart (poignée d'un coin/bord) → la vue zoomée se
   réajuste ; bornage respecté (ni hors-graphe, ni trop petit).

## Fichiers touchés

- **Nouveau** `media/inset_layout.js` — module UMD pur (géométrie + score).
- **Nouveau** `test/test_inset_layout.js` — tests node.
- **Modifié** `media/panel.html` — charge `inset_layout.js` ; délègue le
  placement ; shape-bordure éditable + sélection non éditable ; branche drag
  dans le listener `relayout` ; `applyZoomInset` avec `placementOverride`.
- **Modifié** `extension.js` — exposer `inset_layout.js` au webview (URI +
  CSP/nonce, comme `plotlyUri`), si la substitution de template l'exige.
- **Modifié** `CLAUDE.md` — mentionner `media/inset_layout.js` + son test à côté
  de la note existante sur `error_math.js`.

## Risques / points ouverts

- **Édition de shape Plotly v3.6.0** : confirmer à l'implémentation que
  `editable` par shape (ou `edits.shapePosition` + `editable:false` sur la
  sélection) donne bien déplacement **et** redimensionnement sur un `rect`, et
  que l'event `relayout` porte les 4 bornes. Repli si limité : overlay DOM
  custom (Approche B) — non retenu pour l'instant.
- **Chargement du nouveau script dans le webview** : respecter la CSP (nonce) et
  le mécanisme de substitution `{{...}}` de `extension.js:webviewHtml()`.
