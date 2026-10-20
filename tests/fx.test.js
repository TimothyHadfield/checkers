// Sounds, celebrations and animations: the event -> sound map (js/sfx.js) over a real scripted game,
// the Settings switches (real js/fx.js with a fake Web Audio), and the game-over celebration.
// Run: node --test "tests/*.test.*"
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/rules.js');
const S = require('../js/sfx.js');

// ---- a spy FX: records every call, plays nothing
function spyFX(settings) {
  const log = [];
  return {
    log,
    settings: Object.assign({ sound: true, animations: true, animSpeed: 'normal' }, settings || {}),
    play(name, o) { log.push(['play', name, o || {}]); return true; },
    define(name) { log.push(['define', name]); },
    celebrate(o) { log.push(['celebrate', o.kind, o]); return Promise.resolve(); },
    pop(el) { log.push(['pop', el]); return Promise.resolve(); },
    floatText(el, t) { log.push(['floatText', t]); return Promise.resolve(); },
  };
}
// timers in order of when they fire, run at once
function clock() {
  const q = []; let now = 0;
  const later = (fn, ms) => q.push({ t: now + ms, fn });
  const flush = () => { while (q.length) { q.sort((a, b) => a.t - b.t); const e = q.shift(); now = e.t; e.fn(); } now = 0; };
  return { later, flush };
}
// a scripted game (deterministic): the first side always takes the biggest capture, else crowns;
// the other side plays the middle legal move. American: 38 moves, both sides multi-jump and crown, side 1 wins.
function scriptedGame(variant) {
  let st = R.newGame(variant);
  const moves = [];
  while (!st.result && moves.length < 400) {
    const legal = R.legal(st);
    const m = st.turn === 0 ? legal.slice().sort((a, b) => b.caps.length - a.caps.length || (b.crown ? 1 : 0) - (a.crown ? 1 : 0))[0] : legal[legal.length >> 1];
    moves.push({ before: st, m });
    st = R.act(st, st.turn, { path: m.path });
  }
  return { moves, end: st };
}
const expected = m => {
  const out = [];
  if (m.caps.length) for (let i = 0; i < m.caps.length; i++) out.push('capture');
  else out.push('slide', 'place');
  if (m.crown) out.push('ding');
  return out;
};

test('every move of a scripted game makes the sounds of what happened, paced like the slide', () => {
  for (const variant of ['american', 'international']) {
    const g = scriptedGame(variant);
    assert.ok(g.end.result, variant + ': the scripted game ends');
    const seen = { plain: 0, jump: 0, multi: 0, crown: 0 };
    for (const { m } of g.moves) {
      const FX = spyFX(), c = clock();
      S.playMove(FX, m, 1, c.later); c.flush();
      const names = FX.log.filter(x => x[0] === 'play').map(x => x[1]);
      assert.deepEqual(names, expected(m), variant + ' ' + m.path.join('-'));
      // each hop of a multi-jump sounds a little higher than the last
      const pitches = FX.log.filter(x => x[1] === 'capture').map(x => x[2].pitch);
      for (let i = 1; i < pitches.length; i++) assert.ok(pitches[i] > pitches[i - 1]);
      if (!m.caps.length) seen.plain++; else if (m.caps.length === 1) seen.jump++; else seen.multi++;
      if (m.crown) seen.crown++;
    }
    for (const k of Object.keys(seen)) assert.ok(seen[k] > 0, variant + ': the game had a ' + k + ' move');
  }
});

test('a multi-jump by you is a big moment; by the computer it is not', () => {
  const g = scriptedGame('american');
  const big = g.moves.find(x => x.m.caps.length >= S.BIG_CHAIN) || g.moves.find(x => x.m.caps.length >= 2);
  const m = Object.assign({}, big.m, { caps: [1, 2, 3], path: [0, 1, 2, 3] });
  const mine = spyFX(); S.afterMove(mine, m, { piece: {}, count: {}, mine: true });
  assert.deepEqual(mine.log.filter(x => x[0] === 'celebrate').map(x => x[1]), ['big']);
  assert.deepEqual(mine.log.filter(x => x[0] === 'floatText').map(x => x[1]), ['+3']);
  const theirs = spyFX(); S.afterMove(theirs, m, { piece: {}, count: {}, mine: false });
  assert.equal(theirs.log.filter(x => x[0] === 'celebrate').length, 0);
});

