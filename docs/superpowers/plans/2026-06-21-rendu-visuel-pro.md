# Rendu visuel « pro » du panneau — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relever la finition visuelle du webview `media/panel.html` (toolbar/cartes, comparaison, overlay/encart) en restant natif-thème, par du CSS + micro-balisage uniquement.

**Architecture:** Une couche de tokens sémantiques dérivés du thème VS Code est ajoutée dans `:root`, puis tout le CSS existant est rebasé dessus. Les couleurs « en dur » qui supposaient un thème sombre sont supprimées. Un seul fichier de production est touché (`media/panel.html`) ; un garde-fou node (`test/check_panel_html.js`) vérifie après chaque tâche que les placeholders et les `id` DOM survivent.

**Tech Stack:** HTML/CSS dans `media/panel.html` ; Node (v24, déjà présent) pour le garde-fou ; vérification visuelle dans l'Extension Development Host.

## Global Constraints

- **CSS + micro-balisage uniquement.** Aucune modification de logique JS, du protocole `postMessage`, du serveur HTTP, ni du Python.
- Aucun `id` existant n'est rencommé ni supprimé ; aucun handler JS n'est touché.
- Les 5 placeholders substitués par `extension.js:webviewHtml()` restent présents **verbatim** : `{{nonce}}`, `{{cspSource}}`, `{{plotlyUri}}`, `{{errorMathUri}}`, `{{insetLayoutUri}}`.
- Tout reste dérivé du thème : conserver les fallbacks `var(--vscode-*, <fallback>)`.
- Aucune dépendance ni ressource réseau ajoutée (CSP du webview : pas de `connect-src`).
- Direction : **native-thème, ton aéré**. Pas de palette de marque indépendante.
- Périmètre exclu (ne pas retoucher) : lecteur d'animation, état vide, `media/inset_layout.js` (logique encart). Seul le **chrome CSS** de l'encart change.
- Langue de travail : **français** (chaînes, commentaires, messages de commit).

---

## File Structure

- `media/panel.html` — modifié. Bloc `<style>` (lignes 9–236) rebasé sur tokens ; un seul ajout de balisage présentationnel dans `.toolbar` (wrapper `.segmented`).
- `test/check_panel_html.js` — créé. Garde-fou structurel sans dépendance : vérifie placeholders + `id` requis.

Les tâches CSS ne sont pas testables unitairement ; chacune se conclut par (a) le garde-fou node objectif et (b) un point de contrôle visuel décrit, réalisé par le reviewer entre deux tâches dans l'Extension Development Host.

---

### Task 1: Garde-fou structurel du webview

**Files:**
- Create: `test/check_panel_html.js`

**Interfaces:**
- Produces: commande `node test/check_panel_html.js` — sort en code 0 et affiche `OK check_panel_html …` si tous les placeholders et `id` requis sont présents ; sinon code 1 et liste les manques. Toutes les tâches suivantes l'utilisent comme garde objective.

- [ ] **Step 1: Écrire le script du garde-fou**

Create `test/check_panel_html.js` :

```js
// test/check_panel_html.js — garde-fou structurel du webview (sans navigateur).
// Verifie que media/panel.html conserve les placeholders substitues par
// extension.js et tous les id DOM utilises par le script. Aucune dependance.
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "media", "panel.html");
const html = fs.readFileSync(file, "utf8");

const placeholders = [
  "{{nonce}}", "{{cspSource}}", "{{plotlyUri}}",
  "{{errorMathUri}}", "{{insetLayoutUri}}",
];
const requiredIds = [
  "count", "searchInput", "compareStatus", "compareSide", "compareStack",
  "fitToggle", "saveAll", "deleteAll", "list", "empty", "overlay", "ovTitle",
  "ovCoords", "ovClose", "ovBody", "compareOverlay", "compareTitle",
  "compareOpacityWrap", "compareOpacity", "compareClose", "errorToggle",
  "errorWarn", "errorPanel", "errorRef", "errorApply", "errorHide", "compareBody",
];

const errors = [];
for (const p of placeholders) {
  if (!html.includes(p)) errors.push("placeholder manquant : " + p);
}
for (const id of requiredIds) {
  if (!new RegExp('id="' + id + '"').test(html)) {
    errors.push("id manquant : " + id);
  }
}
if (errors.length) {
  console.error("ECHEC check_panel_html:\n" + errors.map((e) => "  - " + e).join("\n"));
  process.exit(1);
}
console.log(
  "OK check_panel_html : " + placeholders.length + " placeholders, " +
  requiredIds.length + " ids."
);
```

