// Reproduces the on-device experiment: a horizontal stroke, left to right, whose
// contact size climbs from the lightest touch to the maximum at the middle and
// fades back out, in the 24.3 px steps the iPhone reports.  Measures where the
// ink actually lands: width along the stroke, gaps, and stray blobs.
const fs = require('fs');
const vm = require('vm');

const SRC = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8')
  .match(/<script>([\s\S]*?)<\/script>/)[1];

const LEVELS = [24.3, 48.6, 72.9, 97.2, 121.5, 145.8, 170.1];

// Deterministic noise so runs are comparable.
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function run({ recompute, harai = 0, thickness = 50, speed = 10, peak = 6, length = 300, y0 = 400, x0 = 40,
  profile = null, dt = 16, jitter = 0, seed = 7, moisture = 100, path = null }) {
  const rand = rng(seed);
  let clock = 1000;
  let phase = 'live';
  const ink = [];                                   // {x0,y0,x1,y1,w} capsules / {x,y,r} discs
  const ctx = {
    lineWidth: 1, lineCap: 'round', lineJoin: 'round', globalAlpha: 1, fillStyle: '', strokeStyle: '',
    globalCompositeOperation: 'source-over',
    _path: [],
    setTransform() {}, save() {}, restore() {}, fillRect() {}, drawImage() {},
    beginPath() { this._path = []; },
    moveTo(x, y) { this._path.push({ t: 'm', x, y }); },
    lineTo(x, y) { this._path.push({ t: 'l', x, y }); },
    arc(x, y, r) { this._path.push({ t: 'a', x, y, r }); },
    stroke() {
      let prev = null;
      for (const p of this._path) {
        if (p.t === 'm') prev = p;
        else if (p.t === 'l' && prev) { ink.push({ phase, kind: 'seg', x0: prev.x, y0: prev.y, x1: p.x, y1: p.y, w: this.lineWidth }); prev = p; }
      }
    },
    fill() { for (const p of this._path) if (p.t === 'a') ink.push({ phase, kind: 'disc', x: p.x, y: p.y, r: p.r }); }
  };
  const makeCanvas = () => ({
    width: 300, height: 150, _h: {}, getContext: () => ctx,
    addEventListener(t, fn) { (this._h[t] = this._h[t] || []).push(fn); },
    setPointerCapture() {}, releasePointerCapture() {},
    dispatch(t, e) { for (const fn of (this._h[t] || [])) fn(e); }
  });
  const paper = makeCanvas();
  const raf = [];
  const el = x => ({ hidden: false, textContent: '', value: '0', checked: false, _h: {}, classList: { add() {}, remove() {} },
    addEventListener(t, fn) { (this._h[t] = this._h[t] || []).push(fn); }, setAttribute() {}, removeAttribute() {},
    querySelectorAll: () => [0, 1, 2, 3, 4, 5].map(() => ({ textContent: '' })), ...x });
  const els = {
    '#notice': el(), '#settings-close': el(), '#blank-paper': el(), '#reset-contact': el(), '#contact-info': el({ hidden: true }),
    '#settings': el({ hidden: true }), '#waiting': el({ hidden: true }),
    '#pressure-balance': el({ value: '30' }), '#moisture': el({ value: String(moisture) }),
    '#thickness': el({ value: String(thickness) }), '#speed-thinness': el({ value: '85' }),
    '#brush-angle': el({ value: '25' }), '#harai-duration': el({ value: String(harai) }),
    '#final-recompute': el({ checked: recompute }), '#show-contact': el({ checked: false })
  };
  const sandbox = {
    console, devicePixelRatio: 2, innerWidth: 375, innerHeight: 812,
    document: { body: el(), querySelector: s => (s === '#paper' ? paper : els[s]), createElement: makeCanvas },
    addEventListener() {}, matchMedia: () => ({ matches: false }), performance: { now: () => clock },
    requestAnimationFrame(fn) { raf.push(fn); }, setTimeout: () => 0, clearTimeout() {}, confirm: () => true,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);

  const ev = (type, x, y, size) => ({ type, pointerId: 1, pointerType: 'touch', clientX: x, clientY: y,
    width: size, height: size, pressure: .5, timeStamp: clock, preventDefault() {} });
  const steps = Math.round(length / speed);
  const sizeAt = k => {
    if (profile) return profile(k, steps);
    const t = k / steps, tri = 1 - Math.abs(t * 2 - 1);              // 0 -> 1 -> 0
    return LEVELS[Math.min(peak, Math.round(tri * peak))];
  };
  let x = x0, px_ = x0, py_ = y0;
  paper.dispatch('pointerdown', ev('pointerdown', x, y0, sizeAt(0)));
  for (let k = 1; k <= steps; k++) {
    clock += dt; x += speed;
    const jx = (rand() - .5) * 2 * jitter, jy = (rand() - .5) * 2 * jitter;
    const at = path ? path(k, steps, x0, y0, speed) : { x, y: y0 + Math.sin(k / 9) * 1.5 };
    px_ = at.x; py_ = at.y;
    paper.dispatch('pointermove', ev('pointermove', at.x + jx, at.y + jy, sizeAt(k)));
  }
  phase = recompute ? 'replay' : 'live'; clock += 8;
  paper.dispatch('pointerup', ev('pointerup', px_, py_, sizeAt(steps)));
  for (let i = 0; i < 6 && raf.length; i++) raf.shift()(clock);
  return { ink, x0, x1: px_, y0, y1: py_ };
}

