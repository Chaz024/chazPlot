// test/test_plot_nav.js — assertions du module pur media/plot_nav.js.
// Lancer : node test/test_plot_nav.js
const assert = require("assert");
const { zoomRange, panRange } = require("../media/plot_nav.js");

function approx(a, b, eps) {
  assert.ok(Math.abs(a - b) <= (eps || 1e-9), a + " !~ " + b);
}

// --- zoom ---
// zoom avant (factor 2) centre (anchor .5) : intervalle divise par 2 autour du centre
let r = zoomRange(0, 10, 0.5, 2);
approx(r[0], 2.5); approx(r[1], 7.5);

// zoom arriere (factor .5) centre : intervalle double
r = zoomRange(0, 10, 0.5, 0.5);
approx(r[0], -5); approx(r[1], 15);

// ancrage bord gauche (anchor 0) : l0 fixe
r = zoomRange(0, 10, 0, 2);
approx(r[0], 0); approx(r[1], 5);

// ancrage bord droit (anchor 1) : l1 fixe
r = zoomRange(0, 10, 1, 2);
approx(r[0], 5); approx(r[1], 10);

// facteur 1 = identite
r = zoomRange(3, 8, 0.3, 1);
approx(r[0], 3); approx(r[1], 8);

// anchor hors bornes -> borne
r = zoomRange(0, 10, 2, 2);
approx(r[0], 5); approx(r[1], 10);

// intervalle degenere / facteur invalide -> inchange
assert.deepStrictEqual(zoomRange(5, 5, 0.5, 2), [5, 5]);
assert.deepStrictEqual(zoomRange(0, 10, 0.5, 0), [0, 10]);

// le point sous le curseur reste fixe (anchor .25, factor 3)
r = zoomRange(0, 10, 0.25, 3);
approx(r[0] + 0.25 * (r[1] - r[0]), 2.5);

// --- pan ---
// fracDelta .1 sur [0,10] -> decale de 1 vers le bas
r = panRange(0, 10, 0.1);
approx(r[0], -1); approx(r[1], 9);

// fracDelta negatif
r = panRange(0, 10, -0.2);
approx(r[0], 2); approx(r[1], 12);

// pan 0 = identite ; preserve la largeur
r = panRange(0, 10, 0);
approx(r[0], 0); approx(r[1], 10);
r = panRange(4, 9, 0.5);
approx(r[1] - r[0], 5);

console.log("test_plot_nav: OK");
