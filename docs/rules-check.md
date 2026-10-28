# Rules check

Every rule the game enforces, where it comes from, and the test that checks it (`tests/rules.test.js` unless noted).
Checked 2026-10-20 against the sources below. Run the tests: `node --test "tests/*.test.*"` (38 tests).

## Sources
- **American (WCDF / ACF):** usacheckers.com/rulesofcheckers.php · en.wikipedia.org/wiki/English_draughts
- **International (FMJD):** fmjd.org/docs/Annex_1.pdf · fmjd.org/downloads/FMJD_Annexes_2024_8-sig.pdf · en.wikipedia.org/wiki/International_draughts
- **Russian:** official rules (2013), bsuedu.ru "Правила шашек" PDF, section 2.1.9.1 · en.wikipedia.org/wiki/Russian_draughts · lidraughts.org/variant/russian
- **Brazilian (CBJD):** midiasstoragesec.blob.core.windows.net/001/2019/04/cbjd-regras-damas-010113.pdf (arts. 99–100) · en.wikipedia.org/wiki/Brazilian_draughts
- **Pool (American Pool Checkers):** en.wikipedia.org/wiki/Pool_checkers · playstrategy.org/variant/pool
- **Italian:** mindsports.nl "Dama (Italian)" (mindsports.nl/index.php/on-the-evolution-of-draughts-variants/draughts-variants/498-dama_i) · en.wikipedia.org/wiki/Italian_draughts
- **Spanish:** playstrategy.org/variant/spanish · Wikipedia "Draughts" variant table (max pieces, then max kings)
- **Kings fly (American house rule):** no rulebook; American rules with International-style flying kings.
- **Move counts (perft):** oeis.org/A133046 (American) · aartbik.blogspot.com/2012/10/bikdam-international-checkers.html and damforum.nl/viewtopic.php?t=2308 (International)
- **Solved:** Schaeffer et al., "Checkers Is Solved", Science 317:1518 (2007) — perfect play is a draw.

## Rules and tests

| Rule | Am | Intl | Rus | Bra | Casual | Test |
|---|---|---|---|---|---|---|
| Board, men per side | 8×8, 12 | 10×10, 20 | 8×8, 12 | 8×8, 12 | 8×8, 12 | start position |
| Moves first | Black (dark) | White | White | White | Black | start position |
| Square names | 1–32, square 1 in Black's corner | 1–50, White on 31–50 | a1–h8 | a1–h8 | 1–32 | start position, notation |
| Men move forward one square | ✓ | ✓ | ✓ | ✓ | ✓ | perft |
| Men capture backwards | – | ✓ | ✓ | ✓ | – | men never jump backwards / Russian men capture backwards |
| Kings | one square | fly | fly | fly | one square | flying kings test |
| Capturing is compulsory | ✓ | ✓ | ✓ | ✓ | – (optional) | jump is compulsory / Casual jumps optional |
| Choice between captures | free | must take most | free | must take most | free | majority tests |
| King counts as one piece in "most" | – | ✓ | – | ✓ | – | majority test |
| Multi-jump must be finished | ✓ | ✓ | ✓ | ✓ | ✓ | multi-jump test |
| Captured pieces removed only at the end (no jumping twice) | ✓ | ✓ | ✓ | ✓ | ✓ | no-jumping-twice test + perft |
| Flying king lands on any free square past the piece, but must land where it can go on capturing if it can | – | ✓ | ✓ | ✓ | – | flying kings test + perft |
| Reaching the far row | crowned, move ends | crowned only if the move ends there | crowned at once, goes on capturing as a king | crowned only if the move ends there | crowned, move ends | crowning tests |
| No legal move (or no pieces) loses | ✓ | ✓ | ✓ | ✓ | ✓ | no legal move loses |
| Same position 3 times = draw | ✓ | ✓ | ✓ | ✓ | ✓ | threefold repetition |
| Only king moves, no man move or capture | 40 moves each | 25 moves each | 15 moves each | 20 moves each | 40 moves each | 40-move rule, 25-move rule |
| Few pieces vs a lone king | – | 3 pieces with a king: 16 moves; 2 or fewer: 5 moves | 3 vs king on main road: 5 moves; 3 kings (+more) vs king: 15 moves; kings both sides 2–3 / 4–5 / 6–7 pieces: 5 / 30 / 60 moves | 2 or fewer with a king: 5 moves; 3 with a king vs king on the long diagonal: 5 moves | – | FMJD and CBJD/Russian endgame tests |
| Draw by agreement, resignation | ✓ | ✓ | ✓ | ✓ | ✓ | draw offers, resigning |

