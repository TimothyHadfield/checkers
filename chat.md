# Checkers Lab — session log

## 2026-10-20 — first build (builder agent for the portfolio manager)
- **Asked:** Tim: "add risk, clue, battleship, connect four, stratego, clue, checkers, pandemic, splendor, king of tokyo, 7 wonders, and evolution to the list of games." Manager brief: American checkers exact rules plus International, Russian, Brazilian and a casual house rule; strong worker engine with measured levels, eval bar and points-lost study mode; online seats via `_online`.
- **Built:** rules.js (all five rule sets with official draw rules), engine.js (typed-array PVS search in a Web Worker), five measured levels, coach/review/analyze/puzzles/settings tabs, online rooms, 158 generated puzzles, docs/rules-check.md, docs/ideas.md, icon.
- **Verified:** 38 node tests (perft equals published counts), mutation check (each deliberate breakage caught), full games played by tapping in WebKit at 393 px and 1280 px, screenshots of every tab, no console errors or horizontal overflow, fresh-agent QA pass, live URL checked.
- **Open:** Tim's look on his phone; strength of the non-American rule sets not measured.
