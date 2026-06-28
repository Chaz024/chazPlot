// test/test_data_import.js — tests du parsing de fichiers de donnees delimites.
// Lancer : node test/test_data_import.js
const assert = require("assert");
const DataImport = require("../media/data_import.js");

let passed = 0;
function check(name, fn) { fn(); passed++; console.log("  ok - " + name); }

check("CSV avec en-tete : noms + colonnes numeriques", function () {
  const r = DataImport.parseDelimited("t,v\n0,1\n1,2\n2,4\n");
  assert.strictEqual(r.delimiter, ",");
  assert.strictEqual(r.hasHeader, true);
  assert.strictEqual(r.columns.length, 2);
  assert.strictEqual(r.columns[0].name, "t");
  assert.deepStrictEqual(r.columns[1].values, [1, 2, 4]);
});

check("sans en-tete : noms col1/col2 generes", function () {
  const r = DataImport.parseDelimited("0 1\n1 2\n2 3\n");
  assert.strictEqual(r.delimiter, "ws");
  assert.strictEqual(r.hasHeader, false);
  assert.strictEqual(r.columns[0].name, "col1");
  assert.strictEqual(r.columns.length, 2);
});

check("tab + point-virgule detectes", function () {
  assert.strictEqual(DataImport.parseDelimited("a\tb\n1\t2\n").delimiter, "\t");
  assert.strictEqual(DataImport.parseDelimited("a;b\n1;2\n").delimiter, ";");
});

check("commentaires (# et %) et lignes vides ignores", function () {
  const r = DataImport.parseDelimited("# titre\nx,y\n\n0,1\n% note\n1,2\n");
  assert.strictEqual(r.rowCount, 2);
  assert.deepStrictEqual(r.columns[0].values, [0, 1]);
});

check("valeurs non numeriques -> NaN, paires ecartees par seriesFromColumns", function () {
  const r = DataImport.parseDelimited("x,y\n0,1\n1,NA\n2,3\n");
  const series = DataImport.seriesFromColumns(r.columns, 0, [1], "data");
  assert.strictEqual(series.length, 1);
  assert.deepStrictEqual(series[0].x, [0, 2]);   // la ligne avec NA est sautee
  assert.deepStrictEqual(series[0].y, [1, 3]);
  assert.strictEqual(series[0].name, "data: y");
});

check("xIndex < 0 -> X = indice", function () {
  const r = DataImport.parseDelimited("v\n10\n20\n30\n");
  const series = DataImport.seriesFromColumns(r.columns, -1, [0], "");
  assert.deepStrictEqual(series[0].x, [0, 1, 2]);
  assert.deepStrictEqual(series[0].y, [10, 20, 30]);
});

check("plusieurs Y -> une serie par colonne", function () {
  const r = DataImport.parseDelimited("t,a,b\n0,1,9\n1,2,8\n");
  const series = DataImport.seriesFromColumns(r.columns, 0, [1, 2], "f");
  assert.strictEqual(series.length, 2);
  assert.strictEqual(series[0].name, "f: a");
  assert.strictEqual(series[1].name, "f: b");
});

check("xIndex tableau -> un X propre a chaque Y (donnees en paires)", function () {
  // colonnes : x1,y1,x2,y2
  const r = DataImport.parseDelimited("x1,y1,x2,y2\n0,10,100,1\n1,20,200,2\n");
  const series = DataImport.seriesFromColumns(r.columns, [0, 2], [1, 3], "p");
  assert.strictEqual(series.length, 2);
  assert.deepStrictEqual(series[0].x, [0, 1]);     // y1 utilise x1
  assert.deepStrictEqual(series[0].y, [10, 20]);
  assert.deepStrictEqual(series[1].x, [100, 200]); // y2 utilise x2
  assert.deepStrictEqual(series[1].y, [1, 2]);
});

check("xIndex tableau avec une entree indice (-1)", function () {
  const r = DataImport.parseDelimited("x1,y1,y2\n5,10,1\n6,20,2\n");
  const series = DataImport.seriesFromColumns(r.columns, [0, -1], [1, 2], "");
  assert.deepStrictEqual(series[0].x, [5, 6]);   // y1 -> x1
  assert.deepStrictEqual(series[1].x, [0, 1]);   // y2 -> indice
});

check("virgule decimale (Excel FR) avec delimiteur ; -> parsee", function () {
  const r = DataImport.parseDelimited('x;y\n"0,5";"1,25"\n"1,5";"2,75"\n');
  assert.strictEqual(r.delimiter, ";");
  assert.deepStrictEqual(r.columns[0].values, [0.5, 1.5]);
  assert.deepStrictEqual(r.columns[1].values, [1.25, 2.75]);
});

check("virgule = delimiteur -> point decimal conserve (pas de conversion)", function () {
  const r = DataImport.parseDelimited("a,b\n1.5,2\n3.5,4\n");
  assert.strictEqual(r.delimiter, ",");
  assert.deepStrictEqual(r.columns[0].values, [1.5, 3.5]);
});

check("round-trip : export CsvExport large -> reimport DataImport (paires auto)", function () {
  const CSV = require("../media/csv_export.js");
  const wide = CSV.buildWideCsv([
    { name: "A", x: [0, 1, 2], y: [10, 20, 30] },
    { name: "B", x: [5, 6, 7], y: [1, 2, 3] },
  ], { precision: 2 });
  const r = DataImport.parseDelimited(wide);
  // le format groupe est detecte : paires (x,y) reconstituees, noms conserves
  assert.deepStrictEqual(r.pairs, { xIndices: [0, 3], yIndices: [1, 4] });
  const series = DataImport.seriesFromColumns(r.columns, r.pairs.xIndices, r.pairs.yIndices, "");
  assert.strictEqual(series.length, 2);
  assert.strictEqual(series[0].name, "A");
  assert.deepStrictEqual(series[0].x, [0, 1, 2]);
  assert.deepStrictEqual(series[0].y, [10, 20, 30]);
  assert.strictEqual(series[1].name, "B");
  assert.deepStrictEqual(series[1].x, [5, 6, 7]);
  assert.deepStrictEqual(series[1].y, [1, 2, 3]);
});

check("fichier vide -> erreur", function () {
  assert.ok(DataImport.parseDelimited("   ").error);
  assert.ok(DataImport.parseDelimited("").error);
});

console.log("\n" + passed + " tests OK");
