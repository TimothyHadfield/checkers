// Improvement pass (2026-10-27): ballot openings, opening variety, share links, My stats glue, ladder.
// Run: node --test "tests/*.test.*"
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/rules.js');
const E = require('../js/engine.js');
const L = require('../js/levels.js');
const O = require('../js/openings.js');
const SH = require('../js/share.js');
const PK = require('../js/profile-ck.js');

const play = (st, line) => line.reduce((s, p) => R.act(s, s.turn, { path: p }), st);

test('3-move ballot: every opening is three legal moves from the start, no repeats, White to move after', () => {
  assert.ok(O.BALLOT.length >= 100 && O.BALLOT.length <= 302, O.BALLOT.length + ' openings');
  const seen = new Set();
  for (const line of O.BALLOT) {
    assert.equal(line.length, 3);
    const st = play(R.newGame('american'), line);
    assert.equal(st.turn, 1);
    assert.ok(!st.result);
    const k = JSON.stringify(line); assert.ok(!seen.has(k)); seen.add(k);
    // casual (jumps optional) accepts every ballot line too
    play(R.newGame('casual'), line);
  }
});

test('Hard and Expert vary their opening moves; the lower levels keep their own noise', () => {
  const st = R.newGame('american');
  for (const id of [4, 5]) {
    const o = L.optsFor(id, st, 7);
    assert.ok(o.multi && o.noise > 0 && o.noise <= 15, 'level ' + id + ' varies in the opening');
    assert.equal(o.nodes, L.byId(id).opts.nodes, 'same budget');
    const late = L.optsFor(id, Object.assign({}, st, { ply: L.VARY_PLIES }), 7);
    assert.ok(!late.multi && !late.noise, 'level ' + id + ' plays its best after the opening');
  }
  assert.equal(L.optsFor(1, st, 1).noise, 140);
  assert.equal(L.optsFor(2, st, 1).noise, 45);
  assert.equal(L.optsFor(3, Object.assign({}, st, { ply: 30 }), 1).noise, 15, 'Medium: small noise all game');
  // Hard's first move from the start differs between seeds (not one fixed game)
  const firsts = new Set();
  for (let seed = 1; seed <= 8; seed++) { E.clearTT(); firsts.add(JSON.stringify(E.think(st, L.optsFor(4, st, seed)).move.path)); }
  assert.ok(firsts.size >= 2, 'Hard opened with ' + firsts.size + ' different moves in 8 games');
});

test('ladder: each level scores at least 65% against the one below (measured, stored in levels.js)', () => {
  const m = L.MEASURED.pairs;
  for (const k of ['1v2', '2v3', '3v4']) assert.ok(1 - m[k].score >= 0.65, k + ': ' + Math.round((1 - m[k].score) * 100) + '%');
  assert.ok(1 - m['4v5'].score > 0.5, 'Expert beats Hard');
});

test('share link: a whole game survives encode -> decode (all rule sets, resign, agreed draw, custom start)', () => {
  for (const variant of R.VARIANT_IDS) {
    let st = R.newGame(variant);
    for (let i = 0; i < 70 && !st.result; i++) { const ms = R.legal(st); st = R.act(st, st.turn, { path: ms[(i * 7 + 3) % ms.length].path }); }
    const back = SH.decode(SH.encode(st));
    assert.deepEqual(back.moves, st.moves, variant);
    assert.deepEqual(back.board, st.board);
    assert.deepEqual(back.result, st.result);
  }
  let st = R.act(play(R.newGame('american'), O.BALLOT[0]), 1, { resign: true });
  assert.deepEqual(SH.decode(SH.encode(st)).result, st.result);
  st = R.newGame('american'); st = R.act(st, 0, { draw: 'offer' }); st = R.act(st, 1, { draw: 'accept' });
  assert.equal(SH.decode(SH.encode(st)).result.reason, 'agreed');
  const custom = R.newGame('american', { board: R.newGame('american').board.map((x, i) => (i % 5 ? x : 0)), turn: 1 });
  const c2 = play(custom, [R.legal(custom)[0].path]);
  assert.deepEqual(SH.decode(SH.encode(c2)).board, c2.board);
  assert.equal(SH.decode('nope~~0~~'), null);
  assert.equal(SH.decode('american~~0~zz.zz~').moves.length, 0, 'bad move numbers stop the replay');
});

test('My stats: helped games are not rated, guided games never count, quitting after a move is a loss', () => {
  let st = R.newGame('american');
  st = R.act(st, 0, { path: R.legal(st)[0].path });
  st = R.act(st, 1, { resign: true });
  const g = { st, mode: 'computer', level: 4, my: 0 };
  assert.deepEqual([PK.profileResult(g).mode, PK.profileResult(g).level, PK.profileResult(g).won], ['computer', 'hard', true]);
  assert.equal(PK.profileResult(Object.assign({}, g, { helped: true })).mode, 'help');
  assert.equal(PK.profileResult(Object.assign({}, g, { helped: true })).level, null);
  assert.equal(PK.profileResult(Object.assign({}, g, { guided: true })), null);
  assert.equal(PK.profileResult(Object.assign({}, g, { mode: 'two' })).won, null);
  // quitting
  let q = R.newGame('american');
  assert.equal(PK.quitResult({ st: q, mode: 'computer', level: 3, my: 0 }), null, 'no move yet: free');
  q = R.act(q, 0, { path: R.legal(q)[0].path });
  const lost = PK.quitResult({ st: q, mode: 'computer', level: 3, my: 0 });
  assert.equal(lost.won, false); assert.equal(lost.level, 'medium');
  assert.equal(PK.quitResult({ st: q, mode: 'computer', level: 3, my: 0, guided: true }), null);
  assert.equal(PK.quitResult({ st: q, mode: 'two', level: 3, my: 0 }), null);
  // the ballot's three moves aren't yours
  const b = play(R.newGame('american'), O.BALLOT[5]);
  assert.equal(PK.quitResult({ st: b, mode: 'computer', level: 3, my: 0, book: 3 }), null);
});

test('My stats: level ratings rise with the ladder; Daily setup is the same for the same day', () => {
  const r = PK.levelRatings(L);
  assert.deepEqual(r.map(x => x.id), ['beginner', 'easy', 'medium', 'hard', 'expert']);
  for (let i = 1; i < r.length; i++) assert.ok(r[i].rating > r[i - 1].rating, r[i].name);
  const seeded = s => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  assert.deepEqual(PK.dailySetup(seeded(42)), PK.dailySetup(seeded(42)));
  const d = PK.dailySetup(seeded(42));
  assert.equal(d.opening.length, 3);
  play(R.newGame('american'), d.opening);
  const facts = PK.gameFacts(play(R.newGame('american'), O.BALLOT[0]), 0);
  assert.equal(facts.lost, 0); assert.equal(facts.kings, 0);
});
