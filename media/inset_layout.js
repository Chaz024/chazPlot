// ============================================================
// inset_layout.js
// Placement du zoom-inset : generation de candidats, scoring,
// bornage. Fonctions pures (aucun acces Plotly/DOM, que des
// nombres en entree). Charge dans le webview (self.InsetLayout)
// et sous Node (require). Aucune dependance.
// ============================================================
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  else { root.InsetLayout = api; }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---- helpers geometriques purs ----
  function rectArea(rect) {
    if (!rect) { return 0; }
    return Math.max(0, rect.x1 - rect.x0) * Math.max(0, rect.y1 - rect.y0);
  }
  function rectOverlapArea(a, b) {
    if (!a || !b) { return 0; }
    const x = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
    const y = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
    return x * y;
  }
  // Valeur de donnee -> coordonnee paper, via la plage complete et le domaine.
  function valueToPaper(value, fullRange, domain) {
    if (!fullRange || fullRange[0] === fullRange[1]) { return null; }
    const t = (value - fullRange[0]) / (fullRange[1] - fullRange[0]);
    return domain[0] + t * (domain[1] - domain[0]);
  }

  // ---- generation des candidats ----
  // Grille fine : `steps` positions par axe (coins inclus). cornerKind = nombre
  // de bords du domaine touches (2 = vrai coin, 1 = bord, 0 = interieur).
  function makeInsetCandidates(xDomain, yDomain, opts) {
    opts = opts || {};
    const sizes = opts.sizes || [0.34, 0.29, 0.24, 0.20];
    const steps = opts.steps || 6;
    const dx = Math.max(0.1, xDomain[1] - xDomain[0]);
    const dy = Math.max(0.1, yDomain[1] - yDomain[0]);
    const eps = Math.min(dx, dy) * 0.02;
    const candidates = [];
    const seen = {};
    sizes.forEach(function (scale, sizeIndex) {
      const w = dx * scale;
      const h = dy * scale;
      const xMax = xDomain[1] - w;
      const yMax = yDomain[1] - h;
      if (xMax < xDomain[0] - 1e-9 || yMax < yDomain[0] - 1e-9) { return; }
      for (let i = 0; i < steps; i++) {
        const tx = steps === 1 ? 0 : i / (steps - 1);
        const x0 = xDomain[0] + tx * (xMax - xDomain[0]);
        for (let j = 0; j < steps; j++) {
          const ty = steps === 1 ? 0 : j / (steps - 1);
          const y0 = yDomain[0] + ty * (yMax - yDomain[0]);
          const x1 = x0 + w;
          const y1 = y0 + h;
          const key = [x0, x1, y0, y1].map(function (v) { return v.toFixed(4); }).join(":");
          if (seen[key]) { continue; }
          seen[key] = true;
          const touchesX = (x0 - xDomain[0] <= eps) || (xDomain[1] - x1 <= eps);
          const touchesY = (y0 - yDomain[0] <= eps) || (yDomain[1] - y1 <= eps);
          candidates.push({
            xDomain: [x0, x1], yDomain: [y0, y1],
            x0: x0, x1: x1, y0: y0, y1: y1,
            outerXDomain: xDomain.slice(), outerYDomain: yDomain.slice(),
            sizeIndex: sizeIndex,
            cornerKind: (touchesX ? 1 : 0) + (touchesY ? 1 : 0)
          });
        }
      }
    });
    return candidates;
  }

  // ---- scoring (a minimiser) ----
  // Priorites decroissantes : selection (jamais couverte) > occupation des
  // donnees > recouvrement d'annotations > coin naturel > taille.
  function scoreInsetCandidate(candidate, ctx) {
    const candidateArea = Math.max(rectArea(candidate), 1e-4);
    let score = 0;

    // 1. recouvrement de la selection : redhibitoire
    if (ctx.selectedPaper) {
      score += (rectOverlapArea(candidate, ctx.selectedPaper) / candidateArea) * 9000;
    }

    // 2. occupation : fraction des points echantillonnes dans le candidat
    let total = 0, inside = 0;
    const traces = ctx.traces || [];
    for (let t = 0; t < traces.length; t++) {
      const xs = traces[t].x || [], ys = traces[t].y || [];
      const count = Math.min(xs.length, ys.length);
      if (count === 0) { continue; }
      const step = Math.max(1, Math.floor(count / 2200));
      for (let i = 0; i < count; i += step) {
        const xv = xs[i], yv = ys[i];
        if (xv == null || yv == null || isNaN(xv) || isNaN(yv)) { continue; }
        const px = valueToPaper(xv, ctx.xFull, candidate.outerXDomain);
        const py = valueToPaper(yv, ctx.yFull, candidate.outerYDomain);
        if (px == null || py == null) { continue; }
        total++;
        if (px >= candidate.x0 && px <= candidate.x1 && py >= candidate.y0 && py <= candidate.y1) { inside++; }
      }
    }
    const occupancy = total > 0 ? inside / total : 0;
    score += occupancy * 1000;

    // 3. recouvrement d'annotations
    const rects = ctx.annotationRects || [];
    for (let r = 0; r < rects.length; r++) {
      const overlap = rectOverlapArea(candidate, rects[r]);
      if (overlap > 0) { score += 120 + (overlap / candidateArea) * 500; }
    }

    // 4. coin naturel : bonus negatif (coin < bord < centre)
    score += (2 - candidate.cornerKind) * 2;

    // 5. taille : a occupation egale, prefere le plus grand
    score += candidate.sizeIndex * 3;

    return score;
  }

  // ---- choix du meilleur candidat ----
  function chooseInsetDomain(ctx) {
    const xDomain = ctx.xDomain || [0.08, 0.96];
    const yDomain = ctx.yDomain || [0.12, 0.94];
    const candidates = makeInsetCandidates(xDomain, yDomain, ctx.options);
    if (candidates.length === 0) { return { xDomain: [0.62, 0.96], yDomain: [0.60, 0.94] }; }
    let best = candidates[0];
    let bestScore = scoreInsetCandidate(best, ctx);
    for (let i = 1; i < candidates.length; i++) {
      const s = scoreInsetCandidate(candidates[i], ctx);
      if (s < bestScore) { best = candidates[i]; bestScore = s; }
    }
    return { xDomain: best.xDomain, yDomain: best.yDomain };
  }

  // ---- bornage d'un placement manuel (drag/resize) ----
  // Rectangle paper -> placement borne au domaine principal, taille mini imposee.
  function clampPlacement(rect, xDomain, yDomain, minSize) {
    const ms = minSize == null ? 0.12 : minSize;
    const outW = xDomain[1] - xDomain[0];
    const outH = yDomain[1] - yDomain[0];
    const w = Math.min(Math.max(rect.x1 - rect.x0, ms), outW);
    const h = Math.min(Math.max(rect.y1 - rect.y0, ms), outH);
    const x0 = Math.min(Math.max(rect.x0, xDomain[0]), xDomain[1] - w);
    const y0 = Math.min(Math.max(rect.y0, yDomain[0]), yDomain[1] - h);
    return { xDomain: [x0, x0 + w], yDomain: [y0, y0 + h] };
  }

  // ---- geometrie pixel <-> paper (pour l'overlay de drag/resize) ----
  // placement paper -> rectangle pixel dans l'aire de trace. size = _fullLayout._size.
  function paperRectToPixels(placement, size) {
    const x0 = placement.xDomain[0], x1 = placement.xDomain[1];
    const y0 = placement.yDomain[0], y1 = placement.yDomain[1];
    return {
      left: size.l + x0 * size.w,
      top: size.t + (1 - y1) * size.h,   // y paper monte, y pixel descend
      width: (x1 - x0) * size.w,
      height: (y1 - y0) * size.h
    };
  }

  // delta de deplacement en pixels -> delta en paper (dy inverse).
  function pixelDeltaToPaper(dxPx, dyPx, size) {
    return { dx: dxPx / size.w, dy: -dyPx / size.h };
  }

  // translation brute des deux domaines (bornage delegue a clampPlacement).
  function movePlacement(placement, dxPaper, dyPaper) {
    return {
      xDomain: [placement.xDomain[0] + dxPaper, placement.xDomain[1] + dxPaper],
      yDomain: [placement.yDomain[0] + dyPaper, placement.yDomain[1] + dyPaper]
    };
  }

  // deplace le coin saisi, ancre le coin oppose, impose la taille mini.
  // corner : 'n'/'s' = haut/bas (paper), 'e'/'w' = droite/gauche.
  function resizePlacement(placement, corner, dxPaper, dyPaper, minSize) {
    const ms = minSize == null ? 0.12 : minSize;
    let x0 = placement.xDomain[0], x1 = placement.xDomain[1];
    let y0 = placement.yDomain[0], y1 = placement.yDomain[1];
    if (corner.indexOf("e") >= 0) { x1 = Math.max(x1 + dxPaper, x0 + ms); }
    if (corner.indexOf("w") >= 0) { x0 = Math.min(x0 + dxPaper, x1 - ms); }
    if (corner.indexOf("n") >= 0) { y1 = Math.max(y1 + dyPaper, y0 + ms); }
    if (corner.indexOf("s") >= 0) { y0 = Math.min(y0 + dyPaper, y1 - ms); }
    return { xDomain: [x0, x1], yDomain: [y0, y1] };
  }

  // Coupe un segment [p0->p1] juste avant qu'il n'entre dans l'interieur du
  // rect : si le segment penetre l'encart avant d'atteindre p1, renvoie le point
  // de 1ere frontiere (le trait "passe sous l'encart") ; sinon p1 inchange.
  // Liang-Barsky : tIn = entree dans le rect ferme.
  function clipSegmentBeforeRect(x0, y0, x1, y1, rect) {
    const dx = x1 - x0, dy = y1 - y0;
    const p = [-dx, dx, -dy, dy];
    const q = [x0 - rect.x0, rect.x1 - x0, y0 - rect.y0, rect.y1 - y0];
    let tIn = 0, tOut = 1;
    for (let k = 0; k < 4; k++) {
      if (p[k] === 0) {
        if (q[k] < 0) { return [x1, y1]; }   // parallele et hors de la bande -> aucune intersection
      } else {
        const t = q[k] / p[k];
        if (p[k] < 0) { if (t > tIn) { tIn = t; } }
        else { if (t < tOut) { tOut = t; } }
      }
    }
    const eps = 1e-9;
    if (tIn < tOut - eps && tIn < 1 - eps) { return [x0 + tIn * dx, y0 + tIn * dy]; }
    return [x1, y1];
  }

  // ---- traits de liaison (loupe) entre zone source et encart ----
  // sourceRect / insetRect : rectangles paper {x0,y0,x1,y1}. Renvoie des segments
  // { corner, x0,y0,x1,y1 } reliant des coins homonymes. opts.corners : 0 (aucun
  // trait), 2 (defaut, les 2 coins "exterieurs" qui ne traversent rien) ou 4 (tous
  // les coins ; un segment qui traverse l'encart est coupe a son bord par
  // clipSegmentBeforeRect). En mode 2, choix par signe relatif des centres :
  // nw/se, sinon ne/sw.
  function insetConnectorLines(sourceRect, insetRect, opts) {
    if (!sourceRect || !insetRect) { return []; }
    opts = opts || {};
    if (opts.corners === 0) { return []; }
    const sCx = (sourceRect.x0 + sourceRect.x1) / 2;
    const sCy = (sourceRect.y0 + sourceRect.y1) / 2;
    const iCx = (insetRect.x0 + insetRect.x1) / 2;
    const iCy = (insetRect.y0 + insetRect.y1) / 2;
    const corner = function (rect, name) {
      return {
        nw: [rect.x0, rect.y1], ne: [rect.x1, rect.y1],
        sw: [rect.x0, rect.y0], se: [rect.x1, rect.y0]
      }[name];
    };
    const names = (opts.corners === 4)
      ? ["nw", "ne", "sw", "se"]
      : (((iCx - sCx) * (iCy - sCy) >= 0) ? ["nw", "se"] : ["ne", "sw"]);
    return names.map(function (name) {
      const s = corner(sourceRect, name);
      const i = corner(insetRect, name);
      const end = clipSegmentBeforeRect(s[0], s[1], i[0], i[1], insetRect);
      return { corner: name, x0: s[0], y0: s[1], x1: end[0], y1: end[1] };
    });
  }

  return {
    insetConnectorLines: insetConnectorLines,
    makeInsetCandidates: makeInsetCandidates,
    scoreInsetCandidate: scoreInsetCandidate,
    chooseInsetDomain: chooseInsetDomain,
    clampPlacement: clampPlacement,
    paperRectToPixels: paperRectToPixels,
    pixelDeltaToPaper: pixelDeltaToPaper,
    movePlacement: movePlacement,
    resizePlacement: resizePlacement
  };
});
