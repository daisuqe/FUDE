// Quantised-contact test: feed the stepped sizes a real iPhone reports and
// measure how abruptly the computed pressure moves from sample to sample.
const fs = require('fs');
const vm = require('vm');

const SRC = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8')
  .match(/<script>([\s\S]*?)<\/script>/)[1];

const el0 = () => ({ classList: { add() {}, remove() {} }, textContent: '' });
function run(variant) {
  let clock = 1000;
  const log = [];
  const ctx = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : () => {}),
    set: (t, k, v) => { t[k] = v; return true; }
  });
  const makeCanvas = () => ({
    width: 300, height: 150, style: {}, _h: {},
    getContext: () => ctx,
    addEventListener(t, fn) { (this._h[t] = this._h[t] || []).push(fn); },
    setPointerCapture() {}, releasePointerCapture() {},
    dispatch(t, e) { for (const fn of (this._h[t] || [])) fn(e); }
  });
  const paper = makeCanvas();
  const notice = el0();
  const cellList = [0, 1, 2, 3, 4, 5].map(() => ({ textContent: '' }));
  const info = { hidden: true, querySelectorAll: () => cellList };
  const pressureLog = [], sizeLog = [];
  const el = extra => ({
    hidden: false, textContent: '', value: '0', checked: false, _h: {}, classList: { add() {}, remove() {} },
    addEventListener(t, fn) { (this._h[t] = this._h[t] || []).push(fn); },
    setAttribute() {}, removeAttribute() {}, ...extra
  });
  const elements = {
    '#notice': notice, '#contact-info': info, '#settings-close': el(), '#blank-paper': el(), '#reset-contact': el(),
    '#settings': el({ hidden: true }), '#waiting': el({ hidden: true }),
    '#pressure-balance': el({ value: '30' }), '#moisture': el({ value: '100' }),
    '#thickness': el({ value: '50' }), '#speed-thinness': el({ value: '85' }),
    '#brush-angle': el({ value: '25' }), '#harai-duration': el({ value: '0' }),
    '#final-recompute': el({ checked: false }), '#show-contact': el({ checked: true })
  };
  const sandbox = {
    console, devicePixelRatio: 2, innerWidth: 375, innerHeight: 812,
    document: { body: el(), querySelector: s => (s === '#paper' ? paper : elements[s]), createElement: makeCanvas },
    addEventListener() {}, matchMedia: () => ({ matches: false }),
    performance: { now: () => clock },
    requestAnimationFrame() {}, setTimeout: () => 0, clearTimeout() {}, confirm: () => true,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);

  // Real reported steps: 24.3 x k.  Light -> press through 3 steps -> release.
  const plan = [24.3, 24.3, 24.3, 24.3, 48.6, 48.6, 48.6, 97.2, 97.2, 97.2, 97.2, 170, 170, 170, 170, 170,
    97.2, 97.2, 97.2, 48.6, 48.6, 48.6, 24.3, 24.3, 24.3, 24.3];
  const mk = (type, y, size) => ({ type, pointerId: 1, pointerType: 'touch', clientX: 180, clientY: y,
    width: size, height: size, pressure: .5, timeStamp: clock, preventDefault() {} });
  let y = 100;
  paper.dispatch('pointerdown', mk('pointerdown', y, plan[0]));
  const frames = variant === 'sparse' ? 16 : 16;
  for (const size of plan) {
    for (let r = 0; r < 4; r++) {                // 4 samples (~64 ms) per reported step
      clock += frames; y += 4;
      paper.dispatch('pointermove', mk('pointermove', y, size));
      pressureLog.push(Number(cellList[3].textContent));
      sizeLog.push(Number(cellList[1].textContent.split('>')[1]));
    }
  }
  return { pressures: pressureLog, sizes: sizeLog, log };
}

const r = run('dense');
const jumps = r.pressures.slice(1).map((v, i) => Math.abs(v - r.pressures[i]));
const distinct = new Set(r.pressures.map(v => v.toFixed(2))).size;
const maxJump = Math.max(...jumps);
console.log('samples:', r.pressures.length, ' distinct pressure values:', distinct);
console.log('largest single-sample pressure jump:', maxJump.toFixed(3));
console.log('pressure trace:', r.pressures.filter((_, i) => i % 4 === 0).map(v => v.toFixed(2)).join(' '));
console.log('smoothed size :', r.sizes.filter((_, i) => i % 4 === 0).map(v => v.toFixed(0)).join(' '));

let bad = 0;
const check = (n, ok, d) => { console.log((ok ? '  PASS  ' : '  FAIL  ') + n + (d ? '   ' + d : '')); if (!ok) bad++; };
check('pressure moves in ramps, not steps', maxJump < .18, 'max jump ' + maxJump.toFixed(3));
check('pressure takes many intermediate values', distinct > 25, distinct + ' distinct values');
check('light and firm are still clearly different',
  Math.max(...r.pressures) - Math.min(...r.pressures) > .5,
  'range ' + Math.min(...r.pressures).toFixed(2) + '..' + Math.max(...r.pressures).toFixed(2));
process.exit(bad ? 1 : 0);
