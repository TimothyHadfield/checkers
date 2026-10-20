# Checkers Lab — progress

## START HERE
Read this file, then `CLAUDE.md`, then `docs/rules-check.md`. Last updated: 2026-10-20 (first build).
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
Back left the site from the online screen/sheets; setup hid Start under the tab bar on 375×553 and 320 wide; pasted room code with a space failed; Undo revived a resigned game. All fixed and re-measured (scratchpad fixes.mjs). Left as is (low): Review shows "No game yet" during a game; reloading a puzzle after a wrong try still says "First try!".

## NOT verified
- On Tim's real iPhone (only Safari's engine at iPhone size, headless).
- FMJD 2024 extra 5-move rule (lone king on the long diagonal) not implemented.
- Russian/Brazilian perft has no published table to compare with (engine and rules generator agree).
- Strength numbers for the other rule sets (only American measured).

## Rejected / parked
- ~~Opening book, endgame databases, Elo, clocks~~ — see `docs/ideas.md` for reasons.
