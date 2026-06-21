# Types interactifs (errorbar / fill_between / text) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre interactifs (Plotly au lieu du repli SVG) trois types matplotlib courants — `errorbar`, `fill_between`, `text`/`annotate` — dans le convertisseur `python/_mpl_to_plotly.py`.

**Architecture:** On étend `convert_figure()` et ses helpers `_convert_*`. La frontière de correction est conservée : tout cas non géré renvoie `None` → repli SVG de toute la figure. errorbar nécessite un suivi des artistes « réclamés » (ligne de données + caps + barres) pour éviter les doublons. fill_between devient une (ou plusieurs) trace(s) `fill:'toself'`. text/annotate devient des entrées `layout.annotations`.

**Tech Stack:** Python, matplotlib (backend Agg pour les tests), numpy, `unittest`. Pas de dépendance ajoutée.

## Global Constraints

- Langue de travail **française** : commentaires, messages de commit, docs.
- Le convertisseur n'ajoute **aucune dépendance** au-delà de matplotlib/numpy.
- **Frontière de correction** : un artiste non convertible fidèlement → `convert_figure` renvoie `None` (repli SVG). Jamais de rendu interactif faux.
- Réutiliser les helpers existants : `_hex`, `_finite_list`, `_as_float_array`, `_label_ok`, `_MARKERS`, `_LINESTYLES`.
- **Exécution des tests** : `python test/test_convert.py` exige un interpréteur avec matplotlib + numpy. L'interpréteur `python` par défaut de la machine (Python313) ne les a pas — utiliser l'environnement matplotlib (celui de Spyder/où tournent les figures). Vérifier d'abord : `python -c "import matplotlib, numpy"`.
- Vérif syntaxe JS inchangée : `node --check extension.js` (non touché ici, mais le repli SVG passe par lui).

---

### Task 1: errorbar → `scatter` + `error_x`/`error_y`

**Files:**
- Modify: `python/_mpl_to_plotly.py` (imports ~ligne 23-26 ; nouveau helper après `_convert_bars` ~ligne 340 ; garde-fou `_has_unsupported_artist` ~ligne 414 ; câblage `convert_figure` ~ligne 535-585)
- Test: `test/test_convert.py` (nouvelle classe)

