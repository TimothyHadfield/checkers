# Checkers Lab — progress

## START HERE
Read this file, then `CLAUDE.md`, then `docs/rules-check.md`. Last updated: 2026-10-20 (edge-case pass).
Live: https://timothyhadfield.github.io/checkers/ · Repo: https://github.com/TimothyHadfield/checkers

## Goal right now
First version done: play every common rule set against measured computers, friends on one phone, or online;
learn from a coach, review, puzzles and a position editor. Waiting for Tim's look at it on his phone.

## Status
| Area | State |
|---|---|
| Rules: American, International 10×10, Russian, Brazilian, Casual (jumps optional) | Done. Perft matches published counts (American to depth 10, International to depth 9). |
| Draw rules (repetition, king-move limits, FMJD 16/5-move, CBJD, Russian 2.1.9.1) | Done, applied automatically |
| Engine (Web Worker, PVS alpha-beta, iterative deepening, TT, quiescence, endgame knowledge) | Done; ~12 plies in 3 s on a laptop (American) |
| 5 levels, measured head to head | Done (table below) |
| Coach: score bar, number, grades, points lost, hint, best line | Done |
| Review: accuracy %, graph, played vs best arrows, analyze whole game | Done |
| Analyze: set up a real-board position, best move + score, play from here | Done |
| Puzzles: 158 from self-play, all five rule sets | Done |
| Online rooms via `../_online/online.js` (copied unchanged) | Done; any mix of you / computer / friend |
| Tests: 38 node tests; 10 deliberate breakages each caught | Done |

### Measured strength (American, 24 games per match, random 4-move openings, colours swapped, draw = ½)
| Match | W-D-L (higher level first) | Score |
|---|---|---|
| Easy vs Beginner | 19-4-1 | 88% |
| Medium vs Easy | 17-4-3 | 79% |
| Hard vs Medium | 8-11-5 | 56% |
| Expert vs Hard | 9-13-2 | 65% |
| Expert vs Medium | 9-11-4 | 60% |
| Expert vs Beginner | 24-0-0 | 100% |
Budgets: Beginner depth 2 + noise 140, Easy depth 4 + noise 45, Medium 2,500 nodes, Hard 100,000, Expert 450,000.
Checkers is very drawish at the top (it is solved as a draw), so strong levels draw each other a lot.

## Standing instructions (Tim's words)
- "add risk, clue, battleship, connect four, stratego, clue, checkers, pandemic, splendor, king of tokyo, 7 wonders, and evolution to the list of games."
- "add opptional sounds you can add to the games that reflect what's happening in the game accurately as well as win celebrations, and other fun annimations to go along with everything. Just make sure everything is customizable in the settings so the user can play as preffered." (2026-10-20)
- "make sure that each of the games also have a look to them so that the game (either board or card layout) looks almost identical to how the board or card layout looks like in real life ... It should look kind of like you're looking through a camera that is connected to a user's glasses that is playing in real life (not actually, but the layout and style of everything should be similar)." (2026-10-20)
- "Could you focus on making each game perfect especially in scenarios that the game doesn't expect or are a little weird." (2026-10-20)
- From the briefs: odds/numbers where the decision is made; computer players at measured strength; a study mode (points lost, hint, best move afterwards); a real-table companion; dark phone-first look with the Hub tokens; $0; no copyrighted art or rulebook text.

## Traps
- `js/online.js` is a copy of `../_online/online.js`: never edit here.
- The engine has its own move generator; any rules change must go into both `rules.js` and `engine.js`, then run the perft tests.
- Level strength depends on the engine: re-measure after any engine change (see CLAUDE.md).
- Port 8731 on this laptop is often taken by another project's server; serve on a random high port.
- Headless WebKit clicks can time out when the CPU is busy (other agents); rerun rather than "fix" the page.
- Pieces have `pointer-events: none`; tests click `.sq[data-s=N]` (square index), not the piece.
- History: sheets and the online screen push a `{layer}` entry so phone Back closes them first; closing them by button drops that entry with `popQuiet()`. Changing tab from a layer uses replaceState. Keep this when adding new overlays.

## Decisions
- Draw rules are applied automatically (no referee to claim them).
- Russian king-only limit 15 moves (official text), not lidraughts' 16; Brazilian follows the CBJD rulebook.
- Medium budget lowered from 12,000 to 2,500 nodes so it sits between Easy and Hard.
- Coach grades: lost ≤0.1 men Best, ≤0.3 Good, ≤0.7 Inaccuracy, ≤1.5 Mistake, else Blunder; forced moves don't count. Accuracy = mean of max(0, 100 − 40 × lost).
- Online computer seats think on the host's browser, capped at Hard.
- The laptop side panel shows the best line from your last move (not the current one, which would give away the answer).
- Undo is off after a resignation or an agreed draw (other finished games can still be taken back vs the computer).

## Fresh-agent QA (2026-10-20, live site) — fixed
Back left the site from the online screen/sheets; setup hid Start under the tab bar on 375×553 and 320 wide; pasted room code with a space failed; Undo revived a resigned game. All fixed and re-measured (scratchpad fixes.mjs).

