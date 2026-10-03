// Minimal rasteriser: draws the recorded ink (capsules and discs) into a PNG so the
// stroke can be looked at, not just measured.
const zlib = require('zlib');
const fs = require('fs');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function writePng(path, w, h, gray) {
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w + 1)] = 0; for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = gray[y * w + x]; }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  fs.mkdirSync(require('path').dirname(path), { recursive: true });
  fs.writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
// rows: several results stacked vertically, each cropped around its stroke
function render(path, results, which, { scale = 3, width = 360, rowHeight = 90 } = {}) {
  const W = width * scale, H = rowHeight * scale * results.length;
  const img = new Uint8Array(W * H).fill(244);
  const disc = (cx, cy, r, row) => {
    const ox = 0, oy = row * rowHeight * scale;
    const x0 = Math.floor((cx - r) * scale), x1 = Math.ceil((cx + r) * scale);
    const y0 = Math.floor((cy - r) * scale), y1 = Math.ceil((cy + r) * scale);
    for (let y = Math.max(0, y0); y <= Math.min(rowHeight * scale - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
        const dx = (x + .5) / scale - cx, dy = (y + .5) / scale - cy;
        if (dx * dx + dy * dy <= r * r) img[(oy + y) * W + ox + x] = 16;
      }
  };
  results.forEach((res, row) => {
    const yOff = res.top !== undefined ? res.top : res.y0 - rowHeight / 2;
    for (const s of res.ink.filter(i => i.phase === which)) {
      if (s.kind === 'disc') { disc(s.x, s.y - yOff, Math.max(.3, s.r), row); continue; }
      const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0), n = Math.max(1, Math.ceil(len / .4));
      for (let i = 0; i <= n; i++) disc(s.x0 + (s.x1 - s.x0) * i / n, s.y0 + (s.y1 - s.y0) * i / n - yOff, Math.max(.3, s.w / 2), row);
    }
    // thin guide lines between rows
    for (let x = 0; x < W; x++) img[(row * rowHeight * scale) * W + x] = 200;
  });
  writePng(path, W, H, img);
}
module.exports = { render };