- [ ] **Step 2: Lancer le garde-fou sur le `panel.html` actuel (baseline)**

Run: `node test/check_panel_html.js`
Expected: PASS — `OK check_panel_html : 5 placeholders, 27 ids.` (le fichier non modifié contient déjà tout).

- [ ] **Step 3: Vérifier la syntaxe du script**

Run: `node --check test/check_panel_html.js`
Expected: aucune sortie, code 0.

- [ ] **Step 4: Commit**

```bash
git add test/check_panel_html.js
git commit -m "test(panel): garde-fou structurel placeholders + ids du webview"
```

---

### Task 2: Couche de tokens + suppression des couleurs en dur

**Files:**
- Modify: `media/panel.html` — bloc `:root` (lignes 10–15) ; `.coords` (92–101), `.card-head .badge` (103–108), `.tagrow`/`.tag` (110–112), `.compare-pane-title` (188–192).

**Interfaces:**
- Produces: variables CSS `--sp-surface`, `--sp-surface-2`, `--sp-border`, `--sp-text`, `--sp-text-dim`, `--sp-accent`, `--sp-accent-soft`, `--sp-shadow-1`, `--sp-shadow-2`, `--sp-pad` ; `--sp-gap` passe à 20px, `--sp-radius` à 10px. Les tâches suivantes consomment ces tokens.

- [ ] **Step 1: Remplacer le bloc `:root`**

Remplacer (lignes 10–15) :

```css
  :root{
    color-scheme: light dark;
    --sp-radius: 8px;
    --sp-gap: 16px;
    --sp-plot-bg: #ffffff;
  }
```

par :

```css
  :root{
    color-scheme: light dark;
    --sp-plot-bg: #ffffff;
    /* surfaces & texte derives du theme */
    --sp-surface:    var(--vscode-editorWidget-background, #252526);
    --sp-surface-2:  var(--vscode-sideBar-background, #252526);
    --sp-border:     var(--vscode-panel-border, #3c3c3c);
    --sp-text:       var(--vscode-foreground, #cccccc);
    --sp-text-dim:   color-mix(in srgb, var(--vscode-foreground, #cccccc) 62%, transparent);
    /* accent unique */
    --sp-accent:     var(--vscode-focusBorder, var(--vscode-charts-blue, #3794ff));
    --sp-accent-soft: color-mix(in srgb, var(--sp-accent) 18%, transparent);
    /* elevation, espace, rayon */
    --sp-shadow-1: 0 1px 2px rgba(0,0,0,.16);
    --sp-shadow-2: 0 4px 12px rgba(0,0,0,.22);
    --sp-pad: 16px;
    --sp-gap: 20px;
    --sp-radius: 10px;
  }
```

- [ ] **Step 2: Rebaser `.coords` sur les tokens (retire le navy en dur)**

Remplacer (lignes 92–102) :

```css
  .coords{
    font-family: var(--vscode-editor-font-family, monospace);
    font-size:11px; opacity:1; white-space:nowrap;
    padding:2px 8px; margin-right:2px; border-radius:5px;
    color:#f4f1e8;
    background: rgba(15, 23, 42, .78);
    border:1px solid rgba(255,255,255,.16);
    box-shadow: 0 1px 2px rgba(0,0,0,.22);
    min-width:0;
  }
  .coords:empty{ background:transparent; border-color:transparent; box-shadow:none; }
```

