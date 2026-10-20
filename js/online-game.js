/* Checkers as the shared online module's `game` object (see ../_online/README.md).
   Checkers has no hidden information: publicView is the whole game, privateView is empty.
   Seat 0 plays the side that moves first unless options.swap is set (then seat 0 plays second).
   Computer seats think inside game.bot on the host's browser, so their search is capped (Hard at most). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'), require('./engine.js'), require('./levels.js'));
  else root.CkOnlineGame = factory(root.CkRules, root.CkEngine, root.CkLevels);
})(typeof self !== 'undefined' ? self : this, function (R, E, L) {
  'use strict';
  const sideOf = (state, seat) => (seat ^ (state.swap ? 1 : 0));
  const seatOf = (state, side) => (side ^ (state.swap ? 1 : 0));

  const game = {
    id: 'checkers',
    minSeats: 2,
    maxSeats: 2,
    // options: { variant, swap, level }
    setup(nSeats, options, rng, seats) {
      const o = options || {};
      const variant = R.VARIANTS[o.variant] ? o.variant : 'american';
      const level = L.LEVELS.some(l => l.id === o.level) ? o.level : 4;
      const names = [0, 1].map(i => String((seats && seats[i] && seats[i].name) || 'Player ' + (i + 1)).slice(0, 24));
      return { g: R.newGame(variant), swap: o.swap ? 1 : 0, level, names };
    },
    toAct(state) {
      const g = state.g;
      if (g.result) return [];
      const side = g.offer >= 0 ? 1 - g.offer : g.turn;
      return [seatOf(state, side)];
    },
    // action: {path:[...]} | {resign:true} | {draw:'offer'|'accept'|'decline'}; throws when illegal
    apply(state, seat, action) {
      if (seat !== 0 && seat !== 1) throw new Error('Bad seat');
      if (!action || typeof action !== 'object') throw new Error('Bad move');
      const clean = {};
      if (action.resign === true) clean.resign = true;
      else if (typeof action.draw === 'string') clean.draw = action.draw;
      else if (Array.isArray(action.path) && action.path.length >= 2 && action.path.length <= 24 && action.path.every(Number.isInteger)) clean.path = action.path.slice();
      else throw new Error('Bad move');
      state.g = R.act(state.g, sideOf(state, seat), clean);
      return state;
    },
    publicView(state) { return state; },
    privateView() { return {}; },
    bot(ctx, seat) {
      const state = ctx.state || ctx.pub;
      const g = state.g;
      const side = sideOf(state, seat);
      const lv = L.byId(Math.min(state.level || 4, 4));
      if (g.offer >= 0 && g.offer !== side) {
        // answer a draw offer: accept unless clearly better
        const r = E.think(Object.assign({}, g, { offer: -1 }), { nodes: 20000 }); // score is the offerer's
        return { draw: -r.score > 40 ? 'decline' : 'accept' };
      }
      const r = E.think(g, Object.assign({}, lv.opts));
      return { path: r.move.path };
    },
    isOver(state) { return !!state.g.result; },
  };
  return { game, sideOf, seatOf };
});
