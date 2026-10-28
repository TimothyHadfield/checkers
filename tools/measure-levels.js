/* Measure the computer levels head to head.
   node tools/measure-levels.js [gamesPerPair=40] [variant=american] [threads=cpus-2]
   Each pair plays random 4-ply openings twice (colours swapped). Writes tools/measured-<variant>.json. */
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');
const fs = require('fs');
const os = require('os');
const R = require('../js/rules.js');
const E = require('../js/engine.js');
const L = require('../js/levels.js');

function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function playGame(variant, la, lb, seed, aFirst) {
  const r = rng(seed);
  let st = R.newGame(variant);
  // random opening (4 plies), same for both colour assignments of this seed
  for (let i = 0; i < 4 && !st.result; i++) { const ms = R.legal(st); st = R.act(st, st.turn, { path: ms[Math.floor(r() * ms.length)].path }); }
  E.clearTT();
  const lvl = side => (aFirst === (side === 0) ? la : lb);
  let ply = 0;
  while (!st.result && ply < 220) {
    // the same options the page uses (including the strong levels' opening variety)
    const out = E.think(st, L.optsFor(lvl(st.turn), st, seed * 1000 + ply));
    st = R.act(st, st.turn, { path: out.move.path });
    ply++;
  }
  const w = st.result ? st.result.winner : null;
  if (w === null || w === undefined) return 0.5;
  const aSide = aFirst ? 0 : 1;
  return w === aSide ? 1 : 0;
}

if (!isMainThread) {
  const { jobs } = workerData;
  for (const j of jobs) {
    const s = playGame(j.variant, j.a, j.b, j.seed, j.aFirst);
    parentPort.postMessage({ key: j.key, s });
  }
  parentPort.postMessage({ done: true });
} else {
  const games = +process.argv[2] || 40;
  const variant = process.argv[3] || 'american';
  const threads = +process.argv[4] || Math.max(1, os.cpus().length - 2);
  const ALL = [[1, 2], [2, 3], [3, 4], [4, 5], [3, 5], [1, 5]];
  // optional 5th arg "2v3,3v4": re-measure only those pairs and keep the rest of the saved file
  const only = process.argv[5] ? process.argv[5].split(',').map(k => k.split('v').map(Number)) : null;
  const pairs = only || ALL;
  const jobs = [];
  for (const [a, b] of pairs) for (let g = 0; g < games; g++) jobs.push({ key: a + 'v' + b, variant, a, b, seed: 1000 + Math.floor(g / 2), aFirst: g % 2 === 0 });
  // spread the slow pairs across threads
  const buckets = Array.from({ length: threads }, () => []);
  jobs.forEach((j, i) => buckets[i % threads].push(j));
  const res = {};
  let live = threads, n = 0;
  const t0 = Date.now();
  for (const b of buckets) {
    const w = new Worker(__filename, { workerData: { jobs: b } });
    w.on('message', m => {
      if (m.done) {
        if (--live === 0) finish();
        return;
      }
      const r = res[m.key] || (res[m.key] = { w: 0, d: 0, l: 0 });
      if (m.s === 1) r.w++; else if (m.s === 0) r.l++; else r.d++;
      if (++n % 20 === 0) console.error(n + '/' + jobs.length + ' games, ' + Math.round((Date.now() - t0) / 1000) + 's');
    });
    w.on('error', e => { console.error(e); process.exit(1); });
  }
  function finish() {
    const file = path.join(__dirname, 'measured-' + variant + '.json');
    let old = null;
    try { old = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { old = null; }
    const out = { variant, gamesPerPair: games, date: new Date().toISOString().slice(0, 10), pairs: {} };
    if (only && old) for (const [a, b] of ALL) if (old.pairs[a + 'v' + b]) out.pairs[a + 'v' + b] = old.pairs[a + 'v' + b];
    for (const [a, b] of pairs) {
      const r = res[a + 'v' + b];
      const score = (r.w + r.d / 2) / (r.w + r.d + r.l);
      out.pairs[a + 'v' + b] = Object.assign({ score: Math.round(score * 1000) / 1000 }, r);
    }
    fs.writeFileSync(file, JSON.stringify(out, null, 1));
    console.log(JSON.stringify(out, null, 1));
    console.error('done in ' + Math.round((Date.now() - t0) / 1000) + 's');
  }
}