par :

```css
  .coords{
    font-family: var(--vscode-editor-font-family, monospace);
    font-size:11px; opacity:1; white-space:nowrap;
    padding:2px 8px; margin-right:2px; border-radius:6px;
    color: var(--sp-text);
    background: var(--sp-surface-2);
    border:1px solid var(--sp-border);
    box-shadow: var(--sp-shadow-1);
    min-width:0;
  }
  .coords:empty{ background:transparent; border-color:transparent; box-shadow:none; }
```

- [ ] **Step 3: Rebaser le badge ANIM**

Remplacer (lignes 103–108) :

```css
  .card-head .badge{
    font-size:10px; font-weight:700; letter-spacing:.4px;
    padding:2px 6px; border-radius:999px;
    background: rgba(177,128,215,.28);
    color: var(--vscode-foreground, #cccccc);
  }
```

par :

```css
  .card-head .badge{
    font-size:10px; font-weight:700; letter-spacing:.4px;
    padding:2px 7px; border-radius:999px;
    background: var(--sp-accent-soft);
    color: var(--sp-text);
  }
```

- [ ] **Step 4: Rebaser `.tag` (retire le texte en dur)**

Remplacer (ligne 112) :

```css
  .tag{ font-size:10.5px; padding:2px 6px; border-radius:999px; color:#f4f1e8; background: rgba(55,148,255,.32); border:1px solid rgba(255,255,255,.14); }
```

par :

```css
  .tag{ font-size:10.5px; padding:2px 7px; border-radius:999px; color: var(--sp-text); background: var(--sp-accent-soft); border:1px solid var(--sp-border); }
```

- [ ] **Step 5: Rebaser `.compare-pane-title`**

Remplacer (lignes 188–192) :

```css
  .compare-pane-title{
    flex:0 0 auto; padding:7px 10px;
    color:#f4f1e8; background: rgba(15, 23, 42, .9);
    font-size:12px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  }
```

par :

```css
  .compare-pane-title{
    flex:0 0 auto; padding:7px 11px;
    color: var(--sp-text); background: var(--sp-surface-2);
    border-bottom:1px solid var(--sp-border);
    font-size:12px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  }
```

- [ ] **Step 6: Vérifier qu'il ne reste aucune couleur sombre en dur dans le CSS**

Run: `grep -nE "rgba\(15, ?23, ?42|#f4f1e8|rgba\(177,128,215|rgba\(55,148,255,\.32" media/panel.html`
Expected: aucune ligne (code 1 = pas de correspondance). Remarque : `rgba(55,148,255,.24)`/`.55` peuvent subsister ailleurs (états `iconbtn`) ; ils sont traités en Task 5.

- [ ] **Step 7: Garde-fou structurel**

Run: `node test/check_panel_html.js`
Expected: PASS — `OK check_panel_html : 5 placeholders, 27 ids.`

- [ ] **Step 8: Point de contrôle visuel (reviewer, dev host)**

Lancer le dev host (F5) puis `python test/test_plots.py`. Vérifier que coords, tags et titres de volets de comparaison restent lisibles, **et basculer un thème clair** (Ctrl+K Ctrl+T) : plus aucune zone navy illisible.

- [ ] **Step 9: Commit**

```bash
git add media/panel.html
git commit -m "style(panel): couche de tokens semantiques + suppression des couleurs en dur"
```

---

### Task 3: Toolbar + groupe segmenté compare

**Files:**
- Modify: `media/panel.html` — `.toolbar` (lignes 26–42) et `button` (44–57) côté CSS ; balisage `.toolbar` (lignes 244–246) pour le wrapper segmenté.

**Interfaces:**
- Consumes: tokens de Task 2.
- Produces: classe `.segmented` ; les `id="compareSide"` et `id="compareStack"` restent inchangés à l'intérieur du wrapper.

- [ ] **Step 1: Envelopper les deux boutons compare dans un groupe segmenté**

