// ============================================================
// csv_export.js
// Construction d'un CSV a partir des traces d'une figure (fonctions pures,
// sans DOM). Deux formats : "tidy" (serie,x,y[,z]) via buildCsv, et "large"
// groupe par serie (un bloc X/Y par courbe, separe d'une colonne vide) via
// buildWideCsv. Gere les series xy (lignes/points/barres) et les grilles z 2D
// (heatmap/pcolormesh), avec filtrage optionnel par plage x visible (zoom).
// Charge dans le webview (self.CsvExport) et sous Node (require).
// Aucune dependance.
// ============================================================
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  else { root.CsvExport = api; }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function isFiniteNum(v) { return typeof v === "number" && isFinite(v); }

  // Echappe un champ CSV (RFC 4180) : delimiteur point-virgule (compatible
  // Excel francais). Entoure de guillemets si point-virgule, virgule,
  // guillemet ou saut de ligne ; double les guillemets internes.
  function csvEscape(value) {
    const s = String(value);
    if (/[;,"\n\r]/.test(s)) { return '"' + s.replace(/"/g, '""') + '"'; }
    return s;
  }

  // Valeur de cellule : "" pour null/undefined/NaN/Infinity ; sinon la valeur
  // telle quelle (nombre -> son ecriture JS pleine precision, date ISO -> chaine).
  // Options (optionnelles) :
  //   precision    : nombre de decimales (toFixed), ex. 6.
  //   decimalComma : remplacer le point decimal par une virgule (Excel francais).
  function formatValue(v, precision, decimalComma) {
    if (v === null || v === undefined) { return ""; }
    if (typeof v === "number") {
      if (!isFinite(v)) { return ""; }
      let s = (precision != null) ? v.toFixed(precision) : String(v);
      if (decimalComma) { s = s.replace(".", ","); }
      return s;
    }
    return String(v);
  }

  // True si x (numerique) est dans la plage [lo, hi] ; un x non numerique ou
  // une plage absente n'exclut rien (ex. axes date : pas de filtre par zoom).
  function inRange(x, range) {
    if (!range) { return true; }
    if (!isFiniteNum(x)) { return true; }
    const lo = Math.min(range[0], range[1]);
    const hi = Math.max(range[0], range[1]);
    return x >= lo && x <= hi;
  }

  function isGrid(series) {
    return Array.isArray(series.z) && series.z.length > 0 && Array.isArray(series.z[0]);
  }

  // series : [{ name, x:[], y:[], z? }] ; z 2D => grille (heatmap).
  // opts.xRange : [lo, hi] pour ne garder que les points visibles.
  function buildCsv(series, opts) {
    const xRange = opts && opts.xRange ? opts.xRange : null;
    const hasZ = series.some(function (s) { return s.z != null; });
    const header = hasZ ? "serie;x;y;z" : "serie;x;y";
    const rows = [];

    series.forEach(function (s) {
      const name = csvEscape(formatValue(s.name));
      if (isGrid(s)) {
        const xs = s.x || [], ys = s.y || [], z = s.z;
        for (let i = 0; i < ys.length; i++) {
          for (let j = 0; j < xs.length; j++) {
            if (!inRange(xs[j], xRange)) { continue; }
            const zv = (z[i] && z[i][j] !== undefined) ? z[i][j] : null;
            rows.push(name + ";" + csvEscape(formatValue(xs[j])) + ";" +
                      csvEscape(formatValue(ys[i])) + ";" + csvEscape(formatValue(zv)));
          }
        }
        return;
      }
      const xs = s.x || [], ys = s.y || [], zs = s.z || null;
      for (let k = 0; k < xs.length; k++) {
        if (!inRange(xs[k], xRange)) { continue; }
        let row = name + ";" + csvEscape(formatValue(xs[k])) + ";" + csvEscape(formatValue(ys[k]));
        if (hasZ) { row += ";" + csvEscape(formatValue(zs ? zs[k] : null)); }
        rows.push(row);
      }
    });

    return [header].concat(rows).join("\n") + "\n";
  }

  // Format "large" groupe par serie (Excel) : un BLOC de 2 colonnes (X, Y) par
  // serie, chaque bloc separe du suivant par une COLONNE VIDE pour bien les
  // distinguer a l'oeil. Deux lignes d'en-tete : le nom de la serie (au-dessus
  // de sa colonne X), puis "x" / "y". Pratique pour copier-coller dans un tableur.
  //
  //   NomA ;     ;   ; NomB ;
  //   x    ; y   ;   ; x    ; y
  //   0    ; 2   ;   ; 5    ; 9
  //   1    ; 3   ;   ; 6    ; 8
  //
  // series : [{ name, x:[], y:[] }]
  // opts.precision   : decimales pour les nombres (toFixed), ex. 6 (defaut 6).
  // opts.decimalComma: virgule decimale au lieu du point (true par defaut).
  // opts.xRange      : [lo, hi] pour ne garder que les points visibles.
  function buildWideCsv(series, opts) {
    if (!series.length) { return "\n"; }
    const precision = (opts && opts.precision != null) ? opts.precision : 6;
    const decimalComma = (opts && opts.decimalComma === false) ? false : true;
    const xRange = opts && opts.xRange ? opts.xRange : null;
    const fmt = function (v) { return formatValue(v, precision, decimalComma); };

    // Assemble une ligne : 2 cellules par serie, separees d'un bloc a l'autre
    // par une cellule vide (la colonne de separation).
    function buildRow(cellFor) {
      const out = [];
      series.forEach(function (s, bi) {
        if (bi > 0) { out.push(""); }        // colonne vide de separation
        const pair = cellFor(s);
        out.push(pair[0], pair[1]);
      });
      return out.join(";");
    }

    // Alignement : chaque serie a ses propres X/Y ; on prend le max de points
    // (longueur brute, pas filtree : une ligne hors plage = cellule vide, pas absente).
    let maxLen = 0;
    series.forEach(function (s) { maxLen = Math.max(maxLen, (s.x || []).length); });

    const rows = [
      buildRow(function (s) { return [csvEscape(fmt(s.name)), ""]; }),   // ligne des noms
      buildRow(function () { return ["x", "y"]; })                       // ligne x / y
    ];
    for (let i = 0; i < maxLen; i++) {
      rows.push(buildRow(function (s) {
        const xs = s.x || [], ys = s.y || [];
        if (i < xs.length && (!xRange || inRange(xs[i], xRange))) {
          return [csvEscape(fmt(xs[i])), csvEscape(fmt(ys[i] !== undefined ? ys[i] : null))];
        }
        return ["", ""];
      }));
    }

    return rows.join("\n") + "\n";
  }

  return {
    csvEscape: csvEscape,
    formatValue: formatValue,
    inRange: inRange,
    buildCsv: buildCsv,
    buildWideCsv: buildWideCsv,
  };
});
