// Generates the app icons (no dependencies): deep navy with a soft gold glow and a gold cross.
//   node tools/make_icons.mjs
// Writes icons/icon-192.png, icons/icon-512.png, icons/icon-maskable-512.png (extra safe padding)
// and icons/apple-touch-icon.png (180x180).

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => c1.map((v, i) => lerp(v, c2[i], t));
const clamp01 = (x) => Math.max(0, Math.min(1, x));

const NAVY_LIGHT = hex("#1a3a7a"), NAVY_DEEP = hex("#050c22"), GOLD_TOP = hex("#fff3c9"), GOLD_BOT = hex("#d9a441");
const GLOW = hex("#f2c460");

/** Signed distance from point (px,py) to a rounded box centered at (cx,cy) with half sizes (hx,hy). */
function sdBox(px, py, cx, cy, hx, hy, r) {
  const dx = Math.abs(px - cx) - (hx - r), dy = Math.abs(py - cy) - (hy - r);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
}

/** Colour at unit coordinates (u, v). `k` scales the cross (smaller for the maskable safe zone). */
function shade(u, v, k) {
  const d = Math.hypot(u - 0.5, v - 0.46);
  let c = mix(NAVY_LIGHT, NAVY_DEEP, clamp01(d / 0.72));                  // navy, lighter toward the middle
  c = mix(c, GLOW, 0.28 * Math.pow(clamp01(1 - d / 0.45), 2));           // soft gold glow behind the cross

  const h = 0.29 * k, w = 0.058 * k, bar = 0.19 * k, barY = 0.46 - h + 0.17 * k; // cross dimensions
  const sd = Math.min(
    sdBox(u, v, 0.5, 0.46, w, h, 0.012 * k),            // upright
    sdBox(u, v, 0.5, barY, bar, w * 0.9, 0.012 * k)     // crossbar
  );
  c = mix(c, GLOW, 0.4 * Math.exp(-Math.max(sd, 0) / (0.025 * k)));       // glow hugging the cross
  if (sd < 0.004) {
    const gold = mix(GOLD_TOP, GOLD_BOT, clamp01((v - (0.46 - h)) / (2 * h)));
    c = mix(c, gold, clamp01(0.5 - sd / 0.008));                          // anti-aliased edge
  }
  return c;
}

function render(size, k) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const SS = 3; // supersampling per axis
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // PNG filter: none
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const c = shade((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size, k);
        r += c[0]; g += c[1]; b += c[2];
      }
      const o = y * (size * 4 + 1) + 1 + x * 4, n = SS * SS;
      raw[o] = Math.round(r / n); raw[o + 1] = Math.round(g / n); raw[o + 2] = Math.round(b / n); raw[o + 3] = 255;
    }
  }
  return raw;
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function png(size, k) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(render(size, k), { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const outputs = [
  ["icon-192.png", 192, 1],
  ["icon-512.png", 512, 1],
  ["icon-maskable-512.png", 512, 0.72], // cross stays inside the central 80% safe zone
  ["apple-touch-icon.png", 180, 1],
];
fs.mkdirSync(path.join(ROOT, "icons"), { recursive: true });
for (const [name, size, k] of outputs) {
  fs.writeFileSync(path.join(ROOT, "icons", name), png(size, k));
  console.log("wrote icons/" + name);
}
