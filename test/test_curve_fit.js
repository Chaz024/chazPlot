// test/test_curve_fit.js — tests du module pur d'ajustement polynomial.
// Lancer : node test/test_curve_fit.js
"use strict";
const assert = require("assert");
const CF = require("../media/curve_fit.js");

let passed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log("ok   - " + name); }
  catch (e) { console.error("FAIL - " + name + " : " + e.message); process.exitCode = 1; }
}

check("polyfit : retrouve un quadratique exact", function () {
  const xs = [], ys = [];
  for (let x = 0; x <= 10; x += 0.5) { xs.push(x); ys.push(2 + 3 * x - x * x); }
  const f = CF.polyfit(xs, ys, 2);
  assert.ok(f, "resultat non nul");
  assert.ok(f.r2 > 0.9999, "R2 ~ 1 (" + f.r2 + ")");
  assert.ok(Math.abs(f.predict(5) - (2 + 15 - 25)) < 1e-6, "predict(5) = -8");
  // coeffs en x : ~ [2, 3, -1]
  assert.ok(Math.abs(f.coeffs[0] - 2) < 1e-4 && Math.abs(f.coeffs[1] - 3) < 1e-4 && Math.abs(f.coeffs[2] + 1) < 1e-4,
    "coeffs ~ [2,3,-1] : " + JSON.stringify(f.coeffs));
});

check("polyfit : stable sur un grand domaine de x (normalisation)", function () {
  const xs = [], ys = [];
  for (let x = 1000; x <= 1010; x += 0.25) { xs.push(x); ys.push(1 + 0.5 * (x - 1000)); }
  const f = CF.polyfit(xs, ys, 1);
  assert.ok(f.r2 > 0.9999, "lineaire R2 ~ 1");
  assert.ok(Math.abs(f.predict(1005) - 3.5) < 1e-6, "predict(1005) = 3.5 (" + f.predict(1005) + ")");
});

check("polyfit : degre borne au nombre de points - 1", function () {
  const f = CF.polyfit([0, 1, 2], [0, 1, 4], 7);
  assert.ok(f, "pas de crash");
  assert.ok(f.degree <= 2, "degre borne (" + f.degree + ")");
  assert.ok(f.r2 > 0.9999, "passe par 3 points avec deg 2");
});

check("polyfit : R2 plus faible sur des donnees bruitees non polynomiales", function () {
  const xs = [], ys = [];
  for (let x = 0; x <= 10; x += 0.2) { xs.push(x); ys.push(Math.sin(x)); }
  const f = CF.polyfit(xs, ys, 1); // une droite colle mal a un sinus
  assert.ok(f.r2 < 0.8, "R2 faible (" + f.r2 + ")");
});

check("polyfit : null si donnees insuffisantes", function () {
  assert.strictEqual(CF.polyfit([1], [2], 1), null);
  assert.strictEqual(CF.polyfit([], [], 1), null);
});

check("formatEquation : equation lisible, termes ~0 omis", function () {
  const eq = CF.formatEquation([2, 3, -1]);
  assert.ok(/y\s*=/.test(eq), "commence par y =");
  assert.ok(eq.indexOf("3") >= 0 && eq.indexOf("x") >= 0, "contient le terme en x");
  // un coeff nul ne doit pas apparaitre comme '+ 0'
  assert.ok(CF.formatEquation([0, 0, 1]).indexOf("0 ") === -1, "pas de terme nul");
});

check("sampleCurve : echantillonne la courbe ajustee sur [min,max]", function () {
  const f = CF.polyfit([0, 1, 2, 3, 4], [0, 1, 4, 9, 16], 2);
  const pts = CF.sampleCurve(f, 0, 4, 50);
  assert.strictEqual(pts.length, 50);
  assert.ok(Math.abs(pts[0].x - 0) < 1e-9 && Math.abs(pts[49].x - 4) < 1e-9, "bornes");
  assert.ok(Math.abs(pts[pts.length - 1].y - 16) < 1e-4, "y(4) ~ 16");
});

