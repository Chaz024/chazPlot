// Decodeur PNG minimal sans dependance (zlib natif Node) -> {width,height,data:RGBA}.
// Couleurs 0/2/4/6, 8 bits, filtres None/Sub/Up/Average/Paeth. Suffisant pour des
// figures matplotlib. Usage : const { decodePng } = require("./png_decode.js").
"use strict";
const fs = require("fs");
const zlib = require("zlib");

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decodePng(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("pas un PNG");
  let pos = 8, w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error("bitDepth " + bitDepth + " non supporte");
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!ch) throw new Error("colorType " + colorType + " non supporte");
  const stride = w * ch;
  const out = new Uint8ClampedArray(w * h * 4);
  const prev = new Uint8Array(stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[p++], cur = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const rv = raw[p++], a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      let v;
      if (ft === 0) v = rv; else if (ft === 1) v = rv + a; else if (ft === 2) v = rv + b;
      else if (ft === 3) v = rv + ((a + b) >> 1); else v = rv + paeth(a, b, c);
      cur[x] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, s = x * ch;
      if (ch === 1) { out[o] = out[o + 1] = out[o + 2] = cur[s]; out[o + 3] = 255; }
      else if (ch === 2) { out[o] = out[o + 1] = out[o + 2] = cur[s]; out[o + 3] = cur[s + 1]; }
      else if (ch === 3) { out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]; out[o + 3] = 255; }
      else { out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]; out[o + 3] = cur[s + 3]; }
    }
    prev.set(cur);
  }
  return { width: w, height: h, data: out };
}

module.exports = { decodePng: decodePng };