Remplacer (lignes 244–246) :

```html
    <span class="compare-status" id="compareStatus">0 selectionne</span>
    <button class="compact" id="compareSide" disabled>Cote a cote</button>
    <button class="compact" id="compareStack" disabled>Superposer</button>
```

par :

```html
    <span class="compare-status" id="compareStatus">0 selectionne</span>
    <span class="segmented">
      <button class="compact" id="compareSide" disabled>Cote a cote</button>
      <button class="compact" id="compareStack" disabled>Superposer</button>
    </span>
```

- [ ] **Step 2: Affiner la toolbar (espace + filet sous-jacent)**

Remplacer (lignes 26–32) :

```css
  .toolbar{
    position:sticky; top:0; z-index:20;
    display:flex; align-items:center; gap:10px; flex-wrap:wrap;
    padding:8px 14px;
    background: var(--vscode-sideBar-background, #252526);
    border-bottom:1px solid var(--vscode-panel-border, #3c3c3c);
  }
```

par :

```css
  .toolbar{
    position:sticky; top:0; z-index:20;
    display:flex; align-items:center; gap:10px; flex-wrap:wrap;
    padding:10px 16px;
    background: var(--sp-surface-2);
    border-bottom:1px solid var(--sp-border);
  }
```

- [ ] **Step 3: Styler le groupe segmenté + focus-visible des boutons**

Remplacer (lignes 44–57) :

```css
  button{
    font-family:inherit; font-size:12px; cursor:pointer;
    border:1px solid var(--vscode-button-border, transparent);
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border-radius:6px; padding:5px 11px;
    transition: background .12s ease, transform .06s ease;
  }
  button:hover{ background: var(--vscode-button-secondaryHoverBackground); }
  button:active{ transform: translateY(1px); }
  button.primary{ background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button.primary:hover{ background: var(--vscode-button-hoverBackground); }
  button:disabled{ opacity:.4; cursor:default; }
  button.compact{ padding:4px 9px; }
```

par :

```css
  button{
    font-family:inherit; font-size:12px; cursor:pointer;
    border:1px solid var(--vscode-button-border, transparent);
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border-radius:6px; padding:5px 11px;
    transition: background .13s ease, transform .06s ease, box-shadow .13s ease;
  }
  button:hover{ background: var(--vscode-button-secondaryHoverBackground); }
  button:active{ transform: translateY(1px); }
  button:focus-visible{ outline:2px solid var(--sp-accent); outline-offset:1px; }
  button.primary{ background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button.primary:hover{ background: var(--vscode-button-hoverBackground); }
  button:disabled{ opacity:.4; cursor:default; }
  button.compact{ padding:4px 9px; }

  /* groupe segmente (boutons de comparaison) */
  .segmented{ display:inline-flex; }
  .segmented button{ border-radius:0; }
  .segmented button + button{ border-left:none; }
  .segmented button:first-child{ border-top-left-radius:6px; border-bottom-left-radius:6px; }
  .segmented button:last-child{ border-top-right-radius:6px; border-bottom-right-radius:6px; }
```

- [ ] **Step 4: Affiner le champ recherche (focus accent)**

Remplacer (lignes 38–40) :

```css
  .toolbar .search{ min-width:180px; width:20vw; max-width:320px; padding:4px 8px; border-radius:5px;
    border:1px solid var(--vscode-input-border, transparent); background: var(--vscode-input-background);
    color: var(--vscode-input-foreground); font-family:inherit; font-size:12px; }
```

par :

```css
  .toolbar .search{ min-width:180px; width:20vw; max-width:320px; padding:5px 9px; border-radius:6px;
    border:1px solid var(--vscode-input-border, var(--sp-border)); background: var(--vscode-input-background);
    color: var(--vscode-input-foreground); font-family:inherit; font-size:12px;
    transition: border-color .13s ease, box-shadow .13s ease; }
  .toolbar .search:focus-visible{ outline:none; border-color: var(--sp-accent);
    box-shadow:0 0 0 2px var(--sp-accent-soft); }
```

