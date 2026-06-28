// Evalue la digitalisation (chemin AUTO) sur le corpus synthetique et produit un
// rapport HTML avant/apres + un score par figure. Lancer :
//   node test/digit_eval/gen_corpus.py   (genere corpus + verite terrain)
//   node test/digit_eval/run_eval.js     (ecrit test/digit_eval/report.html)
"use strict";
const fs = require("fs");
const path = require("path");
const { decodePng } = require("./png_decode.js");
const CD = require("../../media/curve_digitize.js");

const DIR = __dirname;
const CORPUS = path.join(DIR, "corpus");

function frac(v, lo, hi, log) {
  if (log) { const l0 = Math.log10(lo), l1 = Math.log10(hi); return (Math.log10(v) - l0) / (l1 - l0); }
  return (v - lo) / (hi - lo);
}
function colorDist(a, b) { return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]); }

// "rugosite" = moyenne |2e difference| de y en fraction d'axe : capte l'aspect
// escalier / hesitant (eleve = saccade), independamment du suivi de la verite.
function roughness(pts, calib) {
  if (pts.length < 3) return 0;
  const fy = pts.map(p => frac(p.y, calib.ymin, calib.ymax, calib.ylog));
  let s = 0, n = 0;
  for (let i = 1; i < fy.length - 1; i++) { s += Math.abs(fy[i + 1] - 2 * fy[i] + fy[i - 1]); n++; }
  return n ? s / n : 0;
}

// interpole y extrait (coords data) a une abscisse x donnee
function interpAt(pts, x) {
  if (!pts.length) return null;
  if (x <= pts[0].x) return pts[0].y;
  if (x >= pts[pts.length - 1].x) return pts[pts.length - 1].y;
  for (let i = 1; i < pts.length; i++) if (x <= pts[i].x) {
    const t = (x - pts[i - 1].x) / (pts[i].x - pts[i - 1].x);
    return pts[i - 1].y + t * (pts[i].y - pts[i - 1].y);
  }
  return pts[pts.length - 1].y;
}

function evalFigure(meta) {
  const png = path.join(CORPUS, meta.name + ".png");
  const img = decodePng(png);
  const box = CD.detectPlotBox(img);
  const res = { name: meta.name, box: box, extracted: [], perTruth: [], verdict: "BAD", note: "" };
  if (!box) { res.note = "boite non detectee"; return res; }
  const calib = { xmin: meta.xlim[0], xmax: meta.xlim[1], ymin: meta.ylim[0], ymax: meta.ylim[1], xlog: meta.xlog, ylog: meta.ylog };
  const clusters = CD.clusterCurveColors(img, box);
  const curves = CD.extractCurves(clusters, box);
  // MEME pipeline que le panneau (digFinalize) : pontage -> Savitzky-Golay -> decimation,
  // sinon le rapport montre l'extraction brute en escalier (pas ce que voit l'utilisateur).
  res.extracted = curves.map(function (c) {
    let pix = c.points;
    if (c.style !== "markers") pix = CD.decimate(CD.savgolSmooth(CD.bridgeGaps(c.points, { maxGap: 30 }), { window: 21 }), { maxPoints: 300 });
    return { color: c.color, style: c.style, pts: CD.pixelsToData(pix, box, calib) };
  });

  let worst = 0, anyMissed = false, anyTrunc = false;
  meta.curves.forEach(function (tc) {
    // verite terrain en coords data, sous-echantillonnee pour le trace
    const tx = tc.x, ty = tc.y;
    // match par couleur
    let best = null, bd = Infinity;
    res.extracted.forEach(function (e) { const d = colorDist(e.color, tc.color); if (d < bd) { bd = d; best = e; } });
    const entry = { color: tc.color, style: tc.style, matched: !!best && bd < 160, colorDist: bd, coverage: 0, medErr: 1, styleOk: false };
    if (entry.matched) {
      const exs = best.pts.slice().sort(function (a, b) { return a.x - b.x; });
      const exLo = exs[0].x, exHi = exs[exs.length - 1].x;
      // couverture en x (fraction de la plage verite couverte)
      let inside = 0;
      const errs = [];
      for (let i = 0; i < tx.length; i++) {
        if (tx[i] >= exLo && tx[i] <= exHi) {
          inside++;
          const ye = interpAt(exs, tx[i]);
          if (ye != null) errs.push(Math.abs(frac(ye, calib.ymin, calib.ymax, calib.ylog) - frac(ty[i], calib.ymin, calib.ymax, calib.ylog)));
        }
      }
      entry.coverage = inside / tx.length;
      errs.sort(function (a, b) { return a - b; });
      entry.medErr = errs.length ? errs[errs.length >> 1] : 1;
      entry.styleOk = best.style === tc.style;
    } else anyMissed = true;
    if (entry.coverage < 0.8) anyTrunc = true;
    worst = Math.max(worst, entry.matched ? entry.medErr : 1);
    res.perTruth.push(entry);
  });

  res.extra = res.extracted.length - meta.curves.length; // courbes en trop (grille/legende/bruit)
  res.rough = res.extracted.reduce((m, e) => e.style === "markers" ? m : Math.max(m, roughness(e.pts, calib)), 0);
  if (anyMissed) res.verdict = "BAD";
  else if (anyTrunc || worst > 0.05 || res.extra > 0 || res.rough > 0.01) res.verdict = "MEDIUM";
  else if (worst > 0.02 || res.rough > 0.004) res.verdict = "MEDIUM";
  else res.verdict = "GOOD";
  res.worstErr = worst;
  return res;
}

