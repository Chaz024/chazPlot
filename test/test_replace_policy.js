// ============================================================
// Tests purs pour media/replace_policy.js
// Lance : node test/test_replace_policy.js
// ============================================================
"use strict";
const assert = require("assert");
const ReplacePolicy = require("../media/replace_policy.js");

let passed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log("ok   - " + name); }
  catch (e) { console.error("FAIL - " + name + " : " + e.message); process.exitCode = 1; }
}

// ----------------------------- dedup contenu identique -----------------------------

check("contentSignature: ignore titre/ts/tags/provenance, depend du rendu", function () {
  const a = { title: "X", ts: "10:00", tags: ["a"], provenance: { source: "/a.py", line: 1 }, plotly: { data: [{ x: [1, 2], y: [3, 4] }] } };
  const b = { title: "Y", ts: "11:30", tags: [], provenance: { source: "/b.py", line: 9 }, plotly: { data: [{ x: [1, 2], y: [3, 4] }] } };
  const c = { title: "X", plotly: { data: [{ x: [1, 2], y: [3, 9] }] } };
  assert.strictEqual(ReplacePolicy.contentSignature(a), ReplacePolicy.contentSignature(b), "meme rendu -> meme signature");
  assert.notStrictEqual(ReplacePolicy.contentSignature(a), ReplacePolicy.contentSignature(c), "rendu different -> signature differente");
});

check("findDedupTarget: re-run identique (meme provenance + meme contenu) -> match", function () {
  const figs = [{ id: 1, provenance: { source: "/a.py", line: 5 }, plotly: { data: [{ y: [1, 2, 3] }] } }];
  const incoming = { provenance: { source: "/a.py", line: 5 }, plotly: { data: [{ y: [1, 2, 3] }] } };
  assert.strictEqual(ReplacePolicy.findDedupTarget(figs, incoming), figs[0]);
});

check("findDedupTarget: contenu different (param change) -> pas de match (nouvelle carte)", function () {
  const figs = [{ id: 1, provenance: { source: "/a.py", line: 5 }, plotly: { data: [{ y: [1, 2, 3] }] } }];
  const incoming = { provenance: { source: "/a.py", line: 5 }, plotly: { data: [{ y: [1, 2, 9] }] } };
  assert.strictEqual(ReplacePolicy.findDedupTarget(figs, incoming), null);
});

check("findDedupTarget: meme contenu mais provenance differente -> pas de match", function () {
  const figs = [{ id: 1, provenance: { source: "/a.py", line: 5 }, plotly: { data: [{ y: [1] }] } }];
  const incoming = { provenance: { source: "/a.py", line: 6 }, plotly: { data: [{ y: [1] }] } };
  assert.strictEqual(ReplacePolicy.findDedupTarget(figs, incoming), null);
});

check("findDedupTarget: sans provenance exploitable -> pas de dedup (empile)", function () {
  const figs = [{ id: 1, provenance: null, plotly: { data: [{ y: [1] }] } }];
  const incoming = { provenance: null, plotly: { data: [{ y: [1] }] } };
  assert.strictEqual(ReplacePolicy.findDedupTarget(figs, incoming), null);
});

// ----------------------------- provenanceKey -----------------------------

check("provenanceKey: cle = source + line", function () {
  assert.strictEqual(ReplacePolicy.provenanceKey({ source: "/a.py", line: 12 }), "/a.py#12");
  assert.strictEqual(ReplacePolicy.provenanceKey({ source: "b", line: "5" }), "b#5");
});

check("provenanceKey: null si line <= 0, absent ou NaN", function () {
  assert.strictEqual(ReplacePolicy.provenanceKey({ source: "/a.py", line: 0 }), null);
  assert.strictEqual(ReplacePolicy.provenanceKey({ source: "/a.py", line: -3 }), null);
  assert.strictEqual(ReplacePolicy.provenanceKey({ source: "/a.py" }), null);
  assert.strictEqual(ReplacePolicy.provenanceKey({ source: "/a.py", line: "abc" }), null);
});

check("provenanceKey: null si entree invalide", function () {
  assert.strictEqual(ReplacePolicy.provenanceKey(null), null);
  assert.strictEqual(ReplacePolicy.provenanceKey(undefined), null);
  assert.strictEqual(ReplacePolicy.provenanceKey({}), null);
});

// ----------------------------- isDefaultTitle -----------------------------

check("isDefaultTitle: 'Figure 1', 'Figure 12', ' Figure 3 ' -> true", function () {
  assert.strictEqual(ReplacePolicy.isDefaultTitle("Figure 1"), true);
  assert.strictEqual(ReplacePolicy.isDefaultTitle("Figure 12"), true);
  assert.strictEqual(ReplacePolicy.isDefaultTitle(" Figure 3 "), true);
  assert.strictEqual(ReplacePolicy.isDefaultTitle("Figure  7"), true);
});

check("isDefaultTitle: titre explicite -> false", function () {
  assert.strictEqual(ReplacePolicy.isDefaultTitle("Graphe"), false);
  assert.strictEqual(ReplacePolicy.isDefaultTitle("damping=0.05"), false);
  assert.strictEqual(ReplacePolicy.isDefaultTitle("Figure alpha"), false);
  assert.strictEqual(ReplacePolicy.isDefaultTitle(""), false);
});

check("isDefaultTitle: non-string -> false", function () {
  assert.strictEqual(ReplacePolicy.isDefaultTitle(null), false);
  assert.strictEqual(ReplacePolicy.isDefaultTitle(123), false);
  assert.strictEqual(ReplacePolicy.isDefaultTitle(undefined), false);
});

