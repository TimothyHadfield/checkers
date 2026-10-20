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
    { id: 3, name: 'Medium', note: 'Club player', opts: { nodes: 2500 } },
    { id: 4, name: 'Hard', note: 'Strong', opts: { nodes: 100000 } },
    { id: 5, name: 'Expert', note: 'Full strength', opts: { nodes: 450000 } },
  ];
  const byId = id => LEVELS.find(l => l.id === id) || LEVELS[2];
  // copied from tools/measured-american.json (Medium = 2500 nodes; run 2026-10-20)
  const MEASURED = {"variant":"american","gamesPerPair":24,"date":"2026-10-20","pairs":{"1v2":{"score":0.125,"w":1,"d":4,"l":19},"2v3":{"score":0.208,"w":3,"d":4,"l":17},"3v4":{"score":0.438,"w":5,"d":11,"l":8},"4v5":{"score":0.354,"w":2,"d":13,"l":9},"3v5":{"score":0.396,"w":4,"d":11,"l":9},"1v5":{"score":0,"w":0,"d":0,"l":24}}};
  return { LEVELS, byId, MEASURED };
});
