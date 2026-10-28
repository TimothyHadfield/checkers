// Wave-3 rule sets: Pool, Italian, Spanish and the American "kings fly" house rule.
// Sources and wording: docs/rules-check.md. Positions use the board's own rows/columns
// (row 0 = top of the screen, side 0 sits at the bottom and moves up), so the tests don't depend on notation.
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/rules.js');
const E = require('../js/engine.js');

const sq = (variant, r, c) => { const g = R.geo(R.V(variant).n), s = g.idx[r * g.n + c]; assert.ok(s >= 0, 'not a dark square ' + r + ',' + c); return s; };
function at(variant, pieces, turn) { // pieces: [[r, c, value], ...]
  const g = R.geo(R.V(variant).n), b = new Array(g.S).fill(0);
  for (const [r, c, x] of pieces) b[sq(variant, r, c)] = x;
  return R.newGame(variant, { board: b, turn: turn || 0 });
}
const rc = (variant, s) => R.geo(R.V(variant).n).rc[s].join(',');
const paths = st => R.legal(st).map(m => m.path.map(s => rc(st.variant, s)).join(' ')).sort();
// the engine's own move generator must give the same number of moves as rules.js, a few plies deep
function agree(st) {
  const perftRules = (s, d) => { let n = 0; for (const m of R.legal(s)) { const b = s.board.slice(); R.doMove(b, m); n += d === 1 ? 1 : perftRules({ variant: s.variant, board: b, turn: 1 - s.turn, result: null }, d - 1); } return n; };
  for (let d = 1; d <= 3; d++) assert.equal(E.perft(st, d), perftRules(st, d), st.variant + ' perft depth ' + d);
}

test('new rule sets exist with the right first mover and board', () => {
  for (const id of ['pool', 'italian', 'spanish', 'flykings']) assert.ok(R.VARIANTS[id] && R.VARIANT_IDS.includes(id), id);
  assert.equal(R.V('pool').sides[0], 'Black');
  assert.equal(R.V('italian').sides[0], 'White');
  assert.equal(R.V('spanish').sides[0], 'White');
  assert.equal(R.V('flykings').sides[0], 'Black');
  for (const id of ['pool', 'italian', 'spanish', 'flykings']) assert.deepEqual(R.material(R.newGame(id).board), [{ men: 12, kings: 0 }, { men: 12, kings: 0 }]);
});

test('engine move generator agrees with rules.js from the start (every new rule set, 5 plies)', () => {
  for (const id of ['pool', 'italian', 'spanish', 'flykings']) {
    const st = R.newGame(id);
    const perftRules = (s, d) => { let n = 0; for (const m of R.legal(s)) { const b = s.board.slice(); R.doMove(b, m); n += d === 1 ? 1 : perftRules({ variant: s.variant, board: b, turn: 1 - s.turn, result: null }, d - 1); } return n; };
    for (let d = 1; d <= 5; d++) assert.equal(E.perft(st, d), perftRules(st, d), id + ' depth ' + d);
  }
});

// ---------------------------------------------------------------- Italian
test('Italian: a man may not capture a king (it may capture a man)', () => {
  const kingThere = at('italian', [[5, 2, 1], [4, 3, -2], [0, 1, -1]]);
  assert.deepEqual(paths(kingThere), ['5,2 4,1']);
  agree(kingThere);
  const manThere = at('italian', [[5, 2, 1], [4, 3, -1], [0, 1, -1]]);
  assert.deepEqual(paths(manThere), ['5,2 3,4']);
});
test('Italian: with equal captures you must capture with the king', () => {
  const st = at('italian', [[5, 2, 1], [4, 3, -1], [5, 6, 2], [4, 5, -1], [0, 1, -1]]);
  assert.deepEqual(paths(st), ['5,6 3,4']);
  agree(st);
  const am = at('american', [[5, 2, 1], [4, 3, -1], [5, 6, 2], [4, 5, -1], [0, 1, -1]]);
  assert.equal(paths(am).length, 2, 'American lets you choose');
});
test('Italian: you must take the most pieces first (a man taking 2 beats a king taking 1)', () => {
  // man 6,1 x 5,2 -> 4,3 x 3,4 -> 2,5 takes two; king 5,6 x 6,5 -> 7,4 takes one
  const st = at('italian', [[6, 1, 1], [5, 2, -1], [3, 4, -1], [5, 6, 2], [6, 5, -1], [0, 1, -1]]);
  assert.deepEqual(paths(st), ['6,1 4,3 2,5']);
  agree(st);
});
test('Italian: then the capture that takes the most kings', () => {
  const st = at('italian', [[5, 4, 2], [4, 5, -1], [4, 3, -2], [0, 1, -1]]);
  assert.deepEqual(paths(st), ['5,4 3,2']);
  agree(st);
});
test('Italian: then the capture that meets a king first', () => {
  const st = at('italian', [[7, 2, 2], [6, 3, -2], [4, 5, -1], [6, 1, -1], [4, 1, -2], [0, 7, -1]]);
  assert.deepEqual(paths(st), ['7,2 5,4 3,6']);
  agree(st);
});
test('Italian: kings move one square; men move and capture forward only', () => {
  const st = at('italian', [[4, 3, 2], [0, 1, -1]]);
  assert.equal(R.legal(st).length, 4);
  const back = at('italian', [[3, 4, 1], [4, 3, -1], [0, 1, -1]]);
  assert.ok(R.legal(back).every(m => !m.caps.length), 'no backward capture');
});
test('Italian and Spanish boards are mirrored: the bottom-right corner is a playing square', () => {
  assert.ok(R.V('italian').mirror && R.V('spanish').mirror && !R.V('american').mirror);
  // our bottom-left playing square shows on the right: it is h1 in Italian, a1 nowhere
  assert.equal(R.sqName('italian', sq('italian', 7, 0)), 'h1');
  assert.equal(R.sqName('spanish', sq('spanish', 7, 6)), 'b1');
});

