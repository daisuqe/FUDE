// Lifecycle checks: paper layer, resize preservation, repeated strokes,
// recompute-off path, pointercancel restore.
const fs = require('fs');
const vm = require('vm');

const SRC = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8')
  .match(/<script>([\s\S]*?)<\/script>/)[1];

function boot({ recompute = true, harai = 30 } = {}) {
  const state = { clock: 1000, raf: [], events: [], calls: [], phase: 'live', innerHeight: 812 };
  function makeCtx(owner) {
    let path = [];
    const ctx = {
      lineWidth: 1, lineCap: 'round', lineJoin: 'round', globalAlpha: 1,
      globalCompositeOperation: 'source-over', strokeStyle: '', fillStyle: '',
      setTransform() {}, save() {}, restore() {},
      fillRect(x, y, w, h) { state.calls.push({ op: 'fillRect', owner, w, h, phase: state.phase }); },
      beginPath() { path = []; },
      moveTo(x, y) { path.push({ x, y }); }, lineTo(x, y) { path.push({ x, y }); },
      arc(x, y, r) { path.push({ x, y, r }); },
      stroke() {
        if (!path.length) return;
        let minX = Infinity, maxX = -Infinity, sumY = 0;
        for (const q of path) { minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); sumY += q.y; }
        state.events.push({ kind: 'stroke', owner, phase: state.phase, n: path.length,
          width: maxX - minX, y: sumY / path.length, lineWidth: ctx.lineWidth });
      },
      fill() { if (path.length) state.events.push({ kind: 'fill', owner, phase: state.phase, n: path.length }); },
      drawImage(img) { state.calls.push({ op: 'drawImage', owner, from: img && img._name, phase: state.phase }); },
      getImageData(x, y, w, h) { state.calls.push({ op: 'getImageData', owner, phase: state.phase }); return { data: new Uint8ClampedArray(4) }; },
      putImageData() { throw new Error('putImageData must no longer be used'); }
    };
    return ctx;
  }
  function makeCanvas(name) {
    const c = { _name: name, width: 300, height: 150, style: {}, _h: {} };
    const ctx = makeCtx(name);
    c.getContext = () => ctx;
    c.addEventListener = (t, fn) => { (c._h[t] = c._h[t] || []).push(fn); };
    c.setPointerCapture = () => {}; c.releasePointerCapture = () => {};
    c.dispatch = (t, e) => { for (const fn of (c._h[t] || [])) fn(e); };
    return c;
  }
  const paper = makeCanvas('paper');
  const el = extra => ({
    hidden: false, textContent: '', value: '0', checked: false, _h: {},
    classList: { add() {}, remove() {} },
    addEventListener(t, fn) { (this._h[t] = this._h[t] || []).push(fn); },
    setAttribute() {}, removeAttribute() {}, ...extra
  });
  const elements = {
    '#notice': el(), '#settings-close': el(), '#blank-paper': el(),
    '#settings': el({ hidden: true }), '#waiting': el({ hidden: true }),
    '#pressure-balance': el({ value: '30' }), '#moisture': el({ value: '100' }),
    '#thickness': el({ value: '50' }), '#speed-thinness': el({ value: '85' }),
    '#brush-angle': el({ value: '25' }), '#harai-duration': el({ value: String(harai) }),
    '#final-recompute': el({ checked: recompute }), '#show-contact': el({ checked: false }), '#reset-contact': el(), '#contact-info': { hidden: true, querySelectorAll: () => [0,1,2,3,4,5].map(() => ({ textContent: '' })) }
  };
  const winHandlers = {};
  const sandbox = {
    console, devicePixelRatio: 2, innerWidth: 375,
    get innerHeight() { return state.innerHeight; },
    document: {
      body: el(),
      querySelector(sel) { if (sel === '#paper') return paper; return elements[sel]; },
      createElement() { return makeCanvas('layer'); }
    },
    addEventListener(t, fn) { winHandlers[t] = fn; },
    matchMedia: () => ({ matches: false }),
    performance: { now: () => state.clock },
    requestAnimationFrame(fn) { state.raf.push(fn); return state.raf.length; },
    setTimeout: () => 0, clearTimeout: () => {}, confirm: () => true
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: 'fude.js' });

  const pointer = (type, x, y, size = 30) => ({
    type, pointerId: 1, pointerType: 'touch', clientX: x, clientY: y,
    width: size, height: size, pressure: .5, timeStamp: state.clock, preventDefault() {}
  });
  function stroke({ x = 180, y0 = 120, steps = 118, slow = 5, fast = 18, fastFrom = 110,
                    end = 'pointerup', sizeAt = null, size = 30 } = {}) {
    let y = y0;
    paper.dispatch('pointerdown', pointer('pointerdown', x, y, sizeAt ? sizeAt(0, steps) : size));
    for (let i = 0; i < steps; i++) {
      state.clock += 16;
      y += i >= fastFrom ? fast : slow;
      paper.dispatch('pointermove', pointer('pointermove', x, y, sizeAt ? sizeAt(i + 1, steps) : size));
    }
    // Lifting the finger belongs to the phase the stroke was drawn in: with recompute
    // off, the short run-on that ends the ink is still live drawing, not a replay.
    state.phase = recompute ? 'replay' : 'live';
    state.clock += 8;
    paper.dispatch(end, pointer(end, x, y));
    for (let i = 0; i < 10 && state.raf.length; i++) state.raf.shift()(state.clock);
    state.phase = 'live';
    return y;
  }
  return { state, paper, stroke, winHandlers, elements };
}

