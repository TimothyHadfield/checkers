// Engine, levels and puzzles. Run: node --test "tests/*.test.*"
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/rules.js');
const E = require('../js/engine.js');
const L = require('../js/levels.js');
global.self = global;
require('../js/puzzles.js');
const P = global.CkPuzzles;

const board = s => s.split('').map(ch => 'kmeMK'.indexOf(ch) - 2);

test('the engine only ever plays legal moves (all variants, random positions)', () => {
  for (const variant of R.VARIANT_IDS) {
    let st = R.newGame(variant);
    for (let i = 0; i < 40 && !st.result; i++) {
      const r = E.think(st, { nodes: 3000, seed: i });
      assert.ok(R.findMove(st, r.move.path), variant + ' ply ' + i);
      const ms = R.legal(st);
      st = R.act(st, st.turn, { path: (i % 3 ? r.move : ms[(i * 13) % ms.length]).path });
    }
  }
});
test('two kings beat one king (American) against the best defence', () => {
  const b = new Array(32).fill(0);
  b[13] = 2; b[18] = 2; b[0] = -2;
  let st = R.newGame('american', { board: b, turn: 0 });
  E.clearTT();
  while (!st.result && st.ply < 120) st = R.act(st, st.turn, { path: E.think(st, { nodes: 60000 }).move.path });
  assert.equal(st.result && st.result.winner, 0, 'won in ' + st.ply + ' plies');
});
test('a time limit is respected', () => {
  const st = R.newGame('international');
  const t = Date.now();
  E.think(st, { ms: 300 });
  assert.ok(Date.now() - t < 1500, 'took ' + (Date.now() - t) + 'ms');
});
test('multi gives a score for every root move, best first', () => {
  const st = R.newGame('american');
  const r = E.think(st, { depth: 6, multi: true });
  assert.equal(r.roots.length, 7);
  assert.equal(Math.max(...r.roots.map(x => x.score)), r.score);
  assert.ok(R.samePath(r.roots.find(x => x.score === r.score).move.path, r.move.path) || r.roots.filter(x => x.score === r.score).length > 1);
});
test('levels: fixed search budgets, measured results stored', () => {
  assert.deepEqual(L.LEVELS.map(l => l.id), [1, 2, 3, 4, 5]);
  for (const l of L.LEVELS) assert.ok(l.opts.nodes || l.opts.depth, l.name + ' has a fixed budget, not a time limit');
  const m = L.MEASURED;
  assert.ok(m && m.gamesPerPair >= 20);
  for (const k of ['1v2', '2v3', '3v4', '4v5']) {
    const r = m.pairs[k];
    assert.equal(r.w + r.d + r.l, m.gamesPerPair);
    assert.ok(r.score < 0.5, k + ': the higher level scores more');
  }
});
test('Hard beats Beginner', () => {
  let score = 0;
  for (let g = 0; g < 2; g++) {
    let st = R.newGame('american');
    E.clearTT();
    const hard = g; // Hard plays side g
    while (!st.result && st.ply < 200) {
      const lv = L.byId(st.turn === hard ? 4 : 1);
      st = R.act(st, st.turn, { path: E.think(st, Object.assign({ seed: st.ply + g * 1000 }, lv.opts)).move.path });
    }
    score += !st.result || st.result.winner == null ? 0.5 : st.result.winner === hard ? 1 : 0;
  }
  assert.ok(score >= 1.5, 'Hard scored ' + score + '/2');
});
test('puzzles: every one is legal, has one clear answer, and the line plays out', () => {
  assert.ok(P.length >= 60, P.length + ' puzzles');
  for (const v of R.VARIANT_IDS) assert.ok(P.filter(p => p.v === v).length >= 10, v);
  const ids = new Set();
  for (const p of P) {
    assert.ok(!ids.has(p.id)); ids.add(p.id);
    let st = R.newGame(p.v, { board: board(p.b), turn: p.t });
    assert.ok(!st.result);
    assert.ok(R.legal(st).length >= 2, p.id + ' is not forced');
    for (const s of p.sol) assert.ok(R.findMove(st, s), p.id + ' solution is legal');
    assert.ok(p.sol.some(s => R.samePath(s, p.line[0])));
    for (const path of p.line) { assert.ok(R.findMove(st, path), p.id + ' line is legal'); st = R.act(st, st.turn, { path }); }
  }
});
test('puzzles: a deeper search agrees the answer is best', () => {
  let agree = 0;
  const sample = P.filter((_, i) => i % 4 === 0);
  for (const p of sample) {
    const st = R.newGame(p.v, { board: board(p.b), turn: p.t });
    const r = E.think(st, { nodes: 150000 });
    if (p.sol.some(s => R.samePath(s, r.move.path))) agree++;
  }
  assert.ok(agree >= sample.length * 0.9, agree + '/' + sample.length);
});
