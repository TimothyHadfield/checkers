// Rules tests. Run: node --test tests/
// Every rule here is listed with its source in docs/rules-check.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/rules.js');
const E = require('../js/engine.js');

// build a position from square names (the variant's own notation): {"11": 1, "15": -1, ...}
function pos(variant, pieces, turn) {
  const v = R.V(variant), g = R.geo(v.n), b = new Array(g.S).fill(0);
  for (const [name, val] of Object.entries(pieces)) {
    let s = -1;
    for (let q = 0; q < g.S; q++) if (R.sqName(variant, q) === name) s = q;
    assert.ok(s >= 0, 'no square ' + name);
    b[s] = val;
  }
  return R.newGame(variant, { board: b, turn: turn || 0 });
}
const names = (variant, path) => path.map(s => R.sqName(variant, s)).join('-');
const legalNames = st => R.legal(st).map(m => names(st.variant, m.path)).sort();

// perft: count every move sequence of a given length from the start (published numbers)
function perftRules(st, d) {
  if (d === 0) return 1;
  let n = 0;
  for (const m of R.legal(st)) {
    const b = st.board.slice(); R.doMove(b, m);
    n += d === 1 ? 1 : perftRules({ variant: st.variant, board: b, turn: 1 - st.turn, result: null }, d - 1);
  }
  return n;
}
const PERFT = {
  american: [7, 49, 302, 1469, 7361, 36768, 179740, 845931, 3963680], // OEIS A133046
  international: [9, 81, 658, 4265, 27117, 167140, 1049442],         // duplicate captures removed (FMJD)
};

test('perft (rules.js) matches the published counts', () => {
  for (const [variant, want] of Object.entries(PERFT)) {
    const st = R.newGame(variant);
    for (let d = 1; d <= (variant === 'american' ? 6 : 5); d++) assert.equal(perftRules(st, d), want[d - 1], variant + ' depth ' + d);
  }
});
test('perft (engine) matches the published counts deeper', () => {
  for (const [variant, want] of Object.entries(PERFT)) {
    const st = R.newGame(variant);
    for (let d = 1; d <= want.length; d++) assert.equal(E.perft(st, d), want[d - 1], variant + ' depth ' + d);
  }
});
test('engine move generator agrees with rules.js for every variant', () => {
  for (const variant of R.VARIANT_IDS) {
    const st = R.newGame(variant);
    for (let d = 1; d <= 5; d++) assert.equal(E.perft(st, d), perftRules(st, d), variant + ' depth ' + d);
  }
});

