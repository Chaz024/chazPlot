// ============================================================
// storage.js — persistance des figures (disque + index workspace)
// Les figures survivent a un Reload Window. Best-effort : toute
// erreur d'E/S est journalisee et n'interrompt jamais l'affichage.
// ============================================================
"use strict";

const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

const INDEX_KEY = "spyderPlots.index";
let ctx = null;
let figuresDir = null;

function init(context) {
  ctx = context;
  const base = context.storageUri || context.globalStorageUri;
  if (!base) {
    figuresDir = null;
    return;
  }
  figuresDir = path.join(base.fsPath, "figures");
  try {
    fs.mkdirSync(figuresDir, { recursive: true });
  } catch (e) {
    figuresDir = null;
  }
}

function readIndex() {
  return ctx.workspaceState.get(INDEX_KEY, { nextId: 1, figures: [] });
}

function writeIndex(index) {
  return ctx.workspaceState.update(INDEX_KEY, index);
}

function figPath(id) {
  return path.join(figuresDir, String(id) + ".json");
}

function maxFigures() {
  const cfg = vscode.workspace.getConfiguration("spyderPlots");
  const n = cfg.get("maxPersistedFigures", 200);
  return n > 0 ? n : null;
}

function nextId() {
  return readIndex().nextId;
}

function loadAll() {
  if (!figuresDir) { return []; }
  const index = readIndex();
  const out = [];
  index.figures.forEach(function (entry) {
    try {
      const raw = fs.readFileSync(figPath(entry.id), "utf8");
      out.push(JSON.parse(raw));
    } catch (e) {
      // fichier manquant/corrompu : on ignore cette figure
    }
  });
  return out;
}

function evictIfNeeded(index) {
  const cap = maxFigures();
  if (cap === null) { return; }
  while (index.figures.length > cap) {
    const old = index.figures.shift();
    try { fs.unlinkSync(figPath(old.id)); } catch (e) { /* ignore */ }
  }
}

function save(fig) {
  if (!figuresDir) { return; }
  const index = readIndex();
  try {
    fs.writeFileSync(figPath(fig.id), JSON.stringify(fig), "utf8");
  } catch (e) {
    return;
  }
  index.figures = index.figures.filter(function (f) { return f.id !== fig.id; });
  index.figures.push({ id: fig.id, title: fig.title, tags: fig.tags || [], ts: fig.ts });
  index.nextId = Math.max(index.nextId, fig.id + 1);
  evictIfNeeded(index);
  writeIndex(index);
}

function remove(id) {
  if (!figuresDir) { return; }
  const index = readIndex();
  index.figures = index.figures.filter(function (f) { return f.id !== id; });
  try { fs.unlinkSync(figPath(id)); } catch (e) { /* ignore */ }
  writeIndex(index);
}

function removeAll() {
  if (!figuresDir) { return; }
  const index = readIndex();
  index.figures.forEach(function (f) {
    try { fs.unlinkSync(figPath(f.id)); } catch (e) { /* ignore */ }
  });
  index.figures = [];
  writeIndex(index);
}

function updateTags(id, tags) {
  if (!figuresDir) { return; }
  const index = readIndex();
  const entry = index.figures.find(function (f) { return f.id === id; });
  if (entry) { entry.tags = tags; }
  writeIndex(index);
  // met aussi a jour le fichier figure
  try {
    const raw = fs.readFileSync(figPath(id), "utf8");
    const fig = JSON.parse(raw);
    fig.tags = tags;
    fs.writeFileSync(figPath(id), JSON.stringify(fig), "utf8");
  } catch (e) { /* ignore */ }
}

module.exports = {
  init: init, loadAll: loadAll, save: save, remove: remove,
  removeAll: removeAll, updateTags: updateTags, nextId: nextId,
};