- [ ] **Step 5: Garde-fou structurel**

Run: `node test/check_panel_html.js`
Expected: PASS — `OK check_panel_html : 5 placeholders, 27 ids.` (les deux boutons compare conservent leur `id`).

- [ ] **Step 6: Point de contrôle visuel (reviewer, dev host)**

Vérifier que « Côte à côte / Superposer » forme un bloc segmenté collé, que le focus clavier (Tab) affiche un anneau accent, et que la toolbar respire davantage.

- [ ] **Step 7: Commit**

```bash
git add media/panel.html
git commit -m "style(panel): toolbar aeree + groupe segmente compare + focus accent"
```

---

### Task 4: Cartes (espace, header, survol, zone graphe)

**Files:**
- Modify: `media/panel.html` — `#list`/`.card`/`.card-head` (lignes 76–91), `.imgwrap`/`.plotwrap` (115–122).

**Interfaces:**
- Consumes: tokens de Task 2.

- [ ] **Step 1: Espace de liste + carte avec élévation au survol**

Remplacer (lignes 76–91) :

```css
  #list{ padding:16px; display:flex; flex-direction:column; gap: var(--sp-gap); }
  .card{
    border:1px solid var(--vscode-panel-border, #3c3c3c);
    border-radius: var(--sp-radius);
    overflow:hidden;
    background: var(--vscode-editorWidget-background, #252526);
    box-shadow: 0 1px 3px rgba(0,0,0,.18);
  }
  .card-head{
    display:flex; align-items:center; gap:8px;
    padding:7px 10px 7px 12px;
    border-bottom:1px solid var(--vscode-panel-border, #3c3c3c);
  }
  .compare-check{ margin:0 2px 0 0; accent-color: var(--vscode-charts-blue, #3794ff); cursor:pointer; }
  .card-head .title{ font-size:12.5px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .card-head .ts{ font-size:11px; opacity:.55; }
```

par :

```css
  #list{ padding: var(--sp-pad); display:flex; flex-direction:column; gap: var(--sp-gap); }
  .card{
    border:1px solid var(--sp-border);
    border-radius: var(--sp-radius);
    overflow:hidden;
    background: var(--sp-surface);
    box-shadow: var(--sp-shadow-1);
    transition: box-shadow .15s ease, transform .15s ease, border-color .15s ease;
  }
  .card:hover{
    box-shadow: var(--sp-shadow-2);
    transform: translateY(-1px);
    border-color: color-mix(in srgb, var(--sp-accent) 35%, var(--sp-border));
  }
  .card-head{
    display:flex; align-items:center; gap:9px;
    padding:10px 12px 10px 14px;
    border-bottom:1px solid var(--sp-border);
  }
  .compare-check{ margin:0 2px 0 0; accent-color: var(--sp-accent); cursor:pointer; }
  .card-head .title{ font-size:14px; font-weight:600; color: var(--sp-text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .card-head .ts{ font-size:11px; color: var(--sp-text-dim); font-variant-numeric: tabular-nums; }
```

- [ ] **Step 2: Affiner la zone graphe**

Remplacer (lignes 115–122) :

```css
  .imgwrap{ background: var(--sp-plot-bg); text-align:center; padding:10px; }
  .imgwrap img{ max-width:100%; height:auto; display:inline-block; border-radius:2px; }
  .imgwrap img.vector{ width:100%; }
  body.no-fit .imgwrap img{ max-width:none; }
  body.no-fit .imgwrap img.vector{ width:auto; }
  body.no-fit .imgwrap{ overflow-x:auto; }
  .plotwrap{ padding:4px; background: var(--sp-plot-bg); }
  .sp-inset-armed{ outline:2px dashed rgba(55,148,255,.85); outline-offset:-2px; }
```

par :

