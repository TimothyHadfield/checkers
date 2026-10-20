# Checkers Lab — session log

## 2026-10-20 — first build (builder agent for the portfolio manager)
- **Asked:** Tim: "add risk, clue, battleship, connect four, stratego, clue, checkers, pandemic, splendor, king of tokyo, 7 wonders, and evolution to the list of games." Manager brief: American checkers exact rules plus International, Russian, Brazilian and a casual house rule; strong worker engine with measured levels, eval bar and points-lost study mode; online seats via `_online`.
- **Built:** rules.js (all five rule sets with official draw rules), engine.js (typed-array PVS search in a Web Worker), five measured levels, coach/review/analyze/puzzles/settings tabs, online rooms, 158 generated puzzles, docs/rules-check.md, docs/ideas.md, icon.
- **Verified:** 38 node tests (perft equals published counts), mutation check (each deliberate breakage caught), full games played by tapping in WebKit at 393 px and 1280 px, screenshots of every tab, no console errors or horizontal overflow, fresh-agent QA pass, live URL checked.
- **QA fixes:** phone Back closes sheets/online screen first; setup scrolls inside on short phones; room code paste tolerant; no undo after resigning.
- **Open:** Tim's look on his phone; strength of the non-American rule sets not measured.

## 2026-10-20 — design pass (builder for the portfolio manager)
- **Asked:** Tim: "once you're finished with all the games, review them again for design improvements especially visually." Plus three QA display bugs.
- **Built:** CSS polish in index.html (turn pill, setup fit, centred desktop setup, game-over pop-in, clearer glows, bigger arrows and ? hit areas, laptop side text); app.js: Review board size on phone, Review during a fresh/online game, puzzle tries remembered.
- **Verified:** before/after WebKit screenshots at 393×659, 1280×800, iPhone SE; bugs seen before, gone after; 38 node tests pass.

## 2026-10-20 — sounds, celebrations, animations (builder for the portfolio manager)
- **Asked:** Tim: "add opptional sounds ... win celebrations, and other fun annimations ... customizable in the settings".
- **Built:** js/fx.js (shared 1.0.3, unchanged), js/sfx.js (event map), app.js hooks (move hops, lift-off, crown, +N, errors, online turn chime, end celebration, puzzle big), Sound & effects panel in Settings, fx-still/fx-fast CSS.
- **Verified:** tests/fx.test.js failed without sfx.js, passes now (42/42 total); WebKit+Chromium page script (scratchpad design/checkers-fx/check.mjs): old build has no FX; new: error+shake, capture×2, ding, win; Sound off 0 real plays; Animations off 0 running animations; no console errors or overflow at 393 and 1280.
- **Open:** Tim hearing it on his iPhone.