**Interfaces:**
- Consumes: helpers existants `_hex`, `_finite_list`, `_as_float_array`, `_label_ok`, `_MARKERS`.
- Produces:
  - `_errorbar_artists(ax) -> set` — artistes appartenant aux `ErrorbarContainer` (ligne de données, caplines, barlinecols).
  - `_errors_from_segments(segments, centers, vertical) -> dict|None` — dict erreur Plotly (`{type:'data', array, [symmetric, arrayminus]}`).
  - `_convert_errorbar(container, axis_suffix) -> (trace|None, npts)`.
  - `_has_unsupported_artist(ax, bar_rectangles, claimed)` — signature étendue (3ᵉ paramètre = set d'artistes réclamés à laisser passer).

- [ ] **Step 1: Ajouter les imports nécessaires**

Dans `python/_mpl_to_plotly.py`, remplacer la ligne `from matplotlib.collections import PathCollection, QuadMesh` (ligne 23) par :

```python
from matplotlib.collections import PathCollection, QuadMesh, LineCollection, PolyCollection
```

Et après `from matplotlib.container import BarContainer` (ligne 25), ajouter :

```python
from matplotlib.container import ErrorbarContainer
```

(`PolyCollection` servira en Task 2 ; on l'importe ici pour ne pas y revenir.)

- [ ] **Step 2: Écrire les tests errorbar (échec attendu)**

Dans `test/test_convert.py`, ajouter cette classe après `ConvertBaseTests` (avant `class ConvertDateTests`) :

```python
class ConvertErrorbarTests(unittest.TestCase):
    def tearDown(self):
        plt.close("all")

    def _ebar_trace(self, spec):
        # la trace errorbar est la seule trace scatter de la figure
        traces = [t for t in spec["data"] if t["type"] == "scatter"]
        self.assertEqual(len(traces), 1, "doublon de trace errorbar")
        return traces[0]

    def test_errorbar_symmetric_y(self):
        fig, ax = plt.subplots()
        ax.errorbar([0, 1, 2], [0, 1, 2], yerr=0.5)
        spec = convert_figure(fig)
        self.assertIsNotNone(spec)
        t = self._ebar_trace(spec)
        self.assertIn("error_y", t)
        self.assertEqual(t["error_y"]["type"], "data")
        self.assertNotIn("arrayminus", t["error_y"])
        for v in t["error_y"]["array"]:
            self.assertAlmostEqual(v, 0.5, places=6)

    def test_errorbar_asymmetric_y(self):
        fig, ax = plt.subplots()
        ax.errorbar([0, 1], [10, 10], yerr=[[1, 1], [3, 3]])  # lo, hi
        spec = convert_figure(fig)
        t = self._ebar_trace(spec)
        self.assertFalse(t["error_y"].get("symmetric", True))
        for v in t["error_y"]["array"]:       # plus
            self.assertAlmostEqual(v, 3.0, places=6)
        for v in t["error_y"]["arrayminus"]:  # minus
            self.assertAlmostEqual(v, 1.0, places=6)

    def test_errorbar_xerr(self):
        fig, ax = plt.subplots()
        ax.errorbar([0, 1, 2], [0, 1, 2], xerr=0.2)
        spec = convert_figure(fig)
        t = self._ebar_trace(spec)
        self.assertIn("error_x", t)
        for v in t["error_x"]["array"]:
            self.assertAlmostEqual(v, 0.2, places=6)
```

- [ ] **Step 3: Lancer les tests, vérifier l'échec**

Run: `python test/test_convert.py ConvertErrorbarTests -v`
Expected: échec — la figure errorbar contient une `LineCollection`, donc `convert_figure` renvoie `None` (les assertions `assertIsNotNone`/index échouent).

- [ ] **Step 4: Étendre le garde-fou pour laisser passer les artistes réclamés**

Dans `_has_unsupported_artist` (ligne 414), changer la signature et la logique :

```python
def _has_unsupported_artist(ax, bar_rectangles, claimed):
    from matplotlib.collections import Collection
    from matplotlib.patches import Patch
    from matplotlib.spines import Spine

    for child in ax.get_children():
        if isinstance(child, Spine):
            continue  # bordures des axes : ignorables (heritent de Patch)
        if child in claimed:
            continue  # artiste reclame par un errorbar (ligne/caps/barres)
        if isinstance(child, (Line2D, PathCollection, QuadMesh, AxesImage)):
            continue
        if isinstance(child, Rectangle):
            if child in bar_rectangles:
                continue
            if child is ax.patch:
                continue
            return True
        if isinstance(child, PolyCollection):
            continue  # fill_between : converti en Task 2
        # Toute autre Collection (LineCollection hors errorbar, ContourSet,
        # EventCollection...) n'est pas convertie -> fallback SVG.
        if isinstance(child, Collection):
            return True
        if isinstance(child, Patch):
            return True
        # Text, Spine, Axis, Legend... : ignorables
    return False
```

(Note : `PolyCollection` hérite de `Collection` ; le branchement `PolyCollection` doit donc précéder le `Collection` générique. En Task 2, `convert_figure` retombera en SVG si la géométrie n'est pas exploitable.)

- [ ] **Step 5: Implémenter les helpers errorbar**

Après `_convert_bars` (qui se termine ~ligne 340), ajouter :

```python
def _errorbar_artists(ax):
    """Artistes appartenant aux ErrorbarContainer (ligne de donnees, caps,
    barres) : a ne pas reconvertir comme courbes/collections separees."""
    claimed = set()
    for container in ax.containers:
        if isinstance(container, ErrorbarContainer):
            data_line, caplines, barlinecols = container.lines
            if data_line is not None:
                claimed.add(data_line)
            for c in caplines:
                claimed.add(c)
            for bc in barlinecols:
                claimed.add(bc)
    return claimed


def _errors_from_segments(segments, centers, vertical):
    """Segments d'erreur (LineCollection) -> dict error Plotly.
    vertical=True : barres verticales (erreur en y) ; sinon erreur en x.
    L'ordre des segments suit celui des points (convention matplotlib)."""
    idx = 1 if vertical else 0  # composante variable du segment (y si vertical)
    plus, minus = [], []
    for seg, c in zip(segments, centers):
        lo = min(seg[0][idx], seg[1][idx])
        hi = max(seg[0][idx], seg[1][idx])
        minus.append(float(c - lo))
        plus.append(float(hi - c))
    if not plus:
        return None
    symmetric = all(abs(p - m) <= 1e-9 for p, m in zip(plus, minus))
    err = {"type": "data", "array": plus, "visible": True}
    if not symmetric:
        err["symmetric"] = False
        err["arrayminus"] = minus
    return err


def _convert_errorbar(container, axis_suffix):
    """ErrorbarContainer -> trace scatter avec error_x/error_y."""
    data_line, _caplines, barlinecols = container.lines
    if data_line is None:
        return None, 0
    x = _as_float_array(data_line.get_xdata())
    y = _as_float_array(data_line.get_ydata())
    if x.size == 0:
        return None, 0

    has_line = data_line.get_linestyle() not in ("None", "none", " ", "")
    has_marker = data_line.get_marker() not in ("None", "none", " ", "", None)
    if has_line and has_marker:
        mode = "lines+markers"
    elif has_marker:
        mode = "markers"
    else:
        mode = "lines"

    trace = {
        "type": "scatter",
        "mode": mode,
        "x": _finite_list(x),
        "y": _finite_list(y),
        "xaxis": "x" + axis_suffix,
        "yaxis": "y" + axis_suffix,
        "line": {"color": _hex(data_line.get_color())},
    }
    if has_marker:
        trace["marker"] = {
            "symbol": _MARKERS.get(str(data_line.get_marker()), "circle"),
            "size": float(data_line.get_markersize()),
            "color": _hex(data_line.get_markerfacecolor()),
        }
    label = data_line.get_label()
    if _label_ok(label):
        trace["name"] = label
        trace["showlegend"] = True
    else:
        trace["showlegend"] = False

    for bc in barlinecols:
        segs = bc.get_segments()
        if not segs:
            continue
        # vertical = segments a x quasi constant -> erreur en y
        vertical = abs(segs[0][0][0] - segs[0][1][0]) <= abs(segs[0][0][1] - segs[0][1][1])
        centers = y if vertical else x
        err = _errors_from_segments(segs, centers, vertical)
        if err is not None:
            trace["error_y" if vertical else "error_x"] = err

    return trace, x.size
```

- [ ] **Step 6: Câbler dans `convert_figure`**

Dans `convert_figure`, au début du corps de la boucle `for info in _classify_axes(...)` (juste après avoir récupéré `ax`, `suffix`, etc. et **avant** le calcul de `bar_rectangles`, ~ligne 543), ajouter la collecte des artistes réclamés :

```python
        claimed = _errorbar_artists(ax)
```

Remplacer l'appel au garde-fou (ligne ~551) :

```python
        if _has_unsupported_artist(ax, bar_rectangles, claimed):
            return None
```

Dans la boucle des lignes (ligne ~560), sauter les lignes réclamées :

```python
        for line in ax.get_lines():
            if line in claimed:
                continue
            trace, n = _convert_line(line, suffix)
            if trace is not None:
                data.append(trace)
                total_points += n
```

Dans la boucle des containers (ligne ~580), ajouter le cas errorbar à côté des barres :

```python
        for container in ax.containers:
            if isinstance(container, BarContainer):
                trace, n = _convert_bars(container, suffix)
                if trace is not None:
                    data.append(trace)
                    total_points += n
            elif isinstance(container, ErrorbarContainer):
                trace, n = _convert_errorbar(container, suffix)
                if trace is not None:
                    data.append(trace)
                    total_points += n
```

- [ ] **Step 7: Lancer les tests, vérifier le succès**

Run: `python test/test_convert.py ConvertErrorbarTests -v`
Expected: 3 tests OK.

- [ ] **Step 8: Non-régression de l'ensemble**

Run: `python test/test_convert.py`
Expected: tout passe **sauf** éventuellement `test_unsupported_fill_between_returns_none` et `test_unsupported_text_returns_none` qui restent verts ici (fill_between/text encore non gérés). Si un autre test casse, corriger avant de continuer.

- [ ] **Step 9: Commit**

```bash
git add python/_mpl_to_plotly.py test/test_convert.py
git commit -m "feat(convert): errorbar -> scatter avec error_x/error_y"
```

---

### Task 2: fill_between → trace(s) `fill:'toself'`

**Files:**
- Modify: `python/_mpl_to_plotly.py` (nouveau helper après `_convert_errorbar` ; câblage boucle `get_children` ~ligne 566)
- Modify: `test/test_convert.py` (remplacer le test obsolète + nouvelle classe)

**Interfaces:**
- Consumes: `_hex`, `_finite_list`. Garde-fou déjà adapté en Task 1 (PolyCollection laissé passer).
- Produces: `_convert_fill_between(coll, axis_suffix) -> (list[trace]|None, npts)`. Une trace `fill:'toself'` par path (gère `where=` = plusieurs polygones). `None` si géométrie inexploitable.

> Note de conception : la spec évoquait 2 traces `fill:'tonexty'` ; on utilise `fill:'toself'` (une trace par polygone), strictement équivalent et plus robuste pour une bande quelconque et pour les régions disjointes de `where=`.

- [ ] **Step 1: Remplacer le test obsolète + écrire les nouveaux (échec attendu)**

Dans `test/test_convert.py`, **supprimer** `test_unsupported_fill_between_returns_none` (lignes ~41-44 dans `ConvertBaseTests`).

Ajouter une classe après `ConvertErrorbarTests` :

```python
class ConvertFillBetweenTests(unittest.TestCase):
    def tearDown(self):
        plt.close("all")

    def test_fill_between_simple(self):
        fig, ax = plt.subplots()
        x = [0, 1, 2, 3]
        ax.fill_between(x, [0, 1, 1, 0], [1, 2, 2, 1])
        spec = convert_figure(fig)
        self.assertIsNotNone(spec)
        fills = [t for t in spec["data"] if t.get("fill") == "toself"]
        self.assertEqual(len(fills), 1)
        self.assertIn("fillcolor", fills[0])
        self.assertEqual(fills[0]["line"]["width"], 0)

    def test_fill_between_where_multi_region(self):
        fig, ax = plt.subplots()
        x = np.linspace(0, 10, 50)
        y = np.sin(x)
        ax.fill_between(x, y, 0, where=(y > 0))
        spec = convert_figure(fig)
        self.assertIsNotNone(spec)
        fills = [t for t in spec["data"] if t.get("fill") == "toself"]
        self.assertGreaterEqual(len(fills), 2)  # plusieurs lobes positifs

    def test_fill_between_keeps_line(self):
        # une courbe + une bande : la courbe reste une trace, la bande aussi
        fig, ax = plt.subplots()
        x = [0, 1, 2]
        ax.plot(x, [1, 2, 3])
        ax.fill_between(x, [0, 0, 0], [1, 1, 1])
        spec = convert_figure(fig)
        self.assertIsNotNone(spec)
        lines = [t for t in spec["data"] if t.get("fill") != "toself"]
        fills = [t for t in spec["data"] if t.get("fill") == "toself"]
        self.assertEqual(len(lines), 1)
        self.assertEqual(len(fills), 1)
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `python test/test_convert.py ConvertFillBetweenTests -v`
Expected: échec — `PolyCollection` passe le garde-fou (Task 1) mais n'est pas encore convertie, donc elle est ignorée : aucune trace `fill:'toself'` n'existe → assertions échouent.

- [ ] **Step 3: Implémenter `_convert_fill_between`**

Après `_convert_errorbar`, ajouter :

```python
def _convert_fill_between(coll, axis_suffix):
    """PolyCollection (fill_between) -> liste de traces 'fill:toself'.
    Une trace par polygone (gere where=). None si geometrie inexploitable."""
    paths = coll.get_paths()
    if not paths:
        return None, 0
    facecolors = coll.get_facecolor()
    fillcolor = _hex(facecolors[0]) if len(facecolors) else "rgba(0,0,0,0.3)"
    edgecolors = coll.get_edgecolor()
    line = {"width": 0}
    if len(edgecolors):
        lw = coll.get_linewidth()
        if len(lw) and lw[0] > 0:
            line = {"color": _hex(edgecolors[0]), "width": float(lw[0])}

    traces = []
    npts = 0
    for path in paths:
        v = np.asarray(path.vertices, dtype=float)
        if v.shape[0] < 3:
            return None, 0  # pas un polygone exploitable -> SVG
        npts += v.shape[0]
        traces.append({
            "type": "scatter",
            "mode": "lines",
            "x": _finite_list(v[:, 0]),
            "y": _finite_list(v[:, 1]),
            "xaxis": "x" + axis_suffix,
            "yaxis": "y" + axis_suffix,
            "fill": "toself",
            "fillcolor": fillcolor,
            "line": line,
            "showlegend": False,
            "hoverinfo": "skip",
        })
    return traces, npts
```

- [ ] **Step 4: Câbler dans la boucle `get_children` de `convert_figure`**

Dans `convert_figure`, dans la boucle `for child in ax.get_children()` (ligne ~566), ajouter une branche `PolyCollection` **avant** le `else: continue`. La boucle actuelle traite `PathCollection`/`QuadMesh`/`AxesImage` puis `append`. La remplacer par :

```python
        for child in ax.get_children():
            if isinstance(child, PolyCollection):
                traces, n = _convert_fill_between(child, suffix)
                if traces is None:
                    return None
                data.extend(traces)
                total_points += n
                continue
            if isinstance(child, PathCollection):
                trace, n = _convert_scatter(child, suffix)
            elif isinstance(child, QuadMesh):
                trace, n = _convert_quadmesh(child, suffix)
            elif isinstance(child, AxesImage):
                trace, n = _convert_image(child, suffix)
            else:
                continue
            if trace is None:
                return None
            data.append(trace)
            total_points += n
```

(`PathCollection` n'est pas une `PolyCollection`, l'ordre des `if` est donc sûr.)

- [ ] **Step 5: Lancer les tests, vérifier le succès**

Run: `python test/test_convert.py ConvertFillBetweenTests -v`
Expected: 3 tests OK.

- [ ] **Step 6: Non-régression**

Run: `python test/test_convert.py`
Expected: tout passe sauf `test_unsupported_text_returns_none` (encore vert : text non géré jusqu'à la Task 3). Aucun autre échec.

- [ ] **Step 7: Commit**

```bash
git add python/_mpl_to_plotly.py test/test_convert.py
git commit -m "feat(convert): fill_between -> trace(s) fill:toself"
```

---

### Task 3: text() / annotate() → `layout.annotations`

**Files:**
- Modify: `python/_mpl_to_plotly.py` (imports ; sentinel + helpers après `_convert_fill_between` ; suppression du garde-fou texte ligne ~556 ; câblage texts + conversion date dans `convert_figure`)
- Modify: `test/test_convert.py` (remplacer le test obsolète + nouvelle classe)

**Interfaces:**
- Consumes: `_hex`.
- Produces:
  - `_TEXT_UNSUPPORTED` — sentinel (objet module) signalant un texte non convertible (→ SVG).
  - `_coord_ref(coords, axis_suffix) -> (xref, yref)|None` — mappe `'data'`/`'axes fraction'` vers réfs Plotly.
  - `_convert_text(text, ax, axis_suffix) -> dict | None | _TEXT_UNSUPPORTED` — dict annotation Plotly ; `None` si texte vide (ignoré) ; `_TEXT_UNSUPPORTED` si coord. non gérée.

- [ ] **Step 1: Ajouter l'import Annotation**

Après `from matplotlib.lines import Line2D` (ligne 22), ajouter :

```python
from matplotlib.text import Annotation
```

- [ ] **Step 2: Remplacer le test obsolète + écrire les nouveaux (échec attendu)**

Dans `test/test_convert.py`, **supprimer** `test_unsupported_text_returns_none` (lignes ~46-50 dans `ConvertBaseTests`).

Ajouter une classe après `ConvertFillBetweenTests` :

```python
class ConvertTextTests(unittest.TestCase):
    def tearDown(self):
        plt.close("all")

    def test_text_data_coords(self):
        fig, ax = plt.subplots()
        ax.plot([0, 1], [0, 1])
        ax.text(0.5, 0.5, "note")
        spec = convert_figure(fig)
        self.assertIsNotNone(spec)
        anns = spec["layout"]["annotations"]
        self.assertEqual(len(anns), 1)
        a = anns[0]
        self.assertEqual(a["text"], "note")
        self.assertEqual(a["xref"], "x")
        self.assertFalse(a["showarrow"])
        self.assertAlmostEqual(a["x"], 0.5, places=6)

    def test_annotate_with_arrow(self):
        fig, ax = plt.subplots()
        ax.plot([0, 1], [0, 1])
        ax.annotate("pic", xy=(1, 1), xytext=(0.5, 0.8),
                    arrowprops=dict(arrowstyle="->"))
        spec = convert_figure(fig)
        a = spec["layout"]["annotations"][0]
        self.assertTrue(a["showarrow"])
        self.assertAlmostEqual(a["x"], 1.0, places=6)   # cible de la fleche
        self.assertAlmostEqual(a["y"], 1.0, places=6)
        self.assertIn("ax", a)                           # ancrage du texte
        self.assertIn("ay", a)

    def test_text_axes_fraction_is_paper(self):
        fig, ax = plt.subplots()
        ax.plot([0, 1], [0, 1])
        ax.text(0.95, 0.95, "coin", transform=ax.transAxes)
        spec = convert_figure(fig)
        a = spec["layout"]["annotations"][0]
        self.assertEqual(a["xref"], "paper")
        self.assertEqual(a["yref"], "paper")

    def test_text_unsupported_transform_returns_none(self):
        fig, ax = plt.subplots()
        ax.plot([0, 1], [0, 1])
        # transform pixels (figure) non gere -> repli SVG
        ax.text(10, 10, "px", transform=fig.dpi_scale_trans)
        self.assertIsNone(convert_figure(fig))
```

- [ ] **Step 3: Lancer les tests, vérifier l'échec**

Run: `python test/test_convert.py ConvertTextTests -v`
Expected: échec — `convert_figure` renvoie encore `None` dès qu'il y a du texte (garde-fou ligne ~556).

- [ ] **Step 4: Implémenter le sentinel et les helpers texte**

Après `_convert_fill_between`, ajouter :

```python
_TEXT_UNSUPPORTED = object()  # texte a coordonnees non gerees -> repli SVG


def _coord_ref(coords, axis_suffix):
    """Systeme de coordonnees matplotlib (str) -> (xref, yref) Plotly.
    None si non gere."""
    if coords == "data":
        return "x" + axis_suffix, "y" + axis_suffix
    if coords in ("axes fraction", "axes"):
        return "paper", "paper"
    return None


def _convert_text(text, ax, axis_suffix):
    """Text/Annotation -> dict annotation Plotly, None (vide) ou
    _TEXT_UNSUPPORTED (coord. non gerees)."""
    s = text.get_text()
    if s is None or s == "":
        return None

    font = {"size": float(text.get_fontsize()), "color": _hex(text.get_color())}
    rot = text.get_rotation()

    if isinstance(text, Annotation):
        # coordonnees du texte (xytext) et de la cible (xy)
        textcoords = text.textcoords if isinstance(text.textcoords, str) else None
        xycoords = text.xycoords if isinstance(text.xycoords, str) else None
        if textcoords is None:
            textcoords = "data"
        if xycoords is None:
            xycoords = "data"
        tref = _coord_ref(textcoords, axis_suffix)
        aref = _coord_ref(xycoords, axis_suffix)
        if tref is None or aref is None:
            return _TEXT_UNSUPPORTED
        tx, ty = text.get_position()      # xytext (ancrage du texte)
        ax_, ay_ = text.xy                # cible de la fleche
        has_arrow = getattr(text, "arrowprops", None) is not None
        ann = {
            "text": s, "font": font,
            "showarrow": bool(has_arrow),
        }
        if rot:
            ann["textangle"] = -float(rot)
        if has_arrow:
            ann["x"] = float(ax_); ann["y"] = float(ay_)
            ann["xref"] = aref[0]; ann["yref"] = aref[1]
            ann["ax"] = float(tx); ann["ay"] = float(ty)
            ann["axref"] = tref[0]; ann["ayref"] = tref[1]
        else:
            ann["x"] = float(tx); ann["y"] = float(ty)
            ann["xref"] = tref[0]; ann["yref"] = tref[1]
        return ann

    # Text simple : detection du transform
    transform = text.get_transform()
    if transform is ax.transData:
        xref, yref = "x" + axis_suffix, "y" + axis_suffix
    elif transform is ax.transAxes:
        xref, yref = "paper", "paper"
    else:
        return _TEXT_UNSUPPORTED
    x, y = text.get_position()
    ann = {
        "x": float(x), "y": float(y),
        "xref": xref, "yref": yref,
        "text": s, "showarrow": False, "font": font,
    }
    if rot:
        ann["textangle"] = -float(rot)
    return ann
```

- [ ] **Step 5: Retirer le garde-fou texte et câbler la conversion**

Dans `convert_figure`, **supprimer** les lignes (~554-557) :

```python
        # text()/annotate() utilisateur ne sont pas convertis en Plotly :
        # pour ne pas les perdre silencieusement, on retombe sur le SVG.
        if len(ax.texts) > 0:
            return None
```

Après la boucle des containers (après le bloc `for container in ax.containers`, ~ligne 585), ajouter la conversion des textes :

```python
        ann_start = len(layout["annotations"])
        for text in ax.texts:
            ann = _convert_text(text, ax, suffix)
            if ann is _TEXT_UNSUPPORTED:
                return None
            if ann is not None:
                layout["annotations"].append(ann)
```

- [ ] **Step 6: Conversion ISO des annotations sur axe date**

La conversion date existante (~ligne 593) ne traite que `data[axis_trace_start:]`. Juste après cette boucle `for trace in data[axis_trace_start:]: ...`, ajouter le pendant pour les annotations de cet axe :

```python
        for ann in layout["annotations"][ann_start:]:
            if x_is_date and ann.get("xref") == "x" + suffix:
                ann["x"] = _dates_to_iso([ann["x"]])[0]
                if ann.get("axref") == "x" + suffix:
                    ann["ax"] = _dates_to_iso([ann["ax"]])[0]
            if y_is_date and ann.get("yref") == "y" + suffix:
                ann["y"] = _dates_to_iso([ann["y"]])[0]
                if ann.get("ayref") == "y" + suffix:
                    ann["ay"] = _dates_to_iso([ann["ay"]])[0]
```

(`_dates_to_iso` existe déjà et prend une liste ; on l'appelle sur un singleton.)

- [ ] **Step 7: Lancer les tests, vérifier le succès**

Run: `python test/test_convert.py ConvertTextTests -v`
Expected: 4 tests OK.

- [ ] **Step 8: Non-régression complète**

Run: `python test/test_convert.py`
Expected: **tout** passe (les deux anciens tests `*_returns_none` ont été remplacés).

- [ ] **Step 9: Commit**

```bash
git add python/_mpl_to_plotly.py test/test_convert.py
git commit -m "feat(convert): text/annotate -> layout.annotations (fleches + transAxes)"
```

---

### Task 4: Documentation + vérification finale

**Files:**
- Modify: `README.md` (section « Limites connues » ~ligne 93-99)
- Modify: `CLAUDE.md` (section décrivant `_mpl_to_plotly.py`)

**Interfaces:** aucune.

- [ ] **Step 1: Mettre à jour `README.md`**

Remplacer le bloc « Limites connues » (lignes ~95-97) par :

```markdown
- **Artistes non gérés → rendu SVG** (net mais non interactif) :
  `contour`/`contourf`, `quiver`/`streamplot`, `fill_betweenx`, axes polaires,
  3D, `pie`, et toute figure contenant un texte en coordonnées non gérées
  (transform autre que données/fraction d'axe).
- **errorbar**, **fill_between** et **text()/annotate()** sont désormais rendus
  en interactif (Plotly).
```

(Garder la puce `boxplot` existante.)

- [ ] **Step 2: Mettre à jour `CLAUDE.md`**

Dans la section « `python/_mpl_to_plotly.py` », mettre à jour la liste des artistes supportés et des lacunes. Remplacer la phrase listant les « Remaining gaps » par :

```markdown
Supported artists also include `errorbar` (→ `error_x`/`error_y`),
`fill_between` (→ `fill:'toself'`), and `text()`/`annotate()` (→ layout
annotations, arrows + `transAxes`). Remaining gaps (→ SVG fallback):
`fill_betweenx`, contour/contourf, quiver/streamplot, 3D, pie, polar, and text
in unsupported coordinate transforms.
```

- [ ] **Step 3: Vérification finale**

Run: `python test/test_convert.py`
Expected: tous les tests passent.

Run: `python test/test_error_curves.js` (non-régression du lot précédent — via `node test/test_error_curves.js`)
Expected: 26 tests passes.

Run: `node --check extension.js`
Expected: aucune sortie.

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: errorbar/fill_between/text passent en interactif"
```

---

## Notes d'implémentation

- **DRY** : `_convert_errorbar` réutilise la logique mode/marker/label de `_convert_line` (dupliquée volontairement plutôt que d'extraire un helper, pour rester local et lisible ; si une 3ᵉ copie apparaît, extraire `_line_mode_and_style(line)`).
- **YAGNI** : `fill_betweenx`, contour, polaire, 3D, pie hors périmètre (repli SVG conservé).
- **Frontière de correction** : chaque helper renvoie un signal de repli (`None` / `_TEXT_UNSUPPORTED`) que `convert_figure` transforme en `return None` → SVG.
- **Tests** : `test/test_convert.py` (`unittest`) exige un interpréteur avec matplotlib/numpy ; voir Global Constraints.
```
