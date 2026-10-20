// Checkers behind the shared online module's game interface (_online/README.md §2, §6).
// Run: node --test "tests/*.test.*"
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createLocal } from '../js/online.js';
const require = createRequire(import.meta.url);
const { game, sideOf, seatOf } = require('../js/online-game.js');
const R = require('../js/rules.js');
const clone = x => JSON.parse(JSON.stringify(x));
function rng(a) { return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

test('bot vs bot through JSON copies, every variant, both seat orders', () => {
  for (const variant of R.VARIANT_IDS) for (const swap of [0, 1]) {
    let s = game.setup(2, { variant, swap, level: 1 }, rng(3), [{ name: 'A' }, { name: 'B' }]);
    assert.equal(JSON.stringify(clone(s)), JSON.stringify(s));
    let moves = 0;
    while (!game.isOver(s) && moves < 300) {
      const toAct = game.toAct(s);
      assert.equal(toAct.length, 1);
      const seat = toAct[0];
      assert.equal(sideOf(s, seat), s.g.turn, 'the seat to act plays the side to move');
      const ctx = { pub: game.publicView(s), mine: game.privateView(s, seat), state: s };
      s = game.apply(clone(s), seat, clone(game.bot(ctx, seat, rng(moves))));
      moves++;
    }
    if (game.isOver(s)) assert.deepEqual(game.toAct(s), []);
    assert.deepEqual(R.replay(s.g).board, s.g.board, variant + ': the move list replays');
  }
});
test('apply rejects moves out of turn, illegal moves and junk', () => {
  const s = game.setup(2, { variant: 'american', swap: 1 }, rng(1), []);
  const first = R.legal(s.g)[0].path;
  assert.equal(seatOf(s, 0), 1);
  assert.throws(() => game.apply(clone(s), 0, { path: first }), /turn/);
  assert.ok(game.apply(clone(s), 1, { path: first }).g.ply === 1);
  assert.throws(() => game.apply(clone(s), 1, { path: [0, 31] }));
  assert.throws(() => game.apply(clone(s), 1, { path: ['a', 'b'] }));
  assert.throws(() => game.apply(clone(s), 1, { foo: 1 }));
  assert.throws(() => game.apply(clone(s), 2, { path: first }));
  assert.throws(() => game.apply(clone(s), 1, null));
});
test('draw offer goes to the other seat; the bot answers it', () => {
  let s = game.setup(2, { variant: 'american' }, rng(1), []);
  s = game.apply(clone(s), 0, { draw: 'offer' });
  assert.deepEqual(game.toAct(s), [1]);
  const a = game.bot({ pub: s, mine: {}, state: s }, 1, rng(2));
  assert.ok(a.draw === 'accept' || a.draw === 'decline');
  s = game.apply(clone(s), 1, a);
  assert.ok(a.draw === 'accept' ? game.isOver(s) : s.g.offer === -1);
});
test('resigning ends the game for both seats', () => {
  let s = game.setup(2, { variant: 'russian' }, rng(1), []);
  s = game.apply(clone(s), 1, { resign: true });
  assert.ok(game.isOver(s));
  assert.equal(s.g.result.winner, sideOf(s, 0));
});
test('createLocal: two computer seats play to the end', async () => {
  const room = createLocal({ game, seats: ['computer', 'computer'], options: { variant: 'casual', level: 1 }, botDelayMs: 0 });
  const done = new Promise(res => room.on('change', snap => { if (snap.status === 'finished') res(snap); }));
  room.start();
  const snap = await Promise.race([done, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 120000))]);
  assert.ok(snap.pub.g.result);
});