// A realistic firm stroke: a light landing that presses to a firm contact and holds.
// A constant contact size now correctly reads as a middling press, so a test that
// wants a wide stroke has to vary the contact the way a finger does.
// Real iPhone sizes: a light touch reports 24.3, a hard press reaches ~170.
const FIRM = (i, n) => (i < n * .12 ? 24.3 + (i / (n * .12)) * 146 : 170);

let failures = 0;
function check(name, ok, detail = '') {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? '   ' + detail : ''));
  if (!ok) failures++;
}

// ---------------------------------------------------------------- 1. snapshot
{
  const t = boot();
  t.stroke({ sizeAt: FIRM });
  const calls = t.state.calls.filter(c => c.op !== 'fillRect');
  check('stroke start copies paper -> layer',
    !!calls.find(c => c.op === 'drawImage' && c.owner === 'layer' && c.from === 'paper'));
  check('replay restores layer -> paper',
    !!calls.find(c => c.op === 'drawImage' && c.owner === 'paper' && c.from === 'layer'));
  check('no getImageData anywhere', !calls.some(c => c.op === 'getImageData'),
    'calls: ' + calls.map(c => c.op + ':' + c.owner).join(', '));
  const n = t.state.events.filter(e => e.phase === 'replay' && e.kind === 'stroke').length;
  check('replay deposited ink', n > 100, n + ' stroke events');
}

// ------------------------------------------------------- 2. repeated strokes
{
  const t = boot();
  const counts = [];
  for (let s = 0; s < 3; s++) {
    const before = t.state.events.length;
    t.stroke({ y0: 120 + s * 10, steps: 60, sizeAt: FIRM });
    counts.push(t.state.events.filter((e, i) => i >= before && e.phase === 'replay').length);
  }
  check('every stroke still replays (no stuck replayingStroke)', counts.every(c => c > 50), 'per stroke: ' + counts.join(', '));
}

// --------------------------------------------------------------- 3. resize
{
  const t = boot();
  t.stroke({ steps: 40 });
  t.state.calls.length = 0;
  t.state.innerHeight = 700;                      // iOS address bar appears
  t.winHandlers.resize();
  const ops = t.state.calls.map(c => c.op + ':' + c.owner + (c.from ? '<-' + c.from : ''));
  check('resize keeps the paper (copy out, fill, copy back)',
    ops.includes('drawImage:layer<-paper') && ops.includes('fillRect:paper') && ops.includes('drawImage:paper<-layer'),
    ops.join(' | '));
  t.state.calls.length = 0;
  t.winHandlers.resize();                          // same size again
  check('identical resize is a no-op', t.state.calls.length === 0, t.state.calls.length + ' canvas ops');
}