// ---------------------------------------------------------------- Spanish
test('Spanish: kings fly, men capture forward only', () => {
  const st = at('spanish', [[7, 0, 2], [3, 4, -1], [0, 7, -1]]);
  assert.deepEqual(paths(st), ['7,0 2,5', '7,0 1,6'].sort(), 'flying capture from far away, landing anywhere past');
  agree(st);
  const back = at('spanish', [[3, 4, 1], [4, 3, -1], [0, 1, -1]]);
  assert.ok(R.legal(back).every(m => !m.caps.length));
});
test('Spanish: most pieces first, then most kings', () => {
  const kings = at('spanish', [[5, 4, 2], [4, 5, -1], [3, 2, -2], [0, 7, -1]]);
  // king 5,4 can take the man on 4,5 or (flying) the king on 3,2 -> must take the king
  assert.ok(paths(kings).every(p => p.startsWith('5,4 2,1') || p.startsWith('5,4 1,0')), paths(kings).join(' | '));
  agree(kings);
});

// ---------------------------------------------------------------- Pool
test('Pool: capture is forced but you may choose any capture (not the longest)', () => {
  const st = at('pool', [[6, 7, 1], [5, 6, -1], [3, 4, -1], [5, 0, 1], [4, 1, -1], [0, 1, -1]]);
  assert.deepEqual(paths(st), ['5,0 3,2', '6,7 4,5 2,3'].sort());
  agree(st);
  const br = at('brazilian', [[6, 7, 1], [5, 6, -1], [3, 4, -1], [5, 0, 1], [4, 1, -1], [0, 1, -1]]);
  assert.deepEqual(paths(br), ['6,7 4,5 2,3'], 'Brazilian must take the most');
});
test('Pool: men capture backwards; a man passing the far row mid-capture stays a man', () => {
  const back = at('pool', [[3, 2, 1], [4, 3, -1], [0, 7, -1]]);
  assert.deepEqual(paths(back), ['3,2 5,4']);
  const pass = at('pool', [[2, 1, 1], [1, 2, -1], [1, 4, -1], [7, 0, -1]]);
  const ms = R.legal(pass);
  assert.deepEqual(paths(pass), ['2,1 0,3 2,5']);
  assert.equal(ms[0].crown, false);
  agree(pass);
  const ru = at('russian', [[2, 1, 1], [1, 2, -1], [1, 4, -1], [7, 0, -1]]);
  assert.ok(R.legal(ru).every(m => m.crown), 'Russian crowns mid-capture');
});
test('Pool: kings fly; 3 kings vs a lone king must win in 13 moves', () => {
  const st = at('pool', [[7, 0, 2], [3, 4, -1], [0, 7, -2]]);
  assert.ok(R.legal(st).some(m => m.caps.length && R.geo(8).rc[m.path[1]][0] <= 2));
  assert.equal(R.endgameLimit(R.V('pool'), at('pool', [[7, 0, 2], [7, 2, 2], [7, 4, 2], [0, 1, -2]]).board).limit, 26);
  assert.equal(R.endgameLimit(R.V('pool'), at('pool', [[7, 0, 2], [7, 2, 2], [0, 1, -2]]).board).limit, 0);
});
test('Spanish: 3 kings with one on the long diagonal vs a lone king: 13 moves', () => {
  assert.equal(R.endgameLimit(R.V('spanish'), at('spanish', [[7, 0, 2], [7, 2, 2], [7, 4, 2], [0, 1, -2]]).board).limit, 26);
  assert.equal(R.endgameLimit(R.V('spanish'), at('spanish', [[6, 3, 2], [7, 2, 2], [7, 4, 2], [0, 1, -2]]).board).limit, 0, 'none on the long diagonal');
});

// ---------------------------------------------------------------- American, kings fly (house rule)
test('American with flying kings: kings fly, men still jump forward only, crowning ends the move', () => {
  const st = at('flykings', [[7, 0, 2], [3, 4, -1], [0, 7, -1]]);
  assert.deepEqual(paths(st), ['7,0 1,6', '7,0 2,5'].sort());
  agree(st);
  const am = at('american', [[7, 0, 2], [3, 4, -1], [0, 7, -1]]);
  assert.ok(R.legal(am).every(m => !m.caps.length), 'American kings are short');
  const back = at('flykings', [[3, 2, 1], [4, 3, -1], [0, 7, -1]]);
  assert.ok(R.legal(back).every(m => !m.caps.length));
});

test('the engine plays legal moves in every new rule set', () => {
  for (const id of ['pool', 'italian', 'spanish', 'flykings']) {
    let st = R.newGame(id);
    for (let i = 0; i < 40 && !st.result; i++) {
      const r = E.think(st, { nodes: 3000, newGame: i === 0 });
      assert.ok(r.move && R.findMove(st, r.move.path), id + ' ply ' + i);
      st = R.act(st, st.turn, { path: r.move.path });
    }
  }
});
