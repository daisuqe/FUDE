const { run } = require('./leaf.js');
const { render } = require('./png.js');
const out = process.argv[2] || require('path').join(__dirname, 'out', 'look.png');
const real = { dt: 8, jitter: .4, speed: 1.5 };
const hold = (k, n) => { const t = k / n; return t < .25 ? 24.3 + (170.1 - 24.3) * (t / .25) : t < .7 ? 170.1 : 170.1 - (170.1 - 24.3) * ((t - .7) / .3); };
const results = [
  run({ ...real, recompute: false, moisture: 85 }),
  run({ ...real, recompute: false, profile: hold, seed: 3, moisture: 85 }),
  run({ ...real, recompute: true, harai: 30, seed: 5, moisture: 85 }),
];
const which = ['live', 'live', 'replay'];
// render takes one `which`; draw each row with its own phase
const fs = require('fs');
const tmp = results.map((r, i) => ({ ...r, ink: r.ink.map(e => ({ ...e, phase: 'x' })).filter(() => false).concat(r.ink.filter(e => e.phase === which[i]).map(e => ({ ...e, phase: 'x' }))) }));
render(out, tmp, 'x');
console.log('wrote', out);