## Added 2026-10-28: Pool, Italian, Spanish, Kings fly (`tests/variants.test.js`, 17 tests)

| Rule | Pool | Italian | Spanish | Kings fly |
|---|---|---|---|---|
| Board | 8×8, 12 men | 8×8 turned the other way (playing square in each right-hand corner) | same as Italian | 8×8 (American) |
| Moves first | Black | White | White | Black |
| Square names | 1–32 (American) | a1–h8, h1 in White's right corner | same as Italian | 1–32 |
| Men capture backwards | ✓ | – | – | – |
| Kings | fly | one square | fly | fly |
| Men may capture kings | ✓ | **– (never)** | ✓ | ✓ |
| Choice between captures | free (any capture) | most pieces → with a king → most kings → king met earliest → free | most pieces → most kings → free | free |
| Reaching the far row mid-capture | stays a man unless the move ends there | crowned, move ends | (men can't go on capturing) crowned | crowned, move ends |
| King-only moves before a draw | 15 each (playstrategy) | 40 each (our choice, see below) | 20 each (playstrategy "no progress 20 moves") | 40 each (American) |
| Endgame limit | 3 kings vs a lone king: 13 moves (Wikipedia, APCA) | – | 3+ kings, one on the long diagonal, vs a lone king: 13 moves (playstrategy) | – |

Tests: each tie-break has its own position (man can't take a king; king-capture-first; 2 pieces beat 1; most kings; king met
first; Spanish most kings; Pool free choice vs Brazilian majority; Pool man passing the far row stays a man vs Russian
crowning), the engine's generator agrees with rules.js to depth 5 from the start and to depth 3 from every test position,
and the engine plays 40 legal plies in each. The board is mirrored only on screen (`mirror` flag): the game itself is the
same up to a reflection, so rules.js and the engine use the usual squares and `sqName` / the board drawing flip the columns.

**Choices where sources are thin:** Italian no-progress limit is not in the sources we found (they give only threefold
repetition); we use American's 40 moves each so king shuffles end. Pool's draw rules differ between Wikipedia (13-move
rule only) and playstrategy (Russian-style counts); we use the 13-move rule plus playstrategy's 15 king-only moves.
Spanish is played on the light squares in Spain; we draw it on the dark squares of the mirrored board (same geometry).
Czech draughts was skipped: the sources we found don't say who moves first or how men capture.

## Move counts (perft) — exact match
- American, depths 1–9: 7, 49, 302, 1469, 7361, 36768, 179740, 845931, 3963680 (OEIS A133046; depth 10 = 18391564 also matched by hand).
- International, depths 1–7: 9, 81, 658, 4265, 27117, 167140, 1049442 (depths 8–9 = 6483961, 41022423 also matched by hand), counting a capture with the same start, end and captured pieces once (FMJD).
- Russian and Brazilian have no published table; the fast engine generator and the rules generator agree to depth 5 for every rule set.

## Where sources disagree, and what we chose
- **American draws are claimed at a real table** (threefold repetition, 40-move rule). Here they are applied automatically, since there is no referee.
- **Russian king-only limit:** the official text says 15 moves; lidraughts uses 16. We follow the official text.
- **Brazilian draws:** lidraughts plays Brazilian with Russian-style draw rules; we follow the CBJD rulebook (20 king-only moves; arts. 99–100). As in CBJD and FMJD, a capture does not restart a count that still applies; a new count starts only when the material moves into a different rule (Russian counts do restart, as its text says "balance unchanged").
- **FMJD 2024** adds a 5-move rule when the lone king alone holds the long diagonal (medium confidence in our reading). Not implemented; the 16-move rule applies instead.
- **Casual** is a house rule (no rulebook): American rules with optional jumps, but a jump once started must be finished.
- **Huffing** (taking a piece that failed to jump) is an old house rule, not part of any official rules; Casual simply lets you skip the jump.