check("bestPolyfit : choisit le degre 2 pour un quadratique (pas plus)", function () {
  const xs = [], ys = [];
  for (let x = 0; x <= 10; x += 0.25) { xs.push(x); ys.push(2 + 3 * x - x * x); }
  const f = CF.bestPolyfit(xs, ys, { maxDegree: 8 });
  assert.strictEqual(f.degree, 2, "degre choisi = 2 (obtenu " + f.degree + ")");
  assert.ok(f.r2 > 0.9999);
});

check("bestPolyfit : degre 1 pour une droite", function () {
  const xs = [], ys = [];
  for (let x = 0; x <= 10; x += 0.5) { xs.push(x); ys.push(4 - 2 * x); }
  assert.strictEqual(CF.bestPolyfit(xs, ys, { maxDegree: 6 }).degree, 1);
});

check("bestPolyfit : degre 3 pour un cubique", function () {
  const xs = [], ys = [];
  for (let x = -3; x <= 3; x += 0.2) { xs.push(x); ys.push(x * x * x - 2 * x); }
  assert.strictEqual(CF.bestPolyfit(xs, ys, { maxDegree: 8 }).degree, 3);
});

check("bestPolyfit : respecte maxDegree", function () {
  const xs = [], ys = [];
  for (let x = 0; x <= 6; x += 0.1) { xs.push(x); ys.push(Math.sin(x)); }
  const f = CF.bestPolyfit(xs, ys, { maxDegree: 4 });
  assert.ok(f.degree <= 4, "degre <= maxDegree (" + f.degree + ")");
});

// ---------------- modeles nommes (non lineaires) ----------------

check("fitModel exp : retrouve a·e^(bx)+c", function () {
  const xs = [], ys = [];
  for (let x = 0; x <= 5; x += 0.1) { xs.push(x); ys.push(2 * Math.exp(0.4 * x) + 1); }
  const f = CF.fitModel(xs, ys, "exp");
  assert.ok(f && f.r2 > 0.999, "R2 ~ 1 (" + (f && f.r2) + ")");
});

check("fitModel gauss : retrouve une gaussienne", function () {
  const xs = [], ys = [];
  for (let x = -5; x <= 5; x += 0.1) { xs.push(x); ys.push(3 * Math.exp(-((x - 1) * (x - 1)) / (2 * 1.5 * 1.5)) + 0.5); }
  const f = CF.fitModel(xs, ys, "gauss");
  assert.ok(f && f.r2 > 0.999, "R2 ~ 1 (" + (f && f.r2) + ")");
});

check("fitModel sine : retrouve a·sin(bx+c)+d", function () {
  const xs = [], ys = [];
  for (let x = 0; x <= 10; x += 0.1) { xs.push(x); ys.push(2 * Math.sin(1.5 * x + 0.5) + 1); }
  const f = CF.fitModel(xs, ys, "sine");
  assert.ok(f && f.r2 > 0.99, "R2 ~ 1 (" + (f && f.r2) + ")");
});

check("bestModel : choisit la gaussienne sur des donnees gaussiennes", function () {
  const xs = [], ys = [];
  for (let x = -5; x <= 5; x += 0.1) { xs.push(x); ys.push(3 * Math.exp(-((x) * (x)) / (2 * 1.2 * 1.2))); }
  const f = CF.bestModel(xs, ys);
  assert.strictEqual(f.modelId, "gauss", "modele choisi = gauss (obtenu " + f.modelId + "/" + f.kind + ")");
  assert.ok(f.r2 > 0.999);
});

check("bestModel : tombe sur un polynome pour des donnees polynomiales", function () {
  const xs = [], ys = [];
  for (let x = 0; x <= 10; x += 0.2) { xs.push(x); ys.push(1 + 2 * x - 0.3 * x * x); }
  const f = CF.bestModel(xs, ys);
  assert.strictEqual(f.kind, "poly", "kind = poly (obtenu " + f.kind + ")");
});

check("codeExpr : expression numpy exploitable", function () {
  const xs = [], ys = [];
  for (let x = 0; x <= 5; x += 0.1) { xs.push(x); ys.push(2 * Math.exp(0.4 * x) + 1); }
  const f = CF.fitModel(xs, ys, "exp");
  const code = f.codeExpr("x");
  assert.ok(/np\.exp/.test(code), "contient np.exp : " + code);
});

console.log("\n" + passed + " tests OK");