```css
  .imgwrap{ background: var(--sp-plot-bg); text-align:center; padding:14px; }
  .imgwrap img{ max-width:100%; height:auto; display:inline-block; border-radius:2px; }
  .imgwrap img.vector{ width:100%; }
  body.no-fit .imgwrap img{ max-width:none; }
  body.no-fit .imgwrap img.vector{ width:auto; }
  body.no-fit .imgwrap{ overflow-x:auto; }
  .plotwrap{ padding:6px; background: var(--sp-plot-bg); }
  .sp-inset-armed{ outline:2px dashed var(--sp-accent); outline-offset:-2px; }
```

- [ ] **Step 3: Garde-fou structurel**

Run: `node test/check_panel_html.js`
Expected: PASS — `OK check_panel_html : 5 placeholders, 27 ids.`

- [ ] **Step 4: Point de contrôle visuel (reviewer, dev host)**

Vérifier l'aération des cartes, le titre 14px, la méta discrète, et l'effet d'élévation au survol (lift + ombre + bordure légèrement accentuée).

- [ ] **Step 5: Commit**

```bash
git add media/panel.html
git commit -m "style(panel): cartes aerees, hierarchie de titre, elevation au survol"
```

---

### Task 5: Comparaison, overlay et chrome de l'encart

**Files:**
- Modify: `media/panel.html` — `.iconbtn` états (lignes 60–69), overlay `.obar` (163–169), `.compare-grid` (180–186), `.opacity-control` (212–213), `.error-panel` (214–222), `.inset-handle*` (227–235).

**Interfaces:**
- Consumes: tokens de Task 2.

- [ ] **Step 1: Rebaser les états des boutons icônes sur l'accent**

Remplacer (lignes 60–69) :

```css
  .iconbtn{
    display:inline-flex; align-items:center; justify-content:center;
    width:28px; height:28px; padding:0; border-radius:6px;
    border:1px solid transparent; background:transparent;
    color: var(--vscode-foreground); opacity:.8;
  }
  .iconbtn:hover{ background: var(--vscode-toolbar-hoverBackground, rgba(127,127,127,.18)); opacity:1; }
  .iconbtn.active{ background: rgba(55,148,255,.24); border-color: rgba(55,148,255,.55); opacity:1; }
  .iconbtn.has-inset{ color: var(--vscode-charts-blue, #3794ff); opacity:1; }
  .iconbtn svg{ width:15px; height:15px; fill: currentColor; }
```

par :

```css
  .iconbtn{
    display:inline-flex; align-items:center; justify-content:center;
    width:28px; height:28px; padding:0; border-radius:6px;
    border:1px solid transparent; background:transparent;
    color: var(--sp-text); opacity:.75;
    transition: background .13s ease, opacity .13s ease, border-color .13s ease;
  }
  .iconbtn:hover{ background: var(--vscode-toolbar-hoverBackground, rgba(127,127,127,.18)); opacity:1; }
  .iconbtn:focus-visible{ outline:2px solid var(--sp-accent); outline-offset:1px; }
  .iconbtn.active{ background: var(--sp-accent-soft); border-color: var(--sp-accent); opacity:1; }
  .iconbtn.has-inset{ color: var(--sp-accent); opacity:1; }
  .iconbtn svg{ width:15px; height:15px; fill: currentColor; }
```

- [ ] **Step 2: Aligner la barre d'overlay sur la toolbar**

Remplacer (lignes 163–168) :

```css
  .overlay .obar{
    display:flex; align-items:center; gap:10px; flex-wrap:wrap;
    padding:8px 14px; border-bottom:1px solid var(--vscode-panel-border, #3c3c3c);
    background: var(--vscode-sideBar-background, #252526);
  }
```

par :

```css
  .overlay .obar{
    display:flex; align-items:center; gap:10px; flex-wrap:wrap;
    padding:10px 16px; border-bottom:1px solid var(--sp-border);
    background: var(--sp-surface-2);
  }
```

- [ ] **Step 3: Régulariser la grille de comparaison**

Remplacer (lignes 180–186) :

