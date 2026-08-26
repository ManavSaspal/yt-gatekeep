// Generates the door icons (no deps, built-in zlib). A warm amber rounded tile
// with a white door + knob — matches the 🚪 branding and stays visible on both
// light and dark toolbars (the tile is its own background).
// Run: node scripts/generate-icons.js
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
  const S = size;
  const r = S * 0.22; // tile corner radius
  const tile = [0xf5, 0x9e, 0x0b]; // warm amber
  const door = [255, 255, 255];

  // Door rectangle (fractions of size), with gently rounded top corners.
  const dL = S * 0.34, dR = S * 0.66, dT = S * 0.24, dB = S * 0.80;
  const topR = S * 0.14; // top-corner rounding
  const knobX = S * 0.60, knobY = S * 0.54, knobR = Math.max(0.6, S * 0.045);

  const tileMask = (x, y) => {
    const dxl = x, dxr = w - 1 - x, dyt = y, dyb = h - 1 - y;
    const nearL = dxl < r, nearR = dxr < r, nearT = dyt < r, nearB = dyb < r;
    if ((nearL || nearR) && (nearT || nearB)) {
      const ccx = nearL ? r : w - 1 - r;
      const ccy = nearT ? r : h - 1 - r;
      return Math.hypot(x - ccx, y - ccy) <= r;
    }
    return true;
  };

  const doorMask = (x, y) => {
    if (x < dL || x > dR || y < dT || y > dB) return false;
    // round only the two top corners
    if (y < dT + topR) {
      if (x < dL + topR) return Math.hypot(x - (dL + topR), y - (dT + topR)) <= topR;
      if (x > dR - topR) return Math.hypot(x - (dR - topR), y - (dT + topR)) <= topR;
    }
    return true;
  };

  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const o = y * (1 + w * 4) + 1 + x * 4;
      let col = null;
      if (tileMask(x, y)) {
        col = tile;
        if (doorMask(x, y)) {
          // knob is punched back to the tile color inside the white door
          col = Math.hypot(x - knobX, y - knobY) <= knobR ? tile : door;
        }
      }
      if (col) {
        raw[o] = col[0]; raw[o + 1] = col[1]; raw[o + 2] = col[2]; raw[o + 3] = 255;
      } else {
        raw[o + 3] = 0; // transparent outside the tile
      }
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
