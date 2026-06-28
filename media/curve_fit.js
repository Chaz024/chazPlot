// media/curve_fit.js — ajustement polynomial par moindres carres (module pur).
// UMD : self.CurveFit cote webview / require sous Node. Sert a transformer une
// courbe relevee (ex. digitalisation d'un PNG) en COURBE MODELE lisse + EQUATION.
// Pur, sans dependance. Stabilite : on ajuste sur u = (x - c)/s normalise dans
// [-1,1] (conditionnement), puis on developpe les coefficients vers x pour
// afficher l'equation et calculer les valeurs.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CurveFit = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Resout A x = b (A carree) par elimination de Gauss avec pivot partiel.
  function solveLinear(A, b) {
    const n = A.length;
    const M = A.map(function (row, i) { return row.slice().concat([b[i]]); });
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      if (Math.abs(M[piv][col]) < 1e-12) return null; // singulier
      const tmp = M[col]; M[col] = M[piv]; M[piv] = tmp;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = M[r][col] / M[col][col];
        for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k];
      }
    }
    const x = new Array(n);
    for (let i = 0; i < n; i++) x[i] = M[i][n] / M[i][i];
    return x;
  }

  function binom(n, k) {
    let c = 1;
    for (let i = 0; i < k; i++) c = c * (n - i) / (i + 1);
    return c;
  }

  // Developpe p(u) = Σ b_k u^k avec u=(x-c)/s en a(x) = Σ a_j x^j.
  function expandToX(b, c, s) {
    const deg = b.length - 1;
    const a = new Array(deg + 1).fill(0);
    for (let k = 0; k <= deg; k++) {
      const bk = b[k] / Math.pow(s, k); // b_k * (x-c)^k / s^k
      for (let j = 0; j <= k; j++) {
        a[j] += bk * binom(k, j) * Math.pow(-c, k - j);
      }
    }
    return a;
  }

  function polyvalCoeffs(coeffs, x) {
    let y = 0;
    for (let i = coeffs.length - 1; i >= 0; i--) y = y * x + coeffs[i];
    return y;
  }

  // Ajuste un polynome de degre `degree` sur (xs, ys). Renvoie
  // { coeffs (en x), coeffsU, center, scale, degree, r2, predict, equation } ou null.
  function polyfit(xs, ys, degree) {
    if (!xs || !ys || xs.length !== ys.length) return null;
    const n = xs.length;
    if (n < 2) return null;
    let deg = Math.max(1, Math.floor(degree) || 1);
    if (deg > n - 1) deg = n - 1; // pas plus de degre que de points - 1
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < n; i++) { if (xs[i] < mn) mn = xs[i]; if (xs[i] > mx) mx = xs[i]; }
    const c = (mn + mx) / 2;
    const s = (mx - mn) / 2 || 1;
    const u = xs.map(function (x) { return (x - c) / s; });
    // equations normales (u-Vandermonde) : (V^T V) b = V^T y
    const m = deg + 1;
    const ATA = [], ATy = new Array(m).fill(0);
    for (let i = 0; i < m; i++) ATA.push(new Array(m).fill(0));
    for (let p = 0; p < n; p++) {
      const pw = []; let acc = 1;
      for (let k = 0; k < m; k++) { pw.push(acc); acc *= u[p]; }
      for (let i = 0; i < m; i++) {
        ATy[i] += pw[i] * ys[p];
        for (let j = 0; j < m; j++) ATA[i][j] += pw[i] * pw[j];
      }
    }
    const b = solveLinear(ATA, ATy);
    if (!b) return null;
    const coeffs = expandToX(b, c, s);
    const predict = function (x) {
      const uu = (x - c) / s;
      return polyvalCoeffs(b, uu);
    };
    // R2
    let mean = 0; for (let i = 0; i < n; i++) mean += ys[i]; mean /= n;
    let ssTot = 0, ssRes = 0;
    for (let i = 0; i < n; i++) { const e = ys[i] - predict(xs[i]); ssRes += e * e; const d = ys[i] - mean; ssTot += d * d; }
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : (ssRes < 1e-12 ? 1 : 0);
    return {
      coeffs: coeffs, coeffsU: b, center: c, scale: s, degree: deg, r2: r2,
      predict: predict, equation: formatEquation(coeffs)
    };
  }

  // Choisit AUTOMATIQUEMENT le meilleur degre (1..maxDegree) par critere BIC :
  // n·ln(SSR/n) + k·ln(n), k = nb de parametres. Minimise -> compromis ajustement
  // / parcimonie, donc evite le sur-apprentissage (oscillations) sans avoir a
  // essayer tous les ordres a la main. A egalite (ajustement quasi parfait), garde
  // le degre le plus bas (iteration croissante). Renvoie l'objet polyfit choisi.
  function bestPolyfit(xs, ys, opts) {
    opts = opts || {};
    if (!xs || xs.length < 2) return null;
    const n = xs.length;
    const maxDeg = Math.min(opts.maxDegree != null ? opts.maxDegree : 8, n - 1);
    let mean = 0; for (let i = 0; i < n; i++) mean += ys[i]; mean /= n;
    let ssTot = 0; for (let i = 0; i < n; i++) { const d = ys[i] - mean; ssTot += d * d; }
    const eps = Math.max(1e-300, 1e-12 * (ssTot || 1));
    let best = null, bestBic = Infinity;
    for (let d = 1; d <= maxDeg; d++) {
      const f = polyfit(xs, ys, d);
      if (!f) continue;
      let ssRes = (1 - f.r2) * ssTot;
      if (ssRes < eps) ssRes = eps;
      const bic = n * Math.log(ssRes / n) + (d + 1) * Math.log(n);
      if (bic < bestBic - 1e-9) { bestBic = bic; best = f; }
    }
    return best;
  }

  function polyval(coeffs, x) { return polyvalCoeffs(coeffs, x); }

  function rSquared(xs, ys, predict) {
    const n = xs.length; let mean = 0;
    for (let i = 0; i < n; i++) mean += ys[i]; mean /= n;
    let ssTot = 0, ssRes = 0;
    for (let i = 0; i < n; i++) { const e = ys[i] - predict(xs[i]); ssRes += e * e; const d = ys[i] - mean; ssTot += d * d; }
    return ssTot > 0 ? 1 - ssRes / ssTot : (ssRes < 1e-12 ? 1 : 0);
  }

  // Arrondi a `sig` chiffres significatifs (pour une equation lisible).
  function sig(v, n) {
    if (!isFinite(v) || v === 0) return 0;
    const d = Math.ceil(Math.log10(Math.abs(v)));
    const p = (n || 4) - d;
    const f = Math.pow(10, p);
    return Math.round(v * f) / f;
  }
  const SUP = { 2: "²", 3: "³" };
  function xpow(k) { return k === 0 ? "" : k === 1 ? "x" : "x" + (SUP[k] || ("^" + k)); }

  // "y = 2 + 3 x - x²" — omet les coefficients ~0, signe correct, |coeff|=1 implicite.
  function formatEquation(coeffs, opts) {
    opts = opts || {};
    const nsig = opts.sig || 4;
    let out = "y = ", first = true, any = false;
    for (let k = coeffs.length - 1; k >= 0; k--) {
      const a = sig(coeffs[k], nsig);
      if (a === 0) continue;
      any = true;
      const mag = Math.abs(a);
      const sign = a < 0 ? "-" : "+";
      const coefStr = (mag === 1 && k > 0) ? "" : String(mag);
      const mul = (coefStr && k > 0) ? " " : "";
      const term = coefStr + mul + xpow(k);
      if (first) { out += (a < 0 ? "-" : "") + term; first = false; }
      else out += " " + sign + " " + term;
    }
    if (!any) out += "0";
    return out;
  }

  // ----- Modeles non lineaires (gaussienne, exp, sinus, puissance, log…) -----
  // Ajustement par Levenberg-Marquardt avec jacobien numerique. Robuste mais
  // sensible aux valeurs initiales -> chaque modele fournit un init depuis les
  // donnees. Echec de convergence -> renvoie null (la selection auto retombe sur
  // le polynome, qui converge toujours).
  function num(v) { return String(sig(v, 6)); }
  function mean(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
  function minA(a) { return Math.min.apply(null, a); }
  function maxA(a) { return Math.max.apply(null, a); }
  function argmax(a) { let bi = 0; for (let i = 1; i < a.length; i++) if (a[i] > a[bi]) bi = i; return bi; }

  const MODELS = {
    exp: {
      id: "exp", label: "Exponentielle", np: 3,
      valid: function () { return true; },
      init: function (xs, ys) { const c = minA(ys); const rng = (maxA(xs) - minA(xs)) || 1; return [(maxA(ys) - c) || 1, 1 / rng, c]; },
      f: function (p, x) { return p[0] * Math.exp(p[1] * x) + p[2]; },
      eq: function (p) { return "y = " + num(p[0]) + "·e^(" + num(p[1]) + "x) + " + num(p[2]); },
      code: function (p, x) { return num(p[0]) + "*np.exp(" + num(p[1]) + "*" + x + ") + " + num(p[2]); }
    },
    gauss: {
      id: "gauss", label: "Gaussienne", np: 4,
      valid: function () { return true; },
      init: function (xs, ys) { const c = minA(ys); return [(maxA(ys) - c) || 1, xs[argmax(ys)], ((maxA(xs) - minA(xs)) / 6) || 1, c]; },
      f: function (p, x) { const s = p[2] || 1e-9; return p[0] * Math.exp(-((x - p[1]) * (x - p[1])) / (2 * s * s)) + p[3]; },
      eq: function (p) { return "y = " + num(p[0]) + "·exp(−(x−" + num(p[1]) + ")²/(2·" + num(p[2]) + "²)) + " + num(p[3]); },
      code: function (p, x) { return num(p[0]) + "*np.exp(-((" + x + "-" + num(p[1]) + ")**2)/(2*" + num(p[2]) + "**2)) + " + num(p[3]); }
    },
    sine: {
      id: "sine", label: "Sinusoïde", np: 4,
      valid: function () { return true; },
      init: function (xs, ys) {
        const d = mean(ys), a = (maxA(ys) - minA(ys)) / 2 || 1;
        let cross = 0; for (let i = 1; i < ys.length; i++) if ((ys[i] - d >= 0) !== (ys[i - 1] - d >= 0)) cross++;
        const rng = (maxA(xs) - minA(xs)) || 1;
        const b = cross > 0 ? Math.PI * cross / rng : 2 * Math.PI / rng;
        return [a, b, 0, d];
      },
      f: function (p, x) { return p[0] * Math.sin(p[1] * x + p[2]) + p[3]; },
      eq: function (p) { return "y = " + num(p[0]) + "·sin(" + num(p[1]) + "x + " + num(p[2]) + ") + " + num(p[3]); },
      code: function (p, x) { return num(p[0]) + "*np.sin(" + num(p[1]) + "*" + x + " + " + num(p[2]) + ") + " + num(p[3]); }
    },
    power: {
      id: "power", label: "Loi de puissance", np: 2,
      valid: function (xs) { return xs.every(function (x) { return x > 0; }); },
      init: function (xs, ys) { const i = Math.floor(xs.length / 2); return [ys[i] / Math.pow(xs[i] || 1, 1) || 1, 1]; },
      f: function (p, x) { return p[0] * Math.pow(x, p[1]); },
      eq: function (p) { return "y = " + num(p[0]) + "·x^" + num(p[1]); },
      code: function (p, x) { return num(p[0]) + "*" + x + "**" + num(p[1]); }
    },
    log: {
      id: "log", label: "Logarithme", np: 2,
      valid: function (xs) { return xs.every(function (x) { return x > 0; }); },
      init: function (xs, ys) { return [1, mean(ys)]; },
      f: function (p, x) { return p[0] * Math.log(x) + p[1]; },
      eq: function (p) { return "y = " + num(p[0]) + "·ln(x) + " + num(p[1]); },
      code: function (p, x) { return num(p[0]) + "*np.log(" + x + ") + " + num(p[1]); }
    },
    logistic: {
      id: "logistic", label: "Logistique", np: 4,
      valid: function () { return true; },
      init: function (xs, ys) { const c = minA(ys); return [(maxA(ys) - c) || 1, 1, mean(xs), c]; },
      f: function (p, x) { return p[0] / (1 + Math.exp(-p[1] * (x - p[2]))) + p[3]; },
      eq: function (p) { return "y = " + num(p[0]) + "/(1+e^(−" + num(p[1]) + "(x−" + num(p[2]) + "))) + " + num(p[3]); },
      code: function (p, x) { return num(p[0]) + "/(1+np.exp(-" + num(p[1]) + "*(" + x + "-" + num(p[2]) + "))) + " + num(p[3]); }
    }
  };

  function r2of(xs, ys, predict) {
    const n = xs.length; let m = 0; for (let i = 0; i < n; i++) m += ys[i]; m /= n;
    let ssTot = 0, ssRes = 0;
    for (let i = 0; i < n; i++) { const e = ys[i] - predict(xs[i]); ssRes += e * e; const d = ys[i] - m; ssTot += d * d; }
    return { r2: ssTot > 0 ? 1 - ssRes / ssTot : (ssRes < 1e-12 ? 1 : 0), ssRes: ssRes, ssTot: ssTot };
  }

  function lmFit(xs, ys, model) {
    if (model.valid && !model.valid(xs)) return null;
    let p = model.init(xs, ys);
    if (!p || p.some(function (v) { return !isFinite(v); })) return null;
    const n = xs.length, m = p.length, f = model.f;
    function sse(pp) { let s = 0; for (let i = 0; i < n; i++) { const e = ys[i] - f(pp, xs[i]); s += e * e; } return s; }
    let cur = sse(p); if (!isFinite(cur)) return null;
    let lambda = 1e-2;
    for (let it = 0; it < 300; it++) {
      const f0 = xs.map(function (x) { return f(p, x); });
      const r = []; for (let i = 0; i < n; i++) r.push(ys[i] - f0[i]);
      const J = []; for (let i = 0; i < n; i++) J.push(new Array(m));
      let ok = true;
      for (let j = 0; j < m; j++) {
        const h = Math.max(1e-7, Math.abs(p[j]) * 1e-6), pj = p.slice(); pj[j] += h;
        for (let i = 0; i < n; i++) { const d = (f(pj, xs[i]) - f0[i]) / h; if (!isFinite(d)) ok = false; J[i][j] = d; }
      }
      if (!ok) break;
      const JtJ = []; for (let a = 0; a < m; a++) JtJ.push(new Array(m).fill(0));
      const Jtr = new Array(m).fill(0);
      for (let i = 0; i < n; i++) for (let a = 0; a < m; a++) { Jtr[a] += J[i][a] * r[i]; for (let b = 0; b < m; b++) JtJ[a][b] += J[i][a] * J[i][b]; }
      let improved = false;
      for (let tries = 0; tries < 10; tries++) {
        const A = JtJ.map(function (row, a) { return row.map(function (v, b) { return a === b ? v * (1 + lambda) : v; }); });
        const dp = solveLinear(A, Jtr);
        if (!dp) { lambda *= 10; continue; }
        const pn = p.map(function (v, i) { return v + dp[i]; });
        const sn = sse(pn);
        if (isFinite(sn) && sn < cur) { p = pn; cur = sn; lambda = Math.max(1e-9, lambda / 3); improved = true; break; }
        lambda *= 4;
      }
      if (!improved || lambda > 1e10) break;
    }
    const rr = r2of(xs, ys, function (x) { return f(p, x); });
    return {
      kind: "model", modelId: model.id, label: model.label, params: p, nparams: m,
      r2: rr.r2, ssRes: rr.ssRes, ssTot: rr.ssTot,
      predict: function (x) { return f(p, x); }, equation: model.eq(p),
      codeExpr: function (xv) { return model.code(p, xv || "x"); }
    };
  }

  function fitModel(xs, ys, modelId) {
    const m = MODELS[modelId]; if (!m) return null;
    return lmFit(xs, ys, m);
  }

  // Unifie un resultat polyfit dans la meme interface que les modeles.
  function unifyPoly(f) {
    const hi = f.coeffs.slice().reverse(); // np.polyval attend du degre haut -> bas
    f.kind = "poly"; f.modelId = "poly"; f.label = "Polynôme deg " + f.degree;
    f.nparams = f.degree + 1;
    f.codeExpr = function (xv) { return "np.polyval([" + hi.map(num).join(", ") + "], " + (xv || "x") + ")"; };
    return f;
  }

  // Choisit le MEILLEUR modele toutes familles confondues (polynome + modeles
  // nommes) par critere BIC. Renvoie l'objet gagnant (interface unifiee).
  function bestModel(xs, ys, opts) {
    opts = opts || {};
    if (!xs || xs.length < 3) { const p = polyfit(xs, ys, 1); return p ? unifyPoly(p) : null; }
    const n = xs.length;
    const cands = [];
    const poly = bestPolyfit(xs, ys, opts); if (poly) cands.push(unifyPoly(poly));
    Object.keys(MODELS).forEach(function (id) {
      const r = lmFit(xs, ys, MODELS[id]);
      if (r && isFinite(r.r2) && r.r2 > 0) cands.push(r);
    });
    let mn = 0; for (let i = 0; i < n; i++) mn += ys[i]; mn /= n;
    let ssTot = 0; for (let i = 0; i < n; i++) { const d = ys[i] - mn; ssTot += d * d; }
    const eps = Math.max(1e-300, 1e-12 * (ssTot || 1));
    let best = null, bb = Infinity;
    cands.forEach(function (c) {
      let ssRes = c.ssRes != null ? c.ssRes : (1 - c.r2) * ssTot;
      if (ssRes < eps) ssRes = eps;
      const bic = n * Math.log(ssRes / n) + (c.nparams || 2) * Math.log(n);
      if (bic < bb - 1e-9) { bb = bic; best = c; }
    });
    return best;
  }

  // Echantillonne la courbe ajustee en `n` points sur [x0,x1] -> [{x,y}].
  function sampleCurve(fit, x0, x1, n) {
    n = Math.max(2, n || 200);
    const out = [];
    for (let i = 0; i < n; i++) {
      const x = x0 + (x1 - x0) * i / (n - 1);
      out.push({ x: x, y: fit.predict(x) });
    }
    return out;
  }

  return {
    polyfit: polyfit,
    bestPolyfit: bestPolyfit,
    fitModel: fitModel,
    bestModel: bestModel,
    unifyPoly: unifyPoly,
    MODEL_IDS: Object.keys(MODELS),
    polyval: polyval,
    rSquared: rSquared,
    formatEquation: formatEquation,
    sampleCurve: sampleCurve
  };
});
