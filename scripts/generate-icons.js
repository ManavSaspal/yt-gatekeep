// Throwaway: generates flat placeholder PNG icons (no deps, built-in zlib).
// A near-white rounded square with a punched "keyhole" dot — reads in light &
// dark toolbars. Replace icons/ with real art whenever. Run: node scripts/generate-icons.js
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function png(size) {
  const w = size, h = size;
  const raw = Buffer.alloc(h * (1 + w * 4)); // filter byte + RGBA per row
  const r = size * 0.2; // corner radius
  const cx = size * 0.5, cy = size * 0.38, hole = size * 0.13; // keyhole dot
  const fg = [250, 250, 250];
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      // rounded-square mask
      let inside = true;
      const dxl = x, dxr = w - 1 - x, dyt = y, dyb = h - 1 - y;
      const nearL = dxl < r, nearR = dxr < r, nearT = dyt < r, nearB = dyb < r;
      if ((nearL || nearR) && (nearT || nearB)) {
        const ccx = nearL ? r : w - 1 - r;
        const ccy = nearT ? r : h - 1 - r;
        inside = Math.hypot(x - ccx, y - ccy) <= r;
      }
      // punch the keyhole hole
      const inHole = Math.hypot(x - cx, y - cy) <= hole;
      const alpha = inside && !inHole ? 255 : 0;
      const o = y * (1 + w * 4) + 1 + x * 4;
      raw[o] = fg[0]; raw[o + 1] = fg[1]; raw[o + 2] = fg[2]; raw[o + 3] = alpha;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const idat = zlib.deflateSync(raw);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const size of [16, 48, 128]) {
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), png(size));
  console.log(`wrote icon${size}.png`);
}