// width of the ink column in each x bin, plus coverage
function profileOf(result, which) {
  const BIN = 12, bins = new Map();
  const add = (x, yLo, yHi) => {
    const b = Math.floor(x / BIN);
    const cur = bins.get(b) || { lo: Infinity, hi: -Infinity };
    cur.lo = Math.min(cur.lo, yLo); cur.hi = Math.max(cur.hi, yHi); bins.set(b, cur);
  };
  for (const s of result.ink.filter(i => i.phase === which)) {
    if (s.kind === 'disc') { add(s.x, s.y - s.r, s.y + s.r); continue; }
    const n = Math.max(1, Math.ceil(Math.hypot(s.x1 - s.x0, s.y1 - s.y0) / 3));
    for (let i = 0; i <= n; i++) {
      const x = s.x0 + (s.x1 - s.x0) * i / n, y = s.y0 + (s.y1 - s.y0) * i / n;
      add(x, y - s.w / 2, y + s.w / 2);
    }
  }
  const keys = [...bins.keys()].sort((a, b) => a - b);
  if (!keys.length) return { rows: [], gaps: 0, max: 0, first: NaN, last: NaN };
  const rows = [];
  let gaps = 0;
  for (let b = keys[0]; b <= keys[keys.length - 1]; b++) {
    const c = bins.get(b);
    if (!c) { gaps++; rows.push({ x: b * BIN, w: 0 }); } else rows.push({ x: b * BIN, w: c.hi - c.lo });
  }
  return { rows, gaps, max: Math.max(...rows.map(r => r.w)), first: keys[0] * BIN, last: keys[keys.length - 1] * BIN };
}

function report(label, cfg, which) {
  const r = run(cfg);
  const p = profileOf(r, which);
  console.log('== ' + label + ' ==');
  console.log('   ink x ' + p.first + ' .. ' + p.last + '   (finger ' + r.x0 + ' .. ' + r.x1.toFixed(0) + ')'
    + '   max width ' + p.max.toFixed(1) + '   empty 12px bins inside the stroke: ' + p.gaps);
  let line = '   width by x: ';
  for (const row of p.rows) line += row.w.toFixed(0) + ' ';
  console.log(line);
  return p;
}

module.exports = { run, profileOf, report, LEVELS };
if (require.main === module) {
  // The iPhone delivers ~120 Hz with the finger moving ~1.5 px per event when writing
  // slowly; its tracking noise is a few tenths of a pixel.
  const real = { speed: 1.5, dt: 8, jitter: .4 };
  const len = 300 * 0 + 300;
  report('live physics, smooth input', { speed: 3, recompute: false }, 'live');
  report('live physics, 120 Hz + 0.4 px jitter', { ...real, recompute: false }, 'live');
  report('replay (harai .3 s), 120 Hz + 0.4 px jitter', { ...real, recompute: true, harai: 30 }, 'replay');
}
