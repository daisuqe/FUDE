const { run } = require('./leaf.js');
const { render } = require('./png.js');
const out = process.argv[2] || require('path').join(__dirname, 'out', 'moisture_' + (process.argv[3] || 'turn') + '.png');
const scenario = process.argv[3] || 'turn';
const real = { dt: 8, jitter: .4, speed: 1.5, recompute: false };
// right 150 px, then straight down 140 px: a sharp 転折 (turn) at the corner
const turn = (k, n, x0, y0, speed) => { const s = k * speed; return s < 150 ? { x: x0 + s, y: y0 } : { x: x0 + 150, y: y0 + (s - 150) }; };
const mid = () => 110;          // a firm-ish, steady contact so the body is wide enough to see fraying
const hard = (k, n) => 170.1;   // pressed in hard all the way
const cfg = scenario === 'turn'
  ? { ...real, length: 290, path: turn, profile: mid }
  : { ...real, length: 300, profile: hard };
const rows = [100, 55, 10].map(m => {
  const r = run({ ...cfg, moisture: m });
  r.top = scenario === 'turn' ? r.y0 - 30 : r.y0 - 45;
  r.ink = r.ink.filter(i => i.phase === 'live' || i.phase === 'replay').map(e => ({ ...e, phase: 'x' }));
  return r;
});
render(out, rows, 'x', { rowHeight: scenario === 'turn' ? 190 : 90, width: 340 });
console.log('wrote', out);
