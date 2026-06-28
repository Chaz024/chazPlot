// ============================================================
// replace_policy.js — politique de remplacement « live update »
// ============================================================
// Decide si une figure entrant dans addFigure() doit remplacer une figure
// deja en memoire plutot qu'etre ajoutee en pile. Opt-in (setting
// `chazPlots.replaceOnSameProvenance`, defaut false). Quand ce module dit
// "remplace", extension.js mute la cible en place : id, tags, ts, provenance
// sont preserves ; contenu (plotly/png/svg/pdf/gif/mp4/frames/render) est
// rafraichi.
//
// Politique de match :
//   - cle = provenance.source + provenance.line (script + ligne du plt.show()).
//   - match = meme cle + meme titre.
//   - Exige un titre EXPLICITE (non default matplotlib /^\s*Figure\s+\d+\s*$/).
//     Sans cela, deux scripts distincts donnant tous deux "Figure 1" se
//     collisionneraient, et une boucle `for sans plt.title` ne produirait
//     qu'une seule carte.
//
// Pieges documentes :
//   - Boucle parametrique `for p in [...]: plt.show()` SANS plt.title : la
//     detection ci-dessous rejette ces matches ; pour une etude
//     parametrique, laissez le setting OFF (defaut) et/ou ajoutez
//     plt.title(f"p={p}") a chaque plt.show().
//   - Deux appels produisent le meme titre explicite par accident : match
//     par cle legere difference (script different ou meme script, ligne
//     differente). Logiquement OK.
//   - Fonction pure : pas d'I/O, testable sous node.
// ============================================================
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  else { root.ReplacePolicy = api; }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Cle stable de provenance : "fichier#ligne". Renvoie null si la provenance
  // est incomplete (necessaire a l'identification : pas de ligne => pas de
  // cle => on empile comme avant).
  function provenanceKey(prov) {
    if (!prov || typeof prov !== "object") return null;
    const src = (typeof prov.source === "string") ? prov.source : null;
    const ln = Number(prov.line);
    if (!src || !isFinite(ln) || ln <= 0) return null;
    return src + "#" + String(ln);
  }

  // Reconnaît un titre par defaut (matplotlib attribue "Figure 1", "Figure 2",
  // ... quand pas de plt.title explicite). On refuse ces titres-la en
  // remplacement pour eviter les collisions entre scripts et dans les
  // boucles sans plt.title.
  function isDefaultTitle(s) {
    return typeof s === "string" && /^\s*Figure\s+\d+\s*$/.test(s);
  }

  // Signature stable du CONTENU rendu (plotly/svg/png/frames), ignorant
  // titre/ts/tags/provenance/render. Sert a deduppliquer les re-runs identiques :
  // meme code deterministe -> meme rendu -> meme signature. Hash djb2 (court,
  // suffisant ; collisions improbables et sans danger ici).
  function contentSignature(fig) {
    if (!fig || typeof fig !== "object") return "0";
    const parts = [];
    if (fig.plotly && typeof fig.plotly === "object") parts.push("P" + JSON.stringify(fig.plotly));
    if (typeof fig.svg === "string") parts.push("S" + fig.svg);
    if (typeof fig.png === "string") parts.push("N" + fig.png);
    if (Array.isArray(fig.frames)) parts.push("F" + fig.frames.length + ":" + fig.frames.join("|"));
    const str = parts.join("");
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return parts.length + "_" + (h >>> 0).toString(36) + "_" + str.length;
  }

  // Dedup "re-run identique" (signature contenu = option (a)) : renvoie la figure
  // existante de MEME provenance (script+ligne) ET MEME contenu, sinon null. Un
  // parametre qui change le rendu -> signature differente -> pas de match -> on
  // empile une nouvelle carte (preserve la comparaison/superposition). Exige une
  // provenance exploitable (sinon on empile, comportement historique).
  function findDedupTarget(figures, incoming) {
    if (!Array.isArray(figures) || !incoming) return null;
    const incKey = provenanceKey(incoming.provenance);
    if (!incKey) return null;
    const incSig = contentSignature(incoming);
    for (let i = 0; i < figures.length; i++) {
      const f = figures[i];
      if (provenanceKey(f.provenance) === incKey && contentSignature(f) === incSig) return f;
    }
    return null;
  }

  // Si une figure deja connue matche (incoming), renvoie-la ; sinon null.
  // Politique : on n'active le remplacement que si l'utilisateur a fourni un
  // TITRE EXPLICITE (donc pas default matplotlib). Sans cela, deux scripts
  // distincts (ou deux iterations d'une boucle sans plt.title) portant
  // `"Figure 1"` se collisionneraient. Opt-in par setting : l'activation
  // reste un acte délibere.
  function findReplaceTarget(figures, incoming) {
    if (!Array.isArray(figures) || !incoming) return null;
    const incKey = provenanceKey(incoming.provenance);
    if (!incKey) return null;
    const incTitle = (typeof incoming.title === "string") ? incoming.title : "";
    // Pas de titre, ou titre par defaut -> on n'active pas le remplacement.
    if (!incTitle || isDefaultTitle(incTitle)) return null;
    for (let i = 0; i < figures.length; i++) {
      const f = figures[i];
      if (provenanceKey(f.provenance) === incKey && f.title === incTitle) return f;
    }
    return null;
  }

  // Type-safe merge : recopie les champs fraichement arrives dans target.
  // id, tags, ts et provenance (cle d'identite) sont preserves cote appelant;
  // ici on mute seulement le contenu rafraichissable.
  function mergeReplace(target, incoming) {
    if (!target || !incoming) return target;
    if (incoming.plotly && typeof incoming.plotly === "object") target.plotly = incoming.plotly;
    else target.plotly = null;
    if (typeof incoming.svg === "string") target.svg = incoming.svg;
    else target.svg = null;
    if (typeof incoming.png === "string") target.png = incoming.png;
    else target.png = null;
    if (typeof incoming.pdf === "string") target.pdf = incoming.pdf;
    else target.pdf = null;
    if (typeof incoming.gif === "string") target.gif = incoming.gif;
    else target.gif = null;
    if (typeof incoming.mp4 === "string") target.mp4 = incoming.mp4;
    else target.mp4 = null;
    if (Array.isArray(incoming.frames) && incoming.frames.length) {
      target.frames = incoming.frames;
      target.interval = Number(incoming.interval) || 100;
    } else {
      target.frames = null;
      target.interval = null;
    }
    if (incoming.render && typeof incoming.render === "object") target.render = incoming.render;
    else target.render = null;
    target.sciencePlot = incoming.sciencePlot === true;
    if (incoming.provenance && typeof incoming.provenance === "object") target.provenance = incoming.provenance;
    target.edited = false;
    return target;
  }

  return {
    provenanceKey: provenanceKey,
    isDefaultTitle: isDefaultTitle,
    contentSignature: contentSignature,
    findDedupTarget: findDedupTarget,
    findReplaceTarget: findReplaceTarget,
    mergeReplace: mergeReplace,
  };
});