// --- run ---
const metas = fs.readdirSync(CORPUS).filter(f => f.endsWith(".json"))
  .map(f => JSON.parse(fs.readFileSync(path.join(CORPUS, f), "utf8")));
const results = metas.map(evalFigure);

// console summary
const order = { BAD: 0, MEDIUM: 1, GOOD: 2 };
results.sort((a, b) => order[a.verdict] - order[b.verdict] || b.worstErr - a.worstErr);
console.log("\n=== Digitalisation — eval AUTO (" + results.length + " figures) ===");
results.forEach(function (r) {
  console.log(
    r.verdict.padEnd(7) + r.name.padEnd(24) +
    " err=" + (r.worstErr != null ? r.worstErr.toFixed(3) : "?") +
    " rough=" + (r.rough != null ? r.rough.toFixed(4) : "?") +
    " extra=" + (r.extra != null ? r.extra : "?") +
    (r.note ? " (" + r.note + ")" : "") +
    " | " + r.perTruth.map(t => (t.matched ? "cov" + t.coverage.toFixed(2) + (t.styleOk ? "" : "/style!") : "MISS")).join(" ")
  );
});
const counts = { GOOD: 0, MEDIUM: 0, BAD: 0 };
results.forEach(r => counts[r.verdict]++);
console.log("\nbilan : GOOD " + counts.GOOD + " / MEDIUM " + counts.MEDIUM + " / BAD " + counts.BAD);

// --- HTML report ---
function b64(file) { return fs.readFileSync(file).toString("base64"); }
const BADGE = { GOOD: "#2ca02c", MEDIUM: "#e6a000", BAD: "#d62728" };
const figSpecs = [];
let rows = "";
results.forEach(function (r, idx) {
  const divId = "plt" + idx;
  const meta = metas.find(m => m.name === r.name);
  const traces = [];
  // verite terrain (gris pointille)
  meta.curves.forEach(function (tc, i) {
    traces.push({ x: tc.x, y: tc.y, mode: "lines", line: { color: "rgba(120,120,120,0.55)", dash: "dot", width: 1.5 }, name: i === 0 ? "verite" : "verite", showlegend: i === 0 });
  });
  // extrait (couleur pleine)
  r.extracted.forEach(function (e, i) {
    traces.push({
      x: e.pts.map(p => p.x), y: e.pts.map(p => p.y),
      mode: e.style === "markers" ? "markers" : "lines",
      line: { color: "rgb(" + e.color.join(",") + ")", width: 2 },
      marker: { color: "rgb(" + e.color.join(",") + ")", size: 4 },
      name: i === 0 ? "extrait" : "extrait", showlegend: i === 0
    });
  });
  const layout = { margin: { l: 40, r: 10, t: 10, b: 30 }, xaxis: {}, yaxis: {}, legend: { orientation: "h" }, height: 300 };
  if (meta.xlog) layout.xaxis.type = "log";
  if (meta.ylog) layout.yaxis.type = "log";
  figSpecs.push({ id: divId, data: traces, layout: layout });
  const detail = r.perTruth.map(t => t.matched
    ? ("couv " + (t.coverage * 100).toFixed(0) + "%, err " + (t.medErr * 100).toFixed(1) + "%, style " + (t.styleOk ? "ok" : "FAUX"))
    : ("<b style='color:#d62728'>MANQUEE</b> (dist couleur " + t.colorDist + ")")).join("<br>");
  rows += `<div class="card">
    <div class="head"><span class="badge" style="background:${BADGE[r.verdict]}">${r.verdict}</span>
      <b>${r.name}</b> &nbsp; <span class="muted">extra: ${r.extra}, pire err: ${(r.worstErr * 100).toFixed(1)}%, rugosite: ${(r.rough * 1000).toFixed(1)}‰ ${r.note ? "— " + r.note : ""}</span></div>
    <div class="pair">
      <div class="col"><div class="lbl">AVANT (source)</div><img src="data:image/png;base64,${b64(path.join(CORPUS, r.name + ".png"))}"></div>
      <div class="col"><div class="lbl">APRES (reconstruit · gris=verite)</div><div id="${divId}" class="plot"></div></div>
    </div>
    <div class="detail">${detail}</div>
  </div>`;
});

const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Digitalisation — eval</title>
<script src="../../media/plotly.min.js"></script>
<style>
body{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:18px;background:#fafafa;color:#222}
h1{font-size:20px} .sum{margin:8px 0 18px;font-size:14px}
.card{background:#fff;border:1px solid #e2e2e2;border-radius:8px;padding:12px;margin:14px 0}
.head{margin-bottom:8px} .muted{color:#777;font-size:13px}
.badge{color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:bold;margin-right:6px}
.pair{display:flex;gap:14px;flex-wrap:wrap} .col{flex:1;min-width:340px}
.lbl{font-size:12px;color:#777;margin-bottom:4px} img{max-width:100%;border:1px solid #eee}
.plot{width:100%} .detail{margin-top:8px;font-size:13px;color:#444}
</style></head><body>
<h1>Digitalisation — évaluation du chemin AUTO</h1>
<div class="sum">GOOD ${counts.GOOD} · MEDIUM ${counts.MEDIUM} · BAD ${counts.BAD} — triées des pires aux meilleures. Gris pointillé = vérité terrain, couleur = extrait.</div>
${rows}
<script>
const SPECS = ${JSON.stringify(figSpecs)};
SPECS.forEach(s => Plotly.newPlot(s.id, s.data, s.layout, {displayModeBar:false, responsive:true}));
</script>
</body></html>`;
fs.writeFileSync(path.join(DIR, "report.html"), html);
console.log("\nrapport : " + path.join(DIR, "report.html"));
