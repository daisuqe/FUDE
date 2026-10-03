// Shape regression: the stroke must be one continuous, smooth, leaf-shaped body.
const { run, profileOf } = require('./leaf.js');
let bad = 0;
const check = (n, ok, d) => { console.log((ok ? '  PASS  ' : '  FAIL  ') + n + (d ? '   ' + d : '')); if (!ok) bad++; };

const real = { dt: 8, jitter: .4, speed: 1.5 };
const segsOf = (r, phase) => r.ink.filter(i => i.phase === phase && i.kind === 'seg');
const rad = s => s.w / 2;
const CEILING = 1.15 * 20 * 1.0;                 // MAX_INK_RADIUS_SCALE * ROOT_RADIUS * thickness(1.0)

// -------------------------------------------------- live, light -> max -> fade
{
  const r = run({ ...real, recompute: false });
  const segs = segsOf(r, 'live');
  const radii = segs.map(rad);
  const p = profileOf(r, 'live');
  const maxR = Math.max(...radii);
  let maxStep = 0;
  for (let i = 1; i < radii.length; i++) maxStep = Math.max(maxStep, Math.abs(radii[i] - radii[i - 1]));
  // the body keeps at least 55 % of its width right up to where it starts to fall away
  const peakAt = radii.indexOf(maxR);
  const afterPeakEarly = radii.slice(peakAt, Math.floor(radii.length * .85));
  const neck = Math.min(...afterPeakEarly) / maxR;
  check('live: no empty gaps inside the stroke', p.gaps === 0, p.gaps + ' empty bins');
  check('live: starts as a fine point', radii[0] <= 1.2, 'first radius ' + radii[0].toFixed(2) + ' px');
  check('live: swells to a full body', maxR > 11 && maxR <= CEILING + .01, 'max radius ' + maxR.toFixed(1) + ' px (ceiling ' + CEILING + ')');
  check('live: outline changes smoothly (no beads)', maxStep < .9, 'largest step ' + maxStep.toFixed(2) + ' px');
  check('live: no neck between swelling and fading', neck > .55, 'narrowest ' + (neck * 100).toFixed(0) + ' % of max');
  check('live: fades back to a thin end', radii.slice(-8).every(v => v < 6), 'last radii ' + radii.slice(-3).map(v => v.toFixed(1)).join(' '));
}

// ----------------------------------------------- replay with harai, same input
{
  const live = run({ ...real, recompute: false, seed: 5 });
  const rep = run({ ...real, recompute: true, harai: 30, seed: 5 });
  const ls = segsOf(live, 'live'), rs = segsOf(rep, 'replay');
  const radii = rs.map(rad);
  const p = profileOf(rep, 'replay');
  let maxStep = 0;
  for (let i = 1; i < radii.length; i++) maxStep = Math.max(maxStep, Math.abs(radii[i] - radii[i - 1]));
  const startGap = Math.abs(rs[0].x0 - ls[0].x0);
  const endX = rs[rs.length - 1].x1;
  check('replay: no empty gaps inside the stroke', p.gaps === 0, p.gaps + ' empty bins');
  check('replay: starts where the live stroke starts', startGap < 12, 'start differs by ' + startGap.toFixed(1) + ' px');
  check('replay: outline changes smoothly (no beads)', maxStep < .9, 'largest step ' + maxStep.toFixed(2) + ' px');
  check('replay: harai ends on a hairline', radii[radii.length - 1] <= .6, 'last radius ' + radii[radii.length - 1].toFixed(2) + ' px');
  check('replay: the ink reaches the finger\'s end', endX > rep.x1 - 25, 'ink ends at ' + endX.toFixed(0) + ', finger at ' + rep.x1.toFixed(0));
}

// -------------------------------------- the lightest touch stays a fine line
{
  const r = run({ ...real, recompute: false, length: 200, profile: () => 24.3 });
  const radii = segsOf(r, 'live').map(rad);
  const tail = radii.slice(Math.floor(radii.length * .5));
  const avg = tail.reduce((s, v) => s + v, 0) / tail.length;
  check('lightest touch is a fine line, not a band', avg < 4, 'mean radius ' + avg.toFixed(1) + ' px');
}