## Design pass (2026-10-20) — done
Turn shown as a warm pill on the player row; setup fits 393×659 and iPhone SE with no inner scroll (was cut under the tab bar); Review phone board larger; desktop setup centred; bigger game-over card with a pop-in; clearer must-jump glow; bigger ‹ › glyphs; 40px+ hit area on the ? buttons; larger side-panel text on laptop.
Also fixed: Review said "No game yet" during a just-started game (now shows it, online too); puzzle attempts are stored (`pz.tried`), so a reload never says "First try!" after a wrong try.
Verified with a WebKit script (scratchpad `design/checkers/shots.mjs`, before/after screenshots at 393×659, 1280×800, SE): both bugs reproduced before, gone after; no overflow, no console errors.

## Sound, celebrations, animations (2026-10-20) — done
`js/fx.js` = shared `_fx/fx.js` 1.0.3, copied unchanged (recopy when it changes; bump `?v=`). `js/sfx.js` = this game's event map + effects (node-tested in `tests/fx.test.js`). Settings tab → "Sound & effects" panel (`FX.renderSettings`, restyled in index.html `#fx-box` to the game's blue switches).
| Event | Sound | Effect |
|---|---|---|
| Plain move (yours, computer, opponent, puzzle, analyze) | `slide` then `place` (wood) as it lands | existing slide |
| Each jump of a capture | `capture`, pitch rises 7% per hop | taken piece lifts off |
| Man crowned | `ding` after landing | crown drops in + piece pops |
| Any capture | — | "+N" floats by the capturer's count |
| Your multi-jump of 3+ | — | `celebrate big` |
| Tap a piece that can't move / must-jump refused / bad drop | `error` | piece shakes |
| Select a piece | `tap` | — |
| Online: it becomes your turn | `turn` | your name pulses |
| Game over | `celebrate win` (winner's colours) / `lose` / custom `draw` (two calm notes + end card pop) | |
| Puzzle solved / wrong | `celebrate big` / `error` + board shake | |
Computer/opponent moves use the same sounds at 0.85 volume. Animations off = `html.fx-still` (all CSS transitions/keyframes off, moves instant, sounds keep pace); Fast = `html.fx-fast`.

## Real-table look (2026-10-20) — done
Game in progress sits on a wooden table (`css/table.css` + `js/table.js` = shared `_table` (recopied 1.0.1 in the edge pass; Checkers has no flip cards), copied unchanged; `.gitattributes` keeps them and `js/fx.js` LF — recopy byte for byte). Board: walnut frame + inlay, grained squares (index.html `.board-wrap`). Pieces: `pieceSVG` in app.js (shadow, side wall, fluted rim; king = two stacked discs + stamped crown). Captured checkers: `pileHTML` stacks of 4 in front of the capturer; a taken piece flies there (`FX.flyTo`). Helpers smoked glass; laptop move list = paper scoresheet; phone landscape = `#game.land` grid. Setup/online lobby keep the plain look. Research + shots: scratchpad `table/checkers/` (real.md, before/, after3/).
- Trap: pieces now carry `data-side`; the `.pile` element is the flight target.

## Edge-case pass (2026-10-20) — done
50 weird scenarios (scratchpad `edge/checkers/scenarios.md`), checked in WebKit by `edge/checkers/edge.mjs` (57 checks) + the node tests. 9 failed, all fixed:
| Scenario | Was | Now |
|---|---|---|
| Two players, draw offer open, board tapped | uncaught error | "Accept or decline the draw first"; nobody moves while an offer is open (online too) |
| "Medium computer" at 320 px, phone sideways, 200% zoom | name cut | name never cut: the count line shortens, then the captured stacks slide together (last stack stays whole) |
| Same game in two tabs | stale tab could overwrite moves | `storage` event reloads the game; only the visible tab plays the computer |
| Back with a Resign/Quit/Leave box open | left the site | the box has its own history entry; Back closes it |
| Analyze: two capture routes to one square | could not pick the second route | tap the first landing square, as on Play |
| Analyze: second move tapped during a slide | replaced the first move | taps wait for the slide |
| Review "Analyze" when the engine fails | stuck on "Analyzing… 0%" forever | carries on (main-thread fallback) |
| Computer fails to answer a draw offer | game stuck | offer lapses ("declines") |
| Puzzle solved by the other capture route | replay could stop | solution's own route is used |
Passed as-is: every ending's end card, first-move win, empty Analyze position, long 160-ply game, rapid taps/Undo/Start/Hint, resign while thinking, reload mid-think/mid-slide, storage blocked, corrupt saves, offline online-room create, rotate mid-slide, 320–1920 px, light preference.
- Trap: headless WebKit on a busy laptop drops frames, so Playwright clicks time out; the harness clicks with `force` / DOM clicks and waits longer. Rerun before "fixing".

## NOT verified
- Real-table look on Tim's iPhone; no 3-D camera tilt (taps map by screen rect, a tilt would mis-map them).
- On Tim's real iPhone (only Safari's engine at iPhone size, headless). Sounds never heard by a person (headless WebKit on Windows has no Web Audio; Chromium counted 7 real plays).
- Sounds/effects in a browser: only the play tab vs computer (error, double jump, crown, win) was driven; puzzles, analyze, online turn chime and draw sound are covered by node tests / code reading only.
- Edge pass: two real phones online (host leaves, AFK, slow network), a long emoji name online, page left in the background 10 min; the two-tab fix only in one browser profile.
- FMJD 2024 extra 5-move rule (lone king on the long diagonal) not implemented.
- Russian/Brazilian perft has no published table to compare with (engine and rules generator agree).
- Strength numbers for the other rule sets (only American measured).

## Rejected / parked
- ~~Opening book, endgame databases, Elo, clocks~~ — see `docs/ideas.md` for reasons.
