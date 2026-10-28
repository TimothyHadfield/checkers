/* The rules sheet and the guided first game (shared kit js/coach.js: never edit that one here).
   Rules in our own words, the same rules js/rules.js plays. Sets window.CkCoach. */
(function (root) {
  'use strict';
  const li = a => '<ul>' + a.map(t => '<li>' + t + '</li>').join('') + '</ul>';

  function rules() {
    return {
      title: 'Checkers rules',
      intro: 'American checkers first (the default), then the other rule sets you can pick on the Play screen.',
      foot: 'Rules in our own words. Every rule set follows its official rulebook; sources are listed in the project’s rules check.',
      sections: [
        { id: 'goal', title: 'Goal', short: 'Goal', html: '<p>Take all of your opponent’s pieces, or leave them with <b>no legal move</b>. Either way you win.</p><p class="tip">With perfect play American checkers is a draw (it was solved in 2007), so most games between good players are decided by one mistake.</p>' },
        { id: 'american', title: 'Setting up and moving (American)', short: 'Moving', html: li(['8×8 board, 12 men each on the dark squares. <b>Black</b> (the dark pieces) moves first.', 'A man moves one square diagonally <b>forward</b> to an empty square.', 'Squares are numbered 1–32 as in checkers books (switch the numbers on in Settings).']) },
        { id: 'jump', title: 'Jumping', short: 'Jumps', html: li(['Jump over an enemy piece next to you onto the empty square behind it; the jumped piece comes off.', '<b>Jumping is compulsory.</b> If any of your pieces can jump, you must jump, but you may choose which jump.', 'If the piece can jump again after landing, it must keep going until the chain ends.', 'Men jump forward only; kings jump both ways.']) + '<p class="tip">On the board, the pieces that must jump glow when you tap a piece that can’t.</p>' },
        { id: 'kings', title: 'Kings', short: 'Kings', html: li(['A man that reaches the far row is <b>crowned</b> (a second piece goes on top) and its move ends there.', 'A king moves and jumps one square diagonally in any direction.']) },
        { id: 'end', title: 'End of the game', short: 'End', html: li(['You lose when you have no pieces left or no legal move.', '<b>Draw:</b> the same position three times, or 40 moves each with only kings moving and nothing captured. Both are applied automatically.', 'You can also offer a draw or resign from the Game menu.']) },
        { id: 'ballot', title: '3-move ballot', short: 'Ballot', html: '<p>Tournaments draw the <b>first three moves</b> at random so that games don’t always start the same way. Switch it on in Settings (American and Casual).</p>' + li(['The three moves are played for you, then the game goes on with White to move.', 'Our list holds every three-move start that our engine judges playable for both sides (the official lists are kept by the checkers federations).', 'The Daily game always starts from one of these openings.']) },
        { id: 'international', title: 'International draughts', short: 'International', html: li(['10×10 board, 20 men each. White moves first.', 'Men move forward but <b>capture forward and backward</b>.', '<b>Kings fly:</b> they move and capture any distance along a diagonal.', 'You must take the <b>largest number of pieces</b> possible (a king counts as one). Pieces come off only after the whole capture.', 'A man is crowned only if it ends its move on the far row.', 'Draws: same position three times; 25 moves each with only kings and no captures; short limits for a few pieces against a lone king.']) },
        { id: 'russian', title: 'Russian draughts', short: 'Russian', html: li(['8×8 board, 12 men each. White moves first.', 'Men capture backward too. Kings fly.', 'Capturing is compulsory, but you may choose <b>any</b> capture (not the longest).', 'A man that reaches the far row during a capture becomes a king at once and keeps capturing as a king.', 'Draws: same position three times; 15 moves each with only kings; endgame move limits.']) },
        { id: 'brazilian', title: 'Brazilian draughts', short: 'Brazilian', html: li(['International rules on an 8×8 board, 12 men each. White moves first.', 'Men capture backward, kings fly, and you must take the most pieces.', 'Draws: same position three times; 20 moves each with only kings and no captures; endgame move limits.']) },
        { id: 'casual', title: 'Casual (jumps optional)', short: 'Casual', html: li(['American checkers, but <b>jumping is optional</b>: you may make a plain move even when a jump is there.', 'If you start a jump, you finish the whole chain.', 'Everything else is the same as American.']) },
        { id: 'help', title: 'Coach, Hint and Undo', short: 'Help', html: li(['The <b>coach</b> (Settings) shows a score bar and grades each move after it is played.', '<b>Hint</b> shows the best move; <b>Undo</b> takes back your last move.', 'A game where you used Hint or Undo counts in My stats as “with help” and doesn’t change your Elo.', 'Leaving a game against the computer after your first move counts as a loss. There’s no Undo in the Daily game.']) },
      ],
    };
  }

  /* The guided first game's steps. ctx: { st: () => the guided game's state or null, my: side, vis(sel) } */
  function steps(ctx) {
    const st = () => ctx.st();
    const mine = () => { const s = st(); if (!s) return 0; let n = 0; for (let i = 0; i < s.moves.length; i++) if ((s.start.turn + i) % 2 === ctx.my) n++; return n; };
    const myTurn = () => { const s = st(); return !!s && !s.result && s.turn === ctx.my && !ctx.busy(); };
    const over = () => { const s = st(); return !!s && !!s.result; };
    const playedOn = () => { let n = null; return () => { const m = mine(); if (n === null) n = m; return m > n; }; };
    const vis = sel => { const el = document.querySelector(sel); return el && el.getClientRects().length ? el : null; };
    const board = () => vis('.board[data-board="play"]') || '#v-play';
    return [
      { title: 'Your first game', text: 'You play Black against the Beginner computer. Win by taking all of White’s pieces or leaving White with no move.', target: board, until: playedOn(), next: true },
      { title: 'Move a man', text: 'Tap one of your men on the front row, then tap a dot. Men move one square diagonally forward.', target: board, when: myTurn, until: () => mine() > 0 },
      { title: 'Jumps are forced', text: 'If you can jump an enemy piece, you must. Keep jumping while you can; the jumped pieces come off and stack beside the board.', target: board, when: () => mine() > 0 && myTurn(), until: playedOn(), next: true, skipIf: over },
      { title: 'Kings', text: 'Reach the far row and your man is crowned. A king moves and jumps backward too.', target: board, when: myTurn, until: playedOn(), next: true, skipIf: over },
      { title: 'The coach', text: 'The bar shows who is better, and your last move gets a grade. Settings can switch the coach off.', target: () => vis('#v-play .evalbar:not(.off)') || vis('#v-play .coach') || board(), when: myTurn, until: playedOn(), next: true, skipIf: over },
      { title: 'Hint and Undo', text: 'Hint shows the best move; Undo takes back your last move. Using either makes a game “with help”: no Elo change.', target: () => vis('#v-play .acts') || board(), until: playedOn(), next: true, skipIf: over },
      { title: 'Play it out', text: 'Keep your men together and head for the far row. Play on until one side wins.', target: board, until: over, skipIf: over },
      { title: 'Game over', text: 'Review grades every move. Your results, Elo and achievements are in My stats; this guided game isn’t counted.', target: () => vis('#v-play .endcard .panel') || board(), when: over },
    ];
  }
  root.CkCoach = { rules, steps };
})(typeof self !== 'undefined' ? self : this);