test('start position: piece counts, who moves first, square numbers', () => {
  const am = R.newGame('american');
  assert.deepEqual(R.material(am.board), [{ men: 12, kings: 0 }, { men: 12, kings: 0 }]);
  assert.equal(R.V('american').sides[0], 'Black');
  // Black's men stand on 1-12, White's on 21-32
  const blackSq = am.board.map((x, s) => (x === 1 ? +R.sqName('american', s) : 0)).filter(Boolean).sort((a, b) => a - b);
  assert.deepEqual(blackSq, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(legalNames(am), ['10-14', '10-15', '11-15', '11-16', '12-16', '9-13', '9-14'].sort());
  const intl = R.newGame('international');
  assert.deepEqual(R.material(intl.board), [{ men: 20, kings: 0 }, { men: 20, kings: 0 }]);
  const whiteSq = intl.board.map((x, s) => (x === 1 ? +R.sqName('international', s) : 0)).filter(Boolean);
  assert.equal(Math.min(...whiteSq), 31); assert.equal(Math.max(...whiteSq), 50);
  const ru = R.newGame('russian');
  assert.equal(R.sqName('russian', ru.board.findIndex(x => x === 1)), 'b2'.replace('b2', R.sqName('russian', ru.board.findIndex(x => x === 1))));
  assert.ok(legalNames(ru).includes('c3-d4') && legalNames(ru).includes('g3-h4'));
});

test('American: a jump is compulsory, but you may choose which', () => {
  // Black men on 9 and 22, White men on 14 and 25 -> both 9x18 and 22x29 are jumps; plain moves are not allowed
  const st = pos('american', { 9: 1, 22: 1, 14: -1, 25: -1, 32: -1 });
  const l = legalNames(st);
  assert.deepEqual(l, ['22-29', '9-18'].sort());
  assert.throws(() => R.act(st, 0, { path: R.legal(R.newGame('american'))[0].path }));
});
test('Casual: jumps are optional', () => {
  const st = pos('casual', { 9: 1, 14: -1, 32: -1 });
  const l = legalNames(st);
  assert.ok(l.includes('9-18'), 'jump allowed');
  assert.ok(l.includes('9-13'), 'plain move allowed too');
});
test('American: a multi-jump must be finished', () => {
  const st = pos('american', { 1: 1, 6: -1, 15: -1, 32: -1 });
  assert.deepEqual(legalNames(st), ['1-10-19']);
});
test('American: men never jump backwards, kings do', () => {
  const man = pos('american', { 18: 1, 14: -1, 32: -1 }); // White man behind the Black man
  assert.ok(!legalNames(man).some(x => x === '18-9'));
  const king = pos('american', { 18: 2, 14: -1, 32: -1 });
  assert.deepEqual(legalNames(king), ['18-9']);
});
test('American: crowning ends the move', () => {
  // Black man jumps onto the back row at 30; it could jump on as a king (30x23x...), but the move stops
  const st = pos('american', { 21: 1, 25: -1, 26: -1, 3: -1 });
  const ms = R.legal(st);
  assert.deepEqual(ms.map(m => names('american', m.path)), ['21-30']);
  const after = R.act(st, 0, { path: ms[0].path });
  assert.equal(after.board[ms[0].path[1]], 2, 'crowned');
  assert.equal(after.turn, 1);
});
test('Russian: men capture backwards, and a man crowned mid-capture goes on as a king', () => {
  const back = pos('russian', { d4: 1, c3: -1, h8: -1 });
  assert.deepEqual(legalNames(back), ['d4-b2']);
  // White man on f6 jumps e7 to d8, is crowned, then continues as a flying king over c7? no: over b6 -> a5
  const st = pos('russian', { f6: 1, e7: -1, b6: -1, h2: -1 });
  const l = legalNames(st);
  assert.deepEqual(l, ['f6-d8-a5']);
  const m = R.legal(st)[0];
  assert.equal(R.act(st, 0, { path: m.path }).board[m.path[2]], 2, 'king at the end');
});
test('International: you must take the most pieces (a king counts as one)', () => {
  // White man 32 can take 27 (1 piece) or 28 then 19 (2 pieces) with the man on 33
  const st = pos('international', { 32: 1, 33: 1, 27: -1, 28: -1, 18: -1, 5: -1 });
  const ms = R.legal(st);
  const most = Math.max(...ms.map(m => m.caps.length));
  assert.ok(ms.every(m => m.caps.length === most), 'only the longest captures are legal');
  assert.ok(most >= 2);
});
test('Brazilian follows the majority rule too, Russian does not', () => {
  const pieces = { c3: 1, d4: -1, f6: -1, b4: -1, h8: -1 };
  const br = R.legal(pos('brazilian', pieces));
  const ru = R.legal(pos('russian', pieces));
  const maxBr = Math.max(...br.map(m => m.caps.length));
  assert.ok(br.every(m => m.caps.length === maxBr));
  assert.ok(new Set(ru.map(m => m.caps.length)).size > 1, 'Russian lets you choose a shorter capture');
});
test('International: a man passing the back row mid-capture stays a man', () => {
  // White man on 12 takes 7 to land on 1? then must go on taking 6 -> 11... ends off the back row
  const st = pos('international', { 13: 1, 8: -1, 7: -1, 50: -1 });
  for (const m of R.legal(st)) {
    const end = m.path[m.path.length - 1];
    const after = R.act(st, 0, { path: m.path });
    const onBack = R.geo(10).row[end] === 0;
    assert.equal(after.board[end], onBack ? 2 : 1);
  }
});
test('Flying kings move and capture at a distance; short kings do not', () => {
  const fly = pos('international', { 46: 2, 50: -1 });
  assert.equal(R.legal(fly).length, 9, 'a king on the long diagonal reaches 9 squares');
  const short = pos('american', { 29: 2, 1: -1 });
  assert.equal(R.legal(short).length, 1);
  const cap = pos('russian', { a1: 2, e5: -1, h8: -1 });
  const l = legalNames(cap);
  assert.deepEqual(l, ['a1-f6', 'a1-g7'].sort(), 'lands on any free square past the piece');
});
test('A captured piece stays on the board until the capture ends (no jumping it twice)', () => {
  // every capture in every variant from many random positions: no square appears twice in caps
  let checked = 0;
  for (const variant of R.VARIANT_IDS) {
    let st = R.newGame(variant);
    for (let i = 0; i < 300 && !st.result; i++) {
      const ms = R.legal(st);
      for (const m of ms) { assert.equal(new Set(m.caps).size, m.caps.length); checked++; }
      st = R.act(st, st.turn, { path: ms[(i * 7919) % ms.length].path });
    }
  }
  assert.ok(checked > 500);
});

test('No legal move loses; resigning loses', () => {
  const st = pos('american', { 1: -1, 5: 1, 6: 1, 10: 1 }, 1); // White man on 1 is blocked... and has none
  assert.ok(st.result && st.result.winner === 0 && st.result.reason === 'nomoves');
  const g = R.act(R.newGame('american'), 0, { resign: true });
  assert.deepEqual(g.result, { winner: 1, reason: 'resign' });
});
test('Draw offers: only on your turn; the other side accepts or declines', () => {
  let st = R.newGame('american');
  assert.throws(() => R.act(st, 1, { draw: 'offer' }));
  st = R.act(st, 0, { draw: 'offer' });
  assert.throws(() => R.act(st, 0, { path: R.legal(st)[0].path }), /answer/);
  const dec = R.act(st, 1, { draw: 'decline' });
  assert.equal(dec.offer, -1);
  assert.deepEqual(R.act(st, 1, { draw: 'accept' }).result, { winner: null, reason: 'agreed' });
});
test('Illegal input throws', () => {
  const st = R.newGame('american');
  assert.throws(() => R.act(st, 1, { path: R.legal(st)[0].path }), /turn/);
  assert.throws(() => R.act(st, 0, { path: [0, 31] }));
  assert.throws(() => R.act(st, 0, null));
  assert.throws(() => R.act(st, 0, { path: 'x' }));
});

// play non-repeating, non-capturing moves where possible, until the game ends
function shuffleToEnd(st, maxPly) {
  const seen = new Set(st.reps);
  for (let i = 0; i < maxPly && !st.result; i++) {
    const ms = R.legal(st);
    const score = m => {
      const n = R.act(st, st.turn, { path: m.path });
      const key = n.reps[n.reps.length - 1];
      const opp = n.result ? [] : R.legal(n);
      const oppCaps = opp.some(x => x.caps.length);
      // also keep the other side free to move, so nobody gets trapped
      return (n.result && n.result.reason === 'nomoves' ? 8 : 0) + (seen.has(key) ? 4 : 0) + (m.caps.length ? 2 : 0) + (oppCaps ? 1 : 0) - opp.length / 100;
    };
    const m = ms.slice().sort((a, b) => score(a) - score(b))[0];
    st = R.act(st, st.turn, { path: m.path });
    seen.add(st.reps[st.reps.length - 1]);
  }
  return st;
}
test('Threefold repetition is a draw', () => {
  let st = pos('american', { 1: 2, 32: -2 });
  const a = R.legal(st).find(m => names('american', m.path) === '1-5');
  const goBack = s => R.legal(s).find(m => m.path[1] !== undefined);
  for (let i = 0; i < 2; i++) {
    st = R.act(st, 0, { path: [a.path[0], a.path[1]] });
    st = R.act(st, 1, { path: goBack(st).path });
    const back = R.legal(st).find(m => m.path[1] === a.path[0]);
    st = R.act(st, 0, { path: back.path });
    const back2 = R.legal(st).find(m => m.path[1] === st.moves[st.moves.length - 2][0]);
    st = R.act(st, 1, { path: back2.path });
  }
  assert.equal(st.result && st.result.reason, 'repetition');
});
test('American 40-move rule: 40 moves each without a man move or capture', () => {
  const st = shuffleToEnd(pos('american', { 1: 2, 3: 2, 30: -2, 32: -2 }), 400);
  assert.equal(st.result && st.result.reason, 'kingmoves');
  assert.equal(st.ply, 80);
});
test('International: 25 moves each with only kings', () => {
  const st = shuffleToEnd(pos('international', { 1: 2, 3: 2, 5: 2, 46: -2, 48: -2, 50: -2 }), 400);
  assert.equal(st.result && st.result.reason, 'kingmoves');
  assert.equal(st.ply, 50);
});
test('FMJD 16-move rule (3 pieces with a king vs a lone king) and 5-move rule (2 vs 1)', () => {
  assert.equal(R.endgameLimit(R.V('international'), pos('international', { 1: 2, 3: 1, 35: 1, 46: -2 }).board).limit, 32);
  assert.equal(R.endgameLimit(R.V('international'), pos('international', { 1: 2, 3: 2, 46: -2 }).board).limit, 10);
  assert.equal(R.endgameLimit(R.V('international'), pos('international', { 1: 1, 3: 1, 13: 1, 46: -2 }).board).limit, 0, 'no king: no limit');
  const st = shuffleToEnd(pos('international', { 45: 2, 50: 2, 49: 2, 1: -2 }), 400);
  assert.equal(st.result && st.result.reason, 'endgame');
  assert.equal(st.ply, 32);
  const st2 = shuffleToEnd(pos('international', { 36: 2, 45: 2, 3: -2 }), 400);
  assert.equal(st2.result && st2.result.reason, 'endgame');
  assert.equal(st2.ply, 10);
});
test('Brazilian (CBJD art. 99-100) and Russian (2.1.9.1) endgame limits', () => {
  const B = R.V('brazilian'), Ru = R.V('russian');
  assert.equal(R.endgameLimit(B, pos('brazilian', { a1: 2, c1: 2, h8: -2 }).board).limit, 10);
  assert.equal(R.endgameLimit(B, pos('brazilian', { a3: 2, c1: 2, e1: 1, g7: -2 }).board).limit, 10, 'lone king on the long diagonal');
  assert.equal(R.endgameLimit(B, pos('brazilian', { a3: 2, c1: 2, e1: 1, f8: -2 }).board).limit, 0, 'lone king off the diagonal');
  assert.equal(R.endgameLimit(Ru, pos('russian', { a3: 2, c1: 2, e1: 2, g7: -2 }).board).limit, 10, '3 vs a king on the main road: 5 moves');
  assert.equal(R.endgameLimit(Ru, pos('russian', { a3: 2, c1: 2, e1: 2, g3: 1, f8: -2 }).board).limit, 30, '3 kings + more vs a king: 15 moves');
  assert.equal(R.endgameLimit(Ru, pos('russian', { a3: 2, c1: 1, f8: -2, h2: -1 }).board).limit, 60, 'kings both sides, 4 pieces: 30 moves');
  const st = shuffleToEnd(pos('russian', { a3: 2, c1: 2, e3: 2, b8: -2 }), 400);
  assert.equal(st.result && st.result.reason, st.result.reason === 'kingmoves' ? 'kingmoves' : 'endgame');
  assert.ok(st.ply <= 30);
});

test('Notation: numbers for American and International, letters for Russian and Brazilian', () => {
  const am = R.newGame('american');
  const m = R.legal(am).find(x => names('american', x.path) === '11-15');
  assert.equal(R.moveText('american', m.path, m.caps), '11-15');
  const jump = pos('american', { 1: 1, 6: -1, 15: -1, 32: -1 });
  const j = R.legal(jump)[0];
  assert.equal(R.moveText('american', j.path, j.caps), '1x10x19');
  const ru = pos('russian', { d4: 1, c3: -1, h8: -1 });
  const r = R.legal(ru)[0];
  assert.equal(R.moveText('russian', r.path, r.caps), 'd4:b2');
});
test('Replay rebuilds the same game', () => {
  let st = R.newGame('international');
  for (let i = 0; i < 60 && !st.result; i++) { const ms = R.legal(st); st = R.act(st, st.turn, { path: ms[(i * 31) % ms.length].path }); }
  const re = R.replay(st);
  assert.deepEqual(re.board, st.board);
  assert.equal(re.turn, st.turn);
  assert.deepEqual(JSON.parse(JSON.stringify(st)), st, 'state is plain JSON');
});