// ------------------------------------------------- 4. recompute off, harai 0
{
  const t = boot({ recompute: false, harai: 0 });
  t.stroke({ steps: 80, sizeAt: FIRM });
  const live = t.state.events.filter(e => e.phase === 'live' && e.kind === 'stroke').length;
  const replay = t.state.events.filter(e => e.phase === 'replay' && e.kind === 'stroke').length;
  check('recompute off + harai 0 draws live hairs', live > 100, live + ' live stroke events');
  check('recompute off + harai 0 does not replay', replay === 0, replay + ' replay stroke events');
}

// ---------------------------------------------- 5. recompute off, harai .3s
{
  const t = boot({ recompute: false, harai: 30 });
  t.stroke({ steps: 80, sizeAt: FIRM });
  const live = t.state.events.filter(e => e.phase === 'live' && e.kind === 'stroke').length;
  const replay = t.state.events.filter(e => e.phase === 'replay' && e.kind === 'stroke').length;
  const ops = t.state.calls.map(c => c.op + ':' + c.owner);
  check('recompute off never replays, even with harai set', replay === 0, replay + ' replay stroke events');
  check('recompute off still draws live hairs with harai set', live > 100, live + ' live stroke events');
  check('recompute off takes no paper snapshot at all',
    !ops.includes('drawImage:layer') && !ops.includes('getImageData:paper'),
    ops.join(' | ') || 'no canvas ops');
}

// ------------------------------------------------------- 6. pointercancel
{
  const t = boot();
  t.stroke({ steps: 40, end: 'pointercancel' });
  const ops = t.state.calls.map(c => c.op + ':' + c.owner + (c.from ? '<-' + c.from : ''));
  const replay = t.state.events.filter(e => e.phase === 'replay' && e.kind === 'stroke').length;
  check('pointercancel restores the paper instead of replaying',
    ops.includes('drawImage:paper<-layer') && replay === 0, replay + ' replay stroke events');
}

// ------------------------------------------- 7. harai still tapers when ON
{
  const t = boot({ recompute: true, harai: 30 });
  t.stroke({ sizeAt: FIRM });
  const radii = t.state.events.filter(e => e.phase === 'replay' && e.kind === 'stroke').map(e => e.lineWidth / 2);
  const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
  const mid = radii.slice(Math.floor(radii.length * .4), Math.floor(radii.length * .6));
  const tail = radii.slice(-30);
  check('harai thins the end of the stroke', avg(tail) < avg(mid) * .3,
    'mid radius ' + avg(mid).toFixed(1) + ' px -> tail ' + avg(tail).toFixed(1) + ' px');
  check('harai ends on a hairline', radii[radii.length - 1] <= 1.2, 'last radius ' + radii[radii.length - 1].toFixed(2) + ' px');
}

// ------------------------------- 8. contact size must drive the stroke width
{
  // Compare whole uniform strokes: one light, one firm, one in between.  Before
  // calibration the 2-26 px window saturated at 26 px, so a fingertip was pinned at
  // full pressure and lightening the touch changed nothing at all.
  const t = boot({ recompute: false, harai: 0 });
  const steady = size => {
    const before = t.state.events.length;
    t.stroke({ y0: 100, steps: 110, slow: 5, fastFrom: 9999, size });
    const m = t.state.events.filter((e, i) => i >= before && e.phase === 'live' && e.kind === 'stroke');
    const tail = m.slice(Math.floor(m.length * .5));   // past the one-second entry ramp
    return { count: m.length, width: tail.length ? tail.reduce((s, e) => s + e.lineWidth, 0) / tail.length : 0 };
  };
  const light = steady(24.3);
  const firm = steady(170);
  const mid = steady(70);
  check('light contact draws a far thinner stroke than firm contact', firm.width > light.width * 4,
    'light ' + light.width.toFixed(1) + ' px vs firm ' + firm.width.toFixed(1) + ' px');
  check('a middling contact lands between the two',
    mid.width > light.width * 1.5 && mid.width < firm.width * .95,
    'light ' + light.width.toFixed(1) + ' / mid ' + mid.width.toFixed(1) + ' / firm ' + firm.width.toFixed(1));
  check('a light stroke still leaves continuous ink', light.count > 100, light.count + ' segments');
}

console.log('');
console.log(failures ? failures + ' CHECK(S) FAILED' : 'all checks passed');
process.exit(failures ? 1 : 0);
