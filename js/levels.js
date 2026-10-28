/* Computer levels. Strength comes from a fixed amount of search (nodes), not from time, so a level
   plays the same on a phone and a laptop. The weak levels also add random noise to their choices.
   MEASURED is written by tools/measure-levels.js (head-to-head games, colours swapped). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CkLevels = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const LEVELS = [
    { id: 1, name: 'Beginner', note: 'Looks 2 moves ahead', opts: { depth: 2, multi: true, noise: 140 } },
    { id: 2, name: 'Easy', note: 'Looks 4 ahead', opts: { depth: 4, multi: true, noise: 45 } },
    { id: 3, name: 'Medium', note: 'Club player', opts: { nodes: 2500, multi: true, noise: 15 } },
    { id: 4, name: 'Hard', note: 'Strong', opts: { nodes: 100000 } },
    { id: 5, name: 'Expert', note: 'Full strength', opts: { nodes: 450000 } },
  ];
  const byId = id => LEVELS.find(l => l.id === id) || LEVELS[2];
  // The search options for one move. The strong levels would always play the same game from the same
  // position, so in the opening (their first moves, ply < VARY_PLIES) they pick at random among the moves
  // that score within VARY centi-men of the best (multi search + a little noise). Beginner/Easy/Medium already
  // vary (Medium's small noise all game, added 2026-10-27, puts it clearly between Easy and Hard).
  const VARY_PLIES = 8, VARY = 10;
  function optsFor(id, st, seed) {
    const o = Object.assign({ seed: seed == null ? (Date.now() & 0xffffff) : seed }, byId(id).opts);
    if (!o.noise && st && st.ply < VARY_PLIES) { o.multi = true; o.noise = VARY; }
    return o;
  }
  // copied from tools/measured-american.json (Medium = 2500 nodes + noise 15, Hard/Expert vary their first
  // 8 plies; run 2026-10-27, 48 games per pair). score = the LOWER level's score.
  const MEASURED = {"variant":"american","gamesPerPair":48,"date":"2026-10-28","pairs":{"1v2":{"score":0.104,"w":1,"d":8,"l":39},"2v3":{"score":0.281,"w":4,"d":19,"l":25},"3v4":{"score":0.24,"w":5,"d":13,"l":30},"4v5":{"score":0.438,"w":10,"d":22,"l":16},"3v5":{"score":0.156,"w":2,"d":11,"l":35},"1v5":{"score":0,"w":0,"d":0,"l":48}}};
  return { LEVELS, byId, optsFor, MEASURED, VARY_PLIES };
});
