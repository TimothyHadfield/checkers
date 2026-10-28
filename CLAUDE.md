# Checkers Lab — project rules

Static site (GitHub Pages, repo `TimothyHadfield/checkers`, live https://timothyhadfield.github.io/checkers/).
Checkers and draughts by the official rules (American, International 10×10, Russian, Brazilian, and behind
"More rules": Pool, Italian, Spanish; house rules: Casual "jumps optional" and American "kings fly") vs measured computers, with a coach (score bar, points lost, grades), review,
a position editor for real games, puzzles, and online rooms through `../_online/`. Read `progress.md` first.

- **No build step.** Plain UMD scripts in `js/` shared by browser, Web Worker and node tests:
  `rules.js` (the rules, the only source of truth) · `engine.js` (fast typed-array search, its own move generator,
  checked against rules.js by perft) · `levels.js` (level budgets + measured results) · `worker.js` ·
  `online-game.js` (the shared module's `game` object) · `puzzles.js` (generated) · `app.js` (the page).
  Bump `?v=N` on script tags in `index.html` and in `js/worker.js` when a JS file changes.
- **State:** `R.newGame(variant)` → plain JSON; `R.act(state, side, action)` returns a new state and throws on
  anything illegal. Side 0 moves first and sits at the bottom. Board cells: 1/2 = side-0 man/king, −1/−2 side 1.
- **`js/online.js` is a copy** of `../_online/online.js`. Never edit it here; recopy when the shared one changes.
- **Levels play by a fixed search budget** (nodes or depth), never by time, so they are equally strong on any device.
  Re-measure after any engine change: `node tools/measure-levels.js 24 american 5` (~50 min; or one pair:
  `... 24 american 3 2v3,3v4`), then copy `tools/measured-american.json` into `MEASURED` in `js/levels.js`.
- Puzzles: `node tools/make-puzzles.js 8 4` (~5 min) rewrites `js/puzzles.js`; add a 4th argument
  (`pool,italian`) to make puzzles for those rule sets only and keep every other puzzle and id.
- Italian/Spanish boards are mirrored on screen only (`mirror` flag in rules.js; boardHTML / sqAt / animateMove / sqName).
- Tests: `node --test "tests/*.test.*"` (65 tests, ~2 min). `node tools/mutants.js` breaks the code 10 ways and
  checks the tests notice each one. Rules and sources: `docs/rules-check.md`.
- Rules text in the app is our own words; pieces and board are our own SVG.
- Tim's global rules apply: $0, no permission prompts, explicit `git add` paths, nothing inside `.claude` folders.
