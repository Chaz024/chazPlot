// media/plot_nav.js — math pure de navigation des graphes :
//   - zoom molette (Ctrl/Cmd + molette), centre sur le curseur
//   - pan au clic-molette (bouton du milieu) maintenu
// Travaille en espace LINEAIRE de l'axe : la glue (panel.html) convertit via
// les helpers Plotly r2l/l2r, donc ces fonctions restent correctes pour les
// axes log et date. UMD : self.PlotNav (webview) / require (node, tests).
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PlotNav = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Zoom autour d'un point d'ancrage. anchor in [0,1] = position du curseur le
  // long de [l0, l1]. factor > 1 => zoom avant (intervalle plus petit) ;
  // factor < 1 => zoom arriere. Le point sous le curseur reste fixe.
  function zoomRange(l0, l1, anchor, factor) {
    if (!isFinite(l0) || !isFinite(l1) || l1 === l0) { return [l0, l1]; }
    if (!isFinite(factor) || factor <= 0) { return [l0, l1]; }
    if (anchor < 0) { anchor = 0; } else if (anchor > 1) { anchor = 1; }
    var a = l0 + anchor * (l1 - l0);
    var newSpan = (l1 - l0) / factor;
    return [a - anchor * newSpan, a + (1 - anchor) * newSpan];
  }

  // Pan : decale [l0, l1] de fracDelta * (l1 - l0). fracDelta > 0 decale la vue
  // vers les valeurs decroissantes (le contenu "suit" le curseur).
  function panRange(l0, l1, fracDelta) {
    if (!isFinite(l0) || !isFinite(l1) || !isFinite(fracDelta)) { return [l0, l1]; }
    var shift = fracDelta * (l1 - l0);
    return [l0 - shift, l1 - shift];
  }

  return { zoomRange: zoomRange, panRange: panRange };
});
