/* Checkers' part of the player profile (shared kit js/profile.js: never edit that one here).
   Level ratings, the achievement list, the Daily game's opening and turning a game into a result.
   UMD: window.CkProfile in the page, module.exports in node tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'), require('./openings.js'));
  else root.CkProfile = factory(root.CkRules, root.CkOpenings);
})(typeof self !== 'undefined' ? self : this, function (R, O) {
  'use strict';
  /* Elo of each level from the measured head-to-head scores in js/levels.js (American):
     gap = 400·log10(p / (1 − p)) for the stronger level's score p, Beginner anchored at 800, rounded to 25. */
  function levelRatings(L) {
    const ids = ['beginner', 'easy', 'medium', 'hard', 'expert'];
    const m = L.MEASURED && L.MEASURED.pairs;
    let r = 800;
    return L.LEVELS.map((l, i) => {
      if (i > 0) {
        const p = m && m[i + 'v' + (i + 1)] ? 1 - m[i + 'v' + (i + 1)].score : 0.75;
        const q = Math.min(0.97, Math.max(0.53, p));
        r += 400 * Math.log10(q / (1 - q));
      }
      return { id: ids[i], num: l.id, name: l.name, rating: Math.round(r / 25) * 25 };
    });
  }
  const LEVEL_IDS = { 1: 'beginner', 2: 'easy', 3: 'medium', 4: 'hard', 5: 'expert' };
  const RANK = { beginner: 1, easy: 2, medium: 3, hard: 4, expert: 5 };
  const beatAtLeast = n => c => !!(c.last && c.last.won && c.last.level && RANK[c.last.level] >= n);

  const ACHIEVEMENTS = [
    { id: 'first', title: 'First win', desc: 'Win a game', test: c => c.stats.wins >= 1 },
    { id: 'medium', title: 'Club player', desc: 'Beat Medium', test: beatAtLeast(3) },
    { id: 'hard', title: 'Sharp eye', desc: 'Beat Hard', test: beatAtLeast(4) },
    { id: 'expert', title: 'Giant killer', desc: 'Beat Expert', test: beatAtLeast(5) },
    { id: 'hold', title: 'Hold the line', desc: 'Draw against Expert', test: c => !!(c.last && c.last.draw && c.last.level === 'expert') },
    { id: 'clean', title: 'Flawless', desc: 'Win without losing a piece', test: c => !!(c.last && c.last.won && c.last.extra.lost === 0) },
    { id: 'court', title: 'Royal court', desc: 'Have 3 kings at once in a game you win', test: c => !!(c.last && c.last.won && c.last.extra.kings >= 3) },
    { id: 'world', title: 'World player', desc: 'Win at International, Russian or Brazilian', test: c => !!(c.last && c.last.won && /^(international|russian|brazilian)$/.test(c.last.extra.variant || '')) },
    { id: 'streak', title: 'Hat trick', desc: 'Win 3 in a row', test: c => c.stats.bestStreak >= 3 },
    { id: 'daily', title: 'Daily habit', desc: '3-day Daily streak', test: c => c.daily.streak >= 3 },
  ];

  /** Today's Daily game: one of the 3-move ballot openings and your colour, from the day's seeded rng
   *  (the same for every player that day). */
  function dailySetup(rng) {
    const list = (O && O.BALLOT) || [];
    const k = Math.floor(rng() * list.length) % Math.max(1, list.length);
    const my = rng() < 0.5 ? 0 : 1;
    return { opening: list[k] || [], my };
  }

  /** Pieces I lost and the most kings I had at once, from the moves (a replay of the game). */
  function gameFacts(st, my) {
    let s = R.newGame(st.variant, { board: st.start.board, turn: st.start.turn });
    const count = b => b.reduce((n, x) => n + ((x > 0) === (my === 0) && x !== 0 ? 1 : 0), 0);
    const kingsOf = b => b.reduce((n, x) => n + (x === (my === 0 ? 2 : -2) ? 1 : 0), 0);
    const start = count(s.board);
    let kings = kingsOf(s.board);
    for (const p of st.moves) { s = R.act(s, s.turn, { path: p }); kings = Math.max(kings, kingsOf(s.board)); }
    return { lost: start - count(s.board), kings, variant: st.variant, moves: st.moves.length };
  }

  /** A finished game -> Profile.recordResult input, or null if it isn't counted (guided game).
   *  g = { st, mode: 'computer' | 'two' | 'online', level (1-5), my, helped, guided, daily } */
  function profileResult(g) {
    const st = g.st;
    if (!st || !st.result || g.guided) return null;
    const extra = g.mode === 'two' ? { variant: st.variant } : gameFacts(st, g.my);
    if (g.mode === 'two') return { mode: 'two', won: null, extra };
    const w = st.result.winner;
    const draw = w == null;
    if (g.mode === 'online') return { mode: 'online', won: draw ? false : w === g.my, draw, extra };
    const mode = g.helped ? 'help' : 'computer';
    return { mode, level: mode === 'computer' ? LEVEL_IDS[g.level] : null, won: draw ? false : w === g.my, draw, daily: !!g.daily, extra };
  }

  /** Leaving an unfinished game vs the computer after your first move: a loss (null = leaving is free:
   *  no move of yours yet, a guided game, two players, or the game is over). */
  function quitResult(g) {
    if (!g || g.mode !== 'computer' || g.guided || !g.st || g.st.result) return null;
    const first = g.book || 0;
    let mine = 0;
    for (let i = first; i < g.st.moves.length; i++) if ((g.st.start.turn + i) % 2 === g.my) mine++;
    if (!mine) return null;
    const mode = g.helped ? 'help' : 'computer';
    return { mode, level: mode === 'computer' ? LEVEL_IDS[g.level] : null, won: false, draw: false, daily: !!g.daily, extra: { quit: true, variant: g.st.variant } };
  }

  return { levelRatings, LEVEL_IDS, ACHIEVEMENTS, dailySetup, gameFacts, profileResult, quitResult };
});