test('game over: win / lose / draw for the viewer, the winner’s colours on a win', () => {
  const g = scriptedGame('american');
  const r = g.end.result;
  assert.ok(r && r.winner != null, 'the scripted game has a winner');
  const won = spyFX();
  S.celebrateEnd(won, r, 'computer', r.winner, 'Black');
  const c = won.log.find(x => x[0] === 'celebrate');
  assert.equal(c[1], 'win'); assert.deepEqual(c[2].colors, S.colorsOf('Black'));
  const lost = spyFX();
  S.celebrateEnd(lost, r, 'online', 1 - r.winner, 'Black');
  assert.equal(lost.log.find(x => x[0] === 'celebrate')[1], 'lose');
  const two = spyFX();
  S.celebrateEnd(two, r, 'two', 0, 'White');
  assert.equal(two.log.find(x => x[0] === 'celebrate')[1], 'win', 'two players on one phone: a win is celebrated');
  const draw = spyFX();
  assert.equal(S.celebrateEnd(draw, { winner: null, reason: 'repeat' }, 'computer', 0, null, {}), 'draw');
  assert.deepEqual(draw.log.map(x => (x[0] === 'play' ? 'play:' + x[1] : x[0])), ['play:draw', 'pop']);
  assert.equal(S.celebrateEnd(spyFX(), null, 'computer', 0), null, 'no result, no celebration');
});

// ---- the real fx.js: the Settings switches gate every sound and animation
test('real fx.js: Sound off plays nothing, Animations off animates nothing', () => {
  const audio = { nodes: 0, clock: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
  const node = x => { audio.nodes++; return Object.assign({ connect() {}, disconnect() {} }, x); };
  const src = () => node({ start() {}, stop() {} });
  globalThis.AudioContext = class {
    get currentTime() { return audio.clock; }
    constructor() { this.sampleRate = 8000; this.state = 'running'; this.destination = {}; }
    createGain() { return node({ gain: param() }); }
    createOscillator() { return Object.assign(src(), { type: 'sine', frequency: param() }); }
    createBufferSource() { return Object.assign(src(), { buffer: null }); }
    createBiquadFilter() { return node({ type: '', frequency: param(), Q: param() }); }
    createStereoPanner() { return node({ pan: param() }); }
    createDynamicsCompressor() { return node({}); }
    createBuffer(ch, n) { return { getChannelData: () => new Float32Array(n) }; }
    resume() { return Promise.resolve(); }
  };
  const anims = { n: 0 };
  const el = () => ({ animate() { anims.n++; return {}; }, classList: { add() {}, remove() {} }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 40, height: 40 }), style: {}, remove() {}, setAttribute() {} });
  globalThis.document = { addEventListener() {}, removeEventListener() {}, createElement: el, body: { appendChild() {} }, head: { appendChild() {} }, getElementById: () => null };
  globalThis.matchMedia = () => ({ matches: false });
  require('../js/fx.js');
  const FX = globalThis.FX;
  FX.init({ game: 'checkers-test', clicks: false });
  S.defineSounds(FX);
  FX.unlock();
  const g = scriptedGame('american');
  const later = (fn) => { audio.clock += 0.2; fn(); };
  const run = () => {
    const before = FX.stats.plays; anims.n = 0;
    for (const { m } of g.moves) {
      S.playMove(FX, m, 1, later);
      S.liftOff(FX, el());
      S.afterMove(FX, Object.assign({}, m, { crown: true }), { piece: el(), count: el(), mine: true });
    }
    S.celebrateEnd(FX, g.end.result, 'computer', g.end.result.winner, 'Black', el());
    audio.clock += 1;
    S.celebrateEnd(FX, { winner: null }, 'computer', 0, null, el());
    return { plays: FX.stats.plays - before, anims: anims.n };
  };
  const on = run();
  assert.ok(on.plays >= g.moves.length, 'sound on: every move made a sound (' + on.plays + ')');
  assert.ok(on.anims > 0, 'animations on: something animated');
  FX.set('sound', false);
  assert.equal(run().plays, 0, 'Sound off: silent');
  FX.set('sound', true); FX.set('moves', false); FX.set('celebrations', false);
  assert.equal(run().plays, 0, 'Game sounds + Celebrations off: silent');
  FX.set('moves', true); FX.set('celebrations', true); FX.set('animations', false);
  const still = run();
  assert.equal(still.anims, 0, 'Animations off: nothing animates');
  assert.ok(still.plays > 0, 'Animations off keeps the sounds');
  delete globalThis.document; delete globalThis.AudioContext; delete globalThis.FX;
});