```css
  .compare-grid{
    flex:1; min-width:0; min-height:0;
    display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    grid-auto-rows:minmax(280px, 1fr);
    gap:1px; background: var(--vscode-panel-border, #3c3c3c);
    overflow:auto; align-content:start;
  }
```

par :

```css
  .compare-grid{
    flex:1; min-width:0; min-height:0;
    display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    grid-auto-rows:minmax(280px, 1fr);
    gap:1px; background: var(--sp-border);
    overflow:auto; align-content:start;
  }
```

- [ ] **Step 4: Sous-barre « Erreur » + chips + contrôle d'opacité**

Remplacer (lignes 212–222) :

```css
  .opacity-control{ display:none; align-items:center; gap:8px; font-size:12px; opacity:.9; }
  .opacity-control input{ width:150px; accent-color: var(--vscode-charts-blue, #3794ff); }
  .error-panel{
    display:flex; align-items:center; gap:12px; flex-wrap:wrap;
    padding:6px 14px; font-size:12px;
    background: var(--vscode-sideBar-background, #252526);
    border-bottom:1px solid var(--vscode-panel-border, #3c3c3c);
  }
  .error-panel .error-types{ display:flex; gap:10px; flex-wrap:wrap; }
  .error-panel select{ margin-left:4px; }
  .error-warn{ color: var(--vscode-charts-yellow, #cca700); font-size:11px; }
```

par :

```css
  .opacity-control{ display:none; align-items:center; gap:8px; font-size:12px; color: var(--sp-text); }
  .opacity-control input{ width:150px; accent-color: var(--sp-accent); }
  .error-panel{
    display:flex; align-items:center; gap:12px; flex-wrap:wrap;
    padding:8px 16px; font-size:12px;
    background: var(--sp-surface-2);
    border-bottom:1px solid var(--sp-border);
  }
  .error-panel .error-types{ display:flex; gap:8px; flex-wrap:wrap; }
  .error-panel .error-types label{
    display:inline-flex; align-items:center; gap:6px;
    padding:3px 9px; border-radius:999px;
    border:1px solid var(--sp-border); background: var(--sp-surface);
    cursor:pointer;
  }
  .error-panel .error-types input{ accent-color: var(--sp-accent); margin:0; }
  .error-panel select{ margin-left:4px; }
  .error-warn{ color: var(--vscode-charts-yellow, #cca700); font-size:11px; }
```

- [ ] **Step 5: Affiner les poignées de l'encart sur l'accent**

Remplacer (lignes 227–231) :

```css
    .inset-handle {
      position: absolute; width: 12px; height: 12px; box-sizing: border-box;
      background: #fff; border: 2px solid rgba(55,148,255,0.95);
      border-radius: 2px; touch-action: none;
    }
```

par :

```css
    .inset-handle {
      position: absolute; width: 11px; height: 11px; box-sizing: border-box;
      background: #fff; border: 2px solid var(--sp-accent);
      border-radius: 3px; box-shadow: var(--sp-shadow-1); touch-action: none;
    }
```

- [ ] **Step 6: Vérifier qu'aucune couleur d'accent en dur ne subsiste**

Run: `grep -nE "rgba\(55,148,255|#3794ff|rgba\(15, ?23, ?42|#f4f1e8|rgba\(177,128,215" media/panel.html`
Expected: aucune ligne (code 1). Tout l'accent passe désormais par `--sp-accent`.

- [ ] **Step 7: Garde-fou structurel**

Run: `node test/check_panel_html.js`
Expected: PASS — `OK check_panel_html : 5 placeholders, 27 ids.`

- [ ] **Step 8: Point de contrôle visuel (reviewer, dev host)**

Avec `python test/test_plots.py` puis sélection de ≥2 figures :
1. comparaison côte-à-côte ET superposition (opacité fonctionne) ;
2. bouton « Erreur » → la sous-barre affiche des chips, « Appliquer » trace le sous-graphe ;
3. overlay « agrandir » : barre alignée sur la toolbar, pill coords lisible ;
4. créer un encart (Ctrl+glisser sur une zone), le déplacer/redimensionner : poignées fines accent, bordure OK ; export PNG → la bordure d'encart est toujours présente.

