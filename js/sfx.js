/* Checkers Lab: which sound and effect each game event gets, and the small effects themselves.
   Kept apart from app.js so node tests can check the event -> sound map with a fake FX.
   Every call goes through FX (js/fx.js), so the Sound & effects switches in Settings gate all of it.
   UMD: window.CkSfx / module.exports. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CkSfx = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const HOP = 200;      // ms per square of a move's slide (normal speed)
  const LAND = 150;     // a plain move: slide sound at the start, wood knock when it lands
  const TAKE = 120;     // a jump: the capture sound as the piece passes over the taken one
  const BIG_CHAIN = 3;  // a multi-jump taking this many pieces is a "big" moment (for the mover)

  const fxOn = FX => !!(FX && FX.settings && FX.settings.animations);
  const speed = FX => (FX && FX.settings && FX.settings.animSpeed === 'fast' ? 0.55 : 1);

  // the sounds of one move: hops[i] = sounds of the slide path[i] -> path[i+1], `at` in ms from that hop's start;
  // end = sounds once the piece has arrived (crowning)
  function plan(move) {
    const n = Math.max(1, move.path.length - 1), hops = [];
    const jump = move.caps && move.caps.length > 0;
    for (let i = 0; i < n; i++) {
      if (jump) hops.push([{ name: 'capture', at: TAKE, pitch: 1 + 0.07 * i }]);   // each jump a little higher
      else hops.push([{ name: 'slide', at: 0 }, { name: 'place', at: LAND }]);
    }
    const end = move.crown ? [{ name: 'ding', at: 0 }] : [];
    return { hops, end, caps: jump ? move.caps.length : 0, crown: !!move.crown };
  }
  const say = (FX, s, vol) => FX.play(s.name, { pitch: s.pitch, vol });
  // the sounds of hop i, paced to the slide (the app calls this as each hop starts)
  function hopSounds(FX, p, i, vol, later) {
    const sp = speed(FX);
    (p.hops[i] || []).forEach(s => (s.at ? later(() => say(FX, s, vol), s.at * sp) : say(FX, s, vol)));
  }
  function endSounds(FX, p, vol) { p.end.forEach(s => say(FX, s, vol)); }
  // a move that is not slid on screen (dropped by drag, another tab): the same sounds at the same pace
  function playMove(FX, move, vol, later) {
    const p = plan(move), sp = speed(FX);
    p.hops.forEach((h, i) => (i ? later(() => hopSounds(FX, p, i, vol, later), i * HOP * sp) : hopSounds(FX, p, 0, vol, later)));
    if (p.end.length) later(() => endSounds(FX, p, vol), (p.hops.length * HOP + 60) * sp);
    return p;
  }

  // the taken piece lifts off the board (transform + opacity on the absolutely placed piece only)
  function liftOff(FX, el) {
    if (!el) return;
    if (!fxOn(FX) || !el.animate) { if (el.classList) el.classList.add('gone'); return; }
    try {
      el.animate([
        { transform: 'translateY(0) scale(1)', opacity: 1 },
        { transform: 'translateY(-22%) scale(1.22)', opacity: 1, offset: 0.35 },
        { transform: 'translateY(-55%) scale(1.3)', opacity: 0 },
      ], { duration: Math.round(380 * speed(FX)), easing: 'ease-out', fill: 'forwards' });
    } catch (e) { el.classList.add('gone'); }
  }
  // a new king: the crown drops onto the piece (index.html .crowned) and the piece pops
  function crownFx(FX, el) {
    if (!el || !fxOn(FX)) return;
    el.classList.add('crowned');
    FX.pop(el);
  }
  // after a move is drawn in its new place: "+N" by the capturer's count, the crown, a big moment
  function afterMove(FX, move, els) {
    const p = plan(move);
    if (p.crown) crownFx(FX, els.piece);
    if (p.caps && els.count) FX.floatText(els.count, '+' + p.caps, 'var(--good)');
    if (p.caps >= BIG_CHAIN && els.mine) FX.celebrate({ kind: 'big', at: els.piece || null });
    return p;
  }

  // game over: what this viewer sees. Two players on one phone: a win is always celebrated.
  function endKind(result, mode, my) {
    if (!result) return null;
    if (result.winner == null) return 'draw';
    if (mode === 'two') return 'win';
    return result.winner === my ? 'win' : 'lose';
  }
  const COLORS = { Black: ['#3a3d48', '#f0b354', '#d99a2b', '#e8eaf0'], White: ['#e8e2d4', '#f0b354', '#d99a2b', '#c9b48a'] };
  const colorsOf = sideName => COLORS[sideName] || COLORS.White;
  function defineSounds(FX) {
    // a draw: two calm, even notes (no fanfare, no sad fall)
    FX.define('draw', k => {
      k.tone({ f: 523, dur: 0.22, type: 'triangle', vol: 0.45 });
      k.tone({ f: 659, dur: 0.5, type: 'triangle', vol: 0.4, at: 0.16, lp: 2400 });
    }, 'celebrations');
  }
  function celebrateEnd(FX, result, mode, my, winnerName, card) {
    const kind = endKind(result, mode, my);
    if (!kind) return null;
    if (kind === 'draw') { FX.play('draw'); if (card) FX.pop(card); }
    else FX.celebrate({ kind, colors: kind === 'win' ? colorsOf(winnerName) : undefined });
    return kind;
  }

  return { HOP, BIG_CHAIN, plan, hopSounds, endSounds, playMove, liftOff, crownFx, afterMove, endKind, colorsOf, defineSounds, celebrateEnd, fxOn, speed };
});
