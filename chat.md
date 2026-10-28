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

## 2026-10-20 — real-table look (builder for the portfolio manager)
- **Asked:** Tim: "make sure that each of the games also have a look to them so that the game ... looks almost identical to how the board or card layout looks like in real life ... like you're looking through a camera that is connected to a user's glasses".
- **Built:** wooden table under a game in progress (shared `_table` kit copied unchanged to css/table.css + js/table.js); walnut-framed board with grain; checkers drawn as real discs (side wall, fluted rim, rings), kings two discs stacked; captured checkers stacked on the table in front of the capturer and taken ones fly there; helpers as smoked glass, laptop move list as a paper scoresheet; phone-landscape layout (board left). fx.js recopied (1.0.3, data-fxspeed). `.gitattributes` keeps the shared copies LF.
- **Verified:** WebKit before/after shots (setup, mid, late, end, 10×10, Russian) at 393×659, 1280×800, 320×568, 659×393: no overflow, no page scroll, no console errors; capture tap → piece flies to pile, count 1→2 (animations on and off); reviewer agent two rounds; 42/42 node tests.
- **Open:** Tim's look on his phone; no 3-D tilt (tap mapping).

## 2026-10-20 — edge-case pass (builder for the portfolio manager)
- **Asked:** Tim: "Could you focus on making each game perfect especially in scenarios that the game doesn't expect or are a little weird."
- **Built:** `_table` 1.0.1 recopied; app.js: no moves while a draw offer is open (+ message), two-tab sync, Back closes confirm boxes, Analyze route choice + slide guard, Review analysis survives an engine failure, lapsed draw answer, puzzle solution route; index.html: player rows never cut the name (count line shortens, stacks slide together).
- **Verified:** 50 scenarios / 57 WebKit checks (scratchpad `edge/checkers/edge.mjs`, results-*.json, shots/): 9 failed before, all pass after; 42/42 node tests; layouts at 320×568, 393×659, 659×393, 568×320, 640×400, 1280×800, 1920×1080.
- **Open:** real online play on two phones; Tim's look at the squeezed captured stacks.

## 2026-10-21 — visibility pass (builder for the portfolio manager)
- **Asked:** Tim: "for a lot of the games the cards or board layout is too small to easily see what's going on ... Fix this so the view of what's happening and where everything is is very clear."
- **Built:** app.js: Review on phone puts the graph between « ‹ and › » (board 197 → 312 px); Review/Analyze/Puzzles sideways get a board-left layout (182 → 297 px, nothing under the tab bar); king crown 56% → 78%. index.html: `.rvnav`, `.split.land` CSS; app.js?v=7.
- **Verified:** audit + before/after WebKit shots at 393×659, 320×568, 659×393, 1280×800, 1440×900 (scratchpad `vis/checkers/`); layout-test.mjs 5 fails before, 11/11 after in WebKit and Chromium; sideways set-up taps hit the right square; 42/42 node tests; one reviewer agent.
- **Open:** Tim's look; the Play board on a portrait phone is width-limited (343 px), no zoom added.

## 2026-10-27 — home-screen app + offline (`_pwa` kit pilot, builder for the portfolio manager)
- **Asked:** Tim: "start building every single improvement you can think of after your competitor analysis." Plan item 3: installable on the iPhone home screen + offline play vs computer, never a stale build.
- **Built:** copied `sw.js`, `js/pwa.js`, `tools/pwa-check.mjs`, `tools/make-icons.mjs` from `_pwa` 1.1.0; `manifest.webmanifest` (name "Checkers Lab"), `icons/` (192/512/maskable; apple-touch-icon kept); head tags; `PWA.safeToReload` + `window.CkApp` test hook at the end of app.js; app.js?v=8, pwa build 8.
- **Verified:** `node tools/pwa-check.mjs` 3/17 before → 18/18 (WebKit and Chromium 393×659): offline cold open, a move answered by the computer (Web Worker) offline, weak signal, new deploy picked up in one load, mid-game pill, safe-point auto-reload. 42/42 node tests.
- **Open:** real iPhone home-screen app; Tim's look at the pill.

## 2026-10-27 — improvement pass (builder for the portfolio manager)
- **Asked:** Tim: "start building every single improvement you can think of after your competitor analysis" and "I want to make our boardgames the best in every single metric we can." Brief: Hard ≥65% vs Medium (was 56%), whole ladder checked, varied openings; `_pwa` 1.2.0 byte-identical, add `_profile` 1.1.0 + `_coach`; rival variants behind options; steal: share a game as a link, a local rating on Play (clocks only for online rooms: skipped, online.js untouched).
- **Built:** kits copied verbatim; My stats (Elo on the Level label, awards, streak, Daily tab); Daily game (today's ballot opening vs Hard, no Undo); 3-move ballot switch in Settings (264 engine-checked openings); guided first game + full rules sheet for all 5 rule sets; Share button in Review (`#g=` link opens the game in Review); Medium noise 15; Hard/Expert vary their first 8 plies; quit after your first move = loss; Hint/Undo = unrated; offer card closes when a game starts.
- **Verified:** 48/48 node tests (new `tests/improve.test.js` fails on the old build); ladder re-measured 48 games/pair (Hard vs Medium 56% → 76%); `node tools/pwa-check.mjs` 18/18 WebKit; WebKit flows 25/25 at 393×659 + 320/659-wide/1440 shots, no overflow, no page errors.
- **Open:** Tim's look at My stats / Daily / guided game; Expert vs Hard only 56%; real-phone share sheet.