- [ ] **Step 9: Commit**

```bash
git add media/panel.html
git commit -m "style(panel): comparaison, overlay et chrome d'encart rebases sur l'accent"
```

---

### Task 6: Vérification finale multi-thème

**Files:**
- Aucune modification de code attendue (tâche de validation ; corriger inline si un défaut apparaît).

- [ ] **Step 1: Garde-fou + syntaxe**

Run: `node test/check_panel_html.js && node --check test/check_panel_html.js`
Expected: PASS pour les deux.

- [ ] **Step 2: Vérification visuelle thème sombre**

Dev host (F5) + `python test/test_plots.py` + `python test/test_stress.py`. Thème sombre par défaut : parcourir liste, comparaison, overlay, encart, lecteur d'animation (non retouché mais doit rester cohérent), état vide.

- [ ] **Step 3: Vérification visuelle thème clair**

Basculer en thème clair (Ctrl+K Ctrl+T → « Light+ »). Reparcourir les mêmes surfaces. Critère d'acceptation : **aucune zone illisible** (texte clair sur fond clair, ou inversement), accent cohérent partout.

- [ ] **Step 4: Vérifier l'absence de régression d'export**

Enregistrer une figure en PNG et une en SVG depuis une carte ; ouvrir « Tout enregistrer ». Les fichiers se créent normalement (chemins inchangés).

- [ ] **Step 5: Commit (si correctifs)**

```bash
git add media/panel.html
git commit -m "style(panel): correctifs de finition multi-theme"
```

S'il n'y a aucun correctif, sauter ce commit.

---

## Self-Review (effectuée à la rédaction)

**Couverture de la spec :**
- §1 Tokens sémantiques → Task 2 (+ consommés partout). ✓
- §1 suppression couleurs en dur (coords, pane-title, tag, badge) → Task 2 steps 2–5. ✓
- §2 Toolbar + groupe segmenté + focus → Task 3. ✓
- §2 Cartes (espace, titre 14px, méta, survol, badge pill, tags, zone graphe) → Task 4 (+ badge/tag en Task 2). ✓
- §3 Comparaison (pane titles, grille, sous-barre Erreur en chips, opacité) → Task 5 steps 3–4 (pane title en Task 2). ✓
- §4 Overlay (obar, coords pill) + encart (poignées, armed outline) → Task 5 steps 2,5 + Task 4 step 2 (armed). ✓
- §Micro-interactions (transitions, focus-visible, active) → Tasks 3–5. ✓
- §Tests/vérif (placeholders, ids, multi-thème, exports) → Task 1 + Task 6. ✓
- Hors périmètre (anim, état vide, palette de marque) → respecté, non touché. ✓

**Écart assumé vs spec :** la spec évoque un « badge de type SVG/PNG/PLOTLY/ANIM ». En réalité le balisage ne crée qu'un badge `ANIM` (panel.html:1196). Introduire des badges par type exigerait du JS, hors périmètre CSS-only. → on restyle le badge existant uniquement ; aucune nouvelle catégorie. Sans impact fonctionnel.

**Scan placeholders :** aucun « TBD/TODO » ; chaque step CSS montre le bloc final complet.

**Cohérence des noms :** tokens (`--sp-surface`, `--sp-surface-2`, `--sp-border`, `--sp-text`, `--sp-text-dim`, `--sp-accent`, `--sp-accent-soft`, `--sp-shadow-1/2`, `--sp-pad`, `--sp-gap`, `--sp-radius`) définis en Task 2 et réutilisés à l'identique ensuite. Classe `.segmented` définie (CSS Task 3 step 3) et utilisée (balisage Task 3 step 1). `node test/check_panel_html.js` créé en Task 1 et réutilisé tel quel.
