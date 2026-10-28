/* A whole game in a link (no server): the moves are written as their number among the legal moves.
   #g=<variant>~<start board, empty if standard>~<start turn>~<move numbers, base 36, dot-separated>~<r0|r1 resigned, a agreed>
   UMD: window.CkShare in the page, module.exports in node tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'));
  else root.CkShare = factory(root.CkRules);
})(typeof self !== 'undefined' ? self : this, function (R) {
  'use strict';
  const CH = 'kmeMK';
  function encode(st) {
    const std = R.newGame(st.variant);
    const sameStart = JSON.stringify(std.start.board) === JSON.stringify(st.start.board) && std.start.turn === st.start.turn;
    let s = R.newGame(st.variant, { board: st.start.board, turn: st.start.turn });
    const idx = [];
    for (const p of st.moves) {
      const k = R.legal(s).findIndex(m => R.samePath(m.path, p));
      if (k < 0) break;
      idx.push(k.toString(36));
      s = R.act(s, s.turn, { path: p });
    }
    const r = st.result;
    const end = r && r.reason === 'resign' ? 'r' + (1 - r.winner) : r && r.reason === 'agreed' ? 'a' : '';
    return [st.variant, sameStart ? '' : st.start.board.map(x => CH[x + 2]).join(''), st.start.turn, idx.join('.'), end].join('~');
  }
  /** The game in a link, or null if the text isn't one. */
  function decode(text) {
    try {
      const [variant, startTxt, turn, moves, end] = decodeURIComponent(String(text)).split('~');
      if (!R.VARIANTS[variant]) return null;
      const std = R.newGame(variant);
      const board = startTxt ? startTxt.split('').map(ch => CH.indexOf(ch) - 2) : null;
      if (board && (board.length !== std.board.length || board.some(x => x < -2))) return null;
      let st = R.newGame(variant, board ? { board, turn: +turn === 1 ? 1 : 0 } : {});
      for (const t of (moves ? moves.split('.') : [])) {
        const m = R.legal(st)[parseInt(t, 36)];
        if (!m) break;
        st = R.act(st, st.turn, { path: m.path });
      }
      if (!st.result && end && end[0] === 'r' && (end[1] === '0' || end[1] === '1')) st = R.act(st, +end[1], { resign: true });
      else if (!st.result && end === 'a') { st = R.act(st, st.turn, { draw: 'offer' }); st = R.act(st, 1 - st.offer, { draw: 'accept' }); }
      return st;
    } catch (e) { return null; }
  }
  return { encode, decode };
});
