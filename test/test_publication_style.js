// test/test_publication_style.js — garde-fou du preset "science" (sans navigateur).
// Verifie que panel.html porte les cibles visuelles SciencePlots cles.
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(
  path.join(__dirname, "..", "media", "panel.html"), "utf8");

const required = [
  // Pile serif elargie (rendu type Computer Modern)
  "CMU Serif",
  // Axes/ticks dessines au-dessus des donnees
  '"above traces"',
  // gridPatch pose bien la couche
  '".layer"',
  // minor ticks couleur noire
  ".minor.tickcolor",
];

const missing = required.filter(function (token) { return html.indexOf(token) < 0; });
if (missing.length) {
  console.error("ECHEC test_publication_style : tokens manquants :\n" +
    missing.map(function (t) { return "  - " + t; }).join("\n"));
  process.exit(1);
}
console.log("OK test_publication_style : " + required.length + " cibles presentes.");