// ------------------------------------------------ the entry: short, from the touch
{
  const firm = { profile: () => 170.1, length: 400, recompute: true, harai: 0 };
  const starts = [], halves = [];
  for (const speed of [1.5, 3, 6]) {
    const r = run({ dt: 8, jitter: .4, speed, ...firm });
    const segs = segsOf(r, 'replay');
    const radii = segs.map(rad);
    const maxR = Math.max(...radii);
    const half = segs.find((s, i) => radii[i] >= maxR * .5);
    starts.push(Math.abs(segs[0].x0 - r.x0));
    halves.push(half.x1 - segs[0].x0);
  }
  check('entry: the ink starts at the touch point', Math.max(...starts) < 6, 'offsets ' + starts.map(v => v.toFixed(1)).join(', ') + ' px');
  check('entry: half width within 40 px of the start', Math.max(...halves) < 40, 'at ' + halves.map(v => v.toFixed(0)).join(', ') + ' px (slow, medium, fast)');
  check('entry: the same length at any speed', Math.max(...halves) - Math.min(...halves) < 12,
    'spread ' + (Math.max(...halves) - Math.min(...halves)).toFixed(0) + ' px');
}

// ------------------------------------------- the ink reaches where the finger lifted
{
  for (const [label, cfg, phase] of [
    ['live', { ...real, recompute: false }, 'live'],
    ['replay, no harai', { ...real, recompute: true, harai: 0 }, 'replay']]) {
    const r = run(cfg);
    const segs = segsOf(r, phase);
    const gap = Math.abs(segs[segs.length - 1].x1 - r.x1);
    check('lift: ' + label + ' ink ends at the lift point', gap < 6, 'ends ' + gap.toFixed(1) + ' px from it');
  }
}

// ----------------------------------------------------- moisture (the stray hairs)
{
  const hard = { ...real, length: 300, profile: () => 170.1, recompute: false };
  const turn = (k, n, x0, y0, speed) => { const s = k * speed; return s < 150 ? { x: x0 + s, y: y0 } : { x: x0 + 150, y: y0 + (s - 150) }; };
  const corner = { ...real, length: 290, path: turn, profile: () => 110, recompute: false };
  // A stray is a hairline laid beside a body that is itself many pixels wide.
  const thin = (r, from, to) => {
    const segs = segsOf(r, 'live');
    return segs.slice(from, segs.length - to).filter(s => s.w < 1.5).length;
  };
  const wet = run({ ...hard, moisture: 100 });
  const dry = run({ ...hard, moisture: 10 });
  const mid = run({ ...hard, moisture: 55 });
  const wetN = thin(wet, 90, 90), midN = thin(mid, 90, 90), dryN = thin(dry, 90, 90);
  check('moisture: a wet brush leaves no stray hairs', wetN === 0, wetN + ' hairline segments');
  check('moisture: a dry brush frays when pressed hard', dryN > 100, dryN + ' hairline segments');
  check('moisture: more dryness, more strays', dryN > midN && midN > wetN, 'wet ' + wetN + ' < mid ' + midN + ' < dry ' + dryN);
  const dryCorner = run({ ...corner, moisture: 20 });
  const wetCorner = run({ ...corner, moisture: 100 });
  const cornerN = thin(dryCorner, 60, 20), cornerWet = thin(wetCorner, 60, 20);
  check('moisture: a dry brush frays at a sharp turn', cornerN > 40 && cornerWet === 0, 'dry ' + cornerN + ', wet ' + cornerWet);
  // the stray hairs must stay beside the body, not scatter across the page
  const spread = (r) => {
    const ys = segsOf(r, 'live').flatMap(s => [s.y0, s.y1]);
    return Math.max(...ys) - Math.min(...ys);
  };
  check('moisture: strays stay near the body', spread(dry) < 80, 'stroke band ' + spread(dry).toFixed(0) + ' px tall');
}

console.log('');
console.log(bad ? bad + ' CHECK(S) FAILED' : 'all shape checks passed');
process.exit(bad ? 1 : 0);