// ----------------------------- findReplaceTarget (avec exclusion default title) -----------------------------

check("findReplaceTarget: match meme provenance + titre explicite", function () {
  const figures = [
    { id: 1, title: "fig1", provenance: { source: "/a.py", line: 5 } },
    { id: 2, title: "fig2", provenance: { source: "/a.py", line: 10 } }
  ];
  const found = ReplacePolicy.findReplaceTarget(figures, {
    title: "fig1", provenance: { source: "/a.py", line: 5 }
  });
  assert.ok(found && found.id === 1);
});

check("findReplaceTarget: PAS de match si titre default 'Figure 1'", function () {
  const figures = [{ id: 1, title: "Figure 1", provenance: { source: "/a.py", line: 5 } }];
  const found = ReplacePolicy.findReplaceTarget(figures, {
    title: "Figure 1", provenance: { source: "/a.py", line: 5 }
  });
  assert.strictEqual(found, null, "titre par defaut -> on n'active pas le replace (anti-collision)");
});

check("findReplaceTarget: PAS de match si titre vide", function () {
  const figures = [{ id: 1, title: "Graphe", provenance: { source: "/a.py", line: 5 } }];
  const found = ReplacePolicy.findReplaceTarget(figures, {
    title: "", provenance: { source: "/a.py", line: 5 }
  });
  assert.strictEqual(found, null, "titre vide -> on n'active pas le replace");
});

check("findReplaceTarget: pas de match si titre different", function () {
  const figures = [{ id: 1, title: "fig1", provenance: { source: "/a.py", line: 5 } }];
  const found = ReplacePolicy.findReplaceTarget(figures, {
    title: "different", provenance: { source: "/a.py", line: 5 }
  });
  assert.strictEqual(found, null);
});

check("findReplaceTarget: pas de match si ligne differente", function () {
  const figures = [{ id: 1, title: "fig1", provenance: { source: "/a.py", line: 5 } }];
  const found = ReplacePolicy.findReplaceTarget(figures, {
    title: "fig1", provenance: { source: "/a.py", line: 6 }
  });
  assert.strictEqual(found, null);
});

check("findReplaceTarget: pas de match si script different", function () {
  const figures = [{ id: 1, title: "fig1", provenance: { source: "/a.py", line: 5 } }];
  const found = ReplacePolicy.findReplaceTarget(figures, {
    title: "fig1", provenance: { source: "/b.py", line: 5 }
  });
  assert.strictEqual(found, null);
});

check("findReplaceTarget: FIFO en presence de doublons exacts", function () {
  const figures = [
    { id: 10, title: "t", provenance: { source: "/a.py", line: 5 } },
    { id: 11, title: "t", provenance: { source: "/a.py", line: 5 } }
  ];
  const found = ReplacePolicy.findReplaceTarget(figures, {
    title: "t", provenance: { source: "/a.py", line: 5 }
  });
  assert.strictEqual(found.id, 10);
});

check("findReplaceTarget: ignore les figures sans provenance exploitable", function () {
  const figures = [{ id: 1, title: "t", provenance: null }];
  const found = ReplacePolicy.findReplaceTarget(figures, {
    title: "t", provenance: { source: "/a.py", line: 5 }
  });
  assert.strictEqual(found, null);
});

// ----------------------------- mergeReplace -----------------------------

check("mergeReplace: garde id, tags, ts ; remplace le contenu", function () {
  const target = {
    id: 7, title: "fig1", tags: ["a", "b"], ts: "12:00:00",
    plotly: null, svg: null, png: null, pdf: null, gif: null, mp4: null,
    frames: null, interval: null, render: null, provenance: { source: "/x.py", line: 1 }, edited: true
  };
  const incoming = {
    plotly: { data: [{ x: [1, 2, 3] }] },
    png: "img-b64",
    pdf: "pdf-b64",
    render: { mode: "plotly" },
    sciencePlot: false,
    provenance: { source: "/a.py", line: 5, git_commit: "abc" }
  };
  ReplacePolicy.mergeReplace(target, incoming);
  assert.strictEqual(target.id, 7);
  assert.deepStrictEqual(target.tags, ["a", "b"]);
  assert.strictEqual(target.ts, "12:00:00");
  assert.strictEqual(target.title, "fig1");
  assert.strictEqual(target.plotly, incoming.plotly);
  assert.strictEqual(target.png, "img-b64");
  assert.strictEqual(target.pdf, "pdf-b64");
  assert.strictEqual(target.provenance, incoming.provenance);
  assert.strictEqual(target.edited, false);
});

check("mergeReplace: animation -> frames/interval ; pas d'animation -> null", function () {
  const target = { id: 1, frames: null, interval: null };
  ReplacePolicy.mergeReplace(target, { frames: ["a", "b"], interval: 50 });
  assert.deepStrictEqual(target.frames, ["a", "b"]);
  assert.strictEqual(target.interval, 50);
  ReplacePolicy.mergeReplace(target, { frames: null });
  assert.strictEqual(target.frames, null);
  assert.strictEqual(target.interval, null);
});

check("mergeReplace: contenu absent -> met a null proprement", function () {
  const target = { id: 1, png: "old", pdf: "old" };
  ReplacePolicy.mergeReplace(target, { png: undefined, pdf: null });
  assert.strictEqual(target.png, null);
  assert.strictEqual(target.pdf, null);
});

check("mergeReplace: retourne target (chainable)", function () {
  const target = { id: 1 };
  const ret = ReplacePolicy.mergeReplace(target, {});
  assert.strictEqual(ret, target);
});

console.log("\n" + passed + " tests OK");
