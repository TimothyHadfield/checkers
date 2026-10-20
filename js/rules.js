/* Checkers rules for every variant on the site (pure functions, JSON-safe state).
   Shared by the page, the Web Workers and the node tests (UMD: window.CkRules / module.exports).

   Board: only the dark squares exist. Square index s = 0..S-1, numbered row by row from the TOP of
   the screen as seen by the side that moves first (side 0 sits at the bottom and moves "up").
   Cell values: 1 = side-0 man, 2 = side-0 king, -1 = side-1 man, -2 = side-1 king, 0 = empty.
   Every rule fact here is listed with its source in docs/rules-check.md. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CkRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ------------------------------------------------------------------ variants
  // flying: kings move/capture any distance · menBack: men may capture backwards
  // majority: must take the most pieces · crownMid: a man reaching the far row mid-capture is crowned and goes on as a king
  // crownEnd: reaching the far row ends the move (American) · mandatory: captures are compulsory
  // kingLimit: plies of only king moves without a capture before a draw (0 = none)
  const VARIANTS = {
    american: {
      id: 'american', name: 'American', long: 'American checkers', n: 8, rows: 3,
      flying: false, menBack: false, majority: false, crownMid: false, crownEnd: true, mandatory: true,
      sides: ['Black', 'White'], notation: 'num', kingLimit: 80, endgame: 'none',
      blurb: '8×8. Black moves first. Jumps are forced; kings move one square.',
    },
    international: {
      id: 'international', name: 'International', long: 'International draughts', n: 10, rows: 4,
      flying: true, menBack: true, majority: true, crownMid: false, crownEnd: false, mandatory: true,
      sides: ['White', 'Black'], notation: 'num', kingLimit: 50, endgame: 'fmjd',
      blurb: '10×10. White first. Take the most pieces; kings fly.',
    },
    russian: {
      id: 'russian', name: 'Russian', long: 'Russian draughts', n: 8, rows: 3,
      flying: true, menBack: true, majority: false, crownMid: true, crownEnd: false, mandatory: true,
      sides: ['White', 'Black'], notation: 'alg', kingLimit: 30, endgame: 'russian',
      blurb: '8×8. White first. Men jump backwards; kings fly.',
    },
    brazilian: {
      id: 'brazilian', name: 'Brazilian', long: 'Brazilian draughts', n: 8, rows: 3,
      flying: true, menBack: true, majority: true, crownMid: false, crownEnd: false, mandatory: true,
      sides: ['White', 'Black'], notation: 'alg', kingLimit: 40, endgame: 'cbjd',
      blurb: 'International rules on an 8×8 board.',
    },
    casual: {
      id: 'casual', name: 'Casual', long: 'Casual checkers (jumps optional)', n: 8, rows: 3,
      flying: false, menBack: false, majority: false, crownMid: false, crownEnd: true, mandatory: false,
      sides: ['Black', 'White'], notation: 'num', kingLimit: 80, endgame: 'none',
      blurb: 'American rules, but you never have to jump.',
    },
  };
  const VARIANT_IDS = ['american', 'international', 'russian', 'brazilian', 'casual'];
  const V = id => VARIANTS[id] || VARIANTS.american;

  // ------------------------------------------------------------------ geometry
  const GEO = {};
  function geo(n) {
    if (GEO[n]) return GEO[n];
    const half = n / 2, S = n * half;
    const rc = [], idx = new Int16Array(n * n).fill(-1);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if ((r + c) % 2 === 1) { idx[r * n + c] = rc.length; rc.push([r, c]); }
    // directions: 0 up-left, 1 up-right, 2 down-left, 3 down-right
    const DR = [-1, -1, 1, 1], DC = [-1, 1, -1, 1];
    const nb = new Int16Array(S * 4).fill(-1);
    for (let s = 0; s < S; s++) for (let d = 0; d < 4; d++) {
      const r = rc[s][0] + DR[d], c = rc[s][1] + DC[d];
      if (r >= 0 && r < n && c >= 0 && c < n) nb[s * 4 + d] = idx[r * n + c];
    }
    const row = new Int8Array(S); for (let s = 0; s < S; s++) row[s] = rc[s][0];
    GEO[n] = { n, half, S, rc, idx, nb, row };
    return GEO[n];
  }
  const FWD = [[0, 1], [2, 3]];
  const ALL = [0, 1, 2, 3];

  function startBoard(v) {
    const g = geo(v.n), b = new Array(g.S).fill(0);
    for (let s = 0; s < g.S; s++) {
      const r = g.row[s];
      if (r < v.rows) b[s] = -1;
      else if (r >= v.n - v.rows) b[s] = 1;
    }
    return b;
  }

  // ------------------------------------------------------------------ move generation
  // A move: { path: [from, landing1, landing2, ...], caps: [captured squares in order], crown: bool }
  function genMoves(v, board, side) {
    const g = geo(v.n);
    const caps = genCaptures(v, g, board, side);
    if (caps.length && v.mandatory) return caps;
    const quiet = genQuiet(v, g, board, side);
    return caps.length ? caps.concat(quiet) : quiet;
  }

  function genQuiet(v, g, board, side) {
    const out = [], nb = g.nb, sg = side === 0 ? 1 : -1, promo = side === 0 ? 0 : v.n - 1;
    for (let s = 0; s < g.S; s++) {
      const p = board[s] * sg;
      if (p <= 0) continue;
      if (p === 2) {
        for (let d = 0; d < 4; d++) {
          let t = nb[s * 4 + d];
          while (t >= 0 && board[t] === 0) { out.push({ path: [s, t], caps: [], crown: false }); if (!v.flying) break; t = nb[t * 4 + d]; }
        }
      } else {
        const fd = FWD[side];
        for (let i = 0; i < 2; i++) {
          const t = nb[s * 4 + fd[i]];
          if (t >= 0 && board[t] === 0) out.push({ path: [s, t], caps: [], crown: g.row[t] === promo });
        }
      }
    }
    return out;
  }

  function genCaptures(v, g, board, side) {
    const out = [], nb = g.nb, sg = side === 0 ? 1 : -1, promo = side === 0 ? 0 : v.n - 1;
    const capt = new Uint8Array(g.S);
    const isOpp = x => x * sg < 0;
    const path = [], caps = [];

    // can a piece standing on `at` capture anything right now? (used for the flying-king landing rule)
    function canCapFrom(at, king, man) {
      const dirs = king || v.menBack ? ALL : FWD[side];
      for (let i = 0; i < dirs.length; i++) {
        const d = dirs[i];
        if (king && v.flying) {
          let t = nb[at * 4 + d];
          while (t >= 0 && board[t] === 0) t = nb[t * 4 + d];
          if (t < 0 || !isOpp(board[t]) || capt[t]) continue;
          const l = nb[t * 4 + d];
          if (l >= 0 && board[l] === 0) return true;
        } else {
          const o = nb[at * 4 + d];
          if (o < 0 || !isOpp(board[o]) || capt[o]) continue;
          const l = nb[o * 4 + d];
          if (l >= 0 && board[l] === 0) return true;
        }
      }
      return false;
    }

    function emit(king, wasMan) {
      const to = path[path.length - 1];
      out.push({ path: path.slice(), caps: caps.slice(), crown: wasMan && (king || g.row[to] === promo) });
    }

    function dfs(cur, king, wasMan) {
      let any = false;
      const dirs = king || v.menBack ? ALL : FWD[side];
      for (let i = 0; i < dirs.length; i++) {
        const d = dirs[i];
        if (king && v.flying) {
          let t = nb[cur * 4 + d];
          while (t >= 0 && board[t] === 0) t = nb[t * 4 + d];
          if (t < 0 || !isOpp(board[t]) || capt[t]) continue;
          const lands = [];
          let l = nb[t * 4 + d];
          while (l >= 0 && board[l] === 0) { lands.push(l); l = nb[l * 4 + d]; }
          if (!lands.length) continue;
          any = true;
          capt[t] = 1; caps.push(t);
          // if some landing squares let the king keep capturing, it must use one of those
          const cont = lands.filter(x => canCapFrom(x, true));
          const use = cont.length ? cont : lands;
          for (let k = 0; k < use.length; k++) {
            path.push(use[k]);
            if (cont.length) dfs(use[k], true, wasMan); else emit(true, wasMan);
            path.pop();
          }
          caps.pop(); capt[t] = 0;
        } else {
          const o = nb[cur * 4 + d];
          if (o < 0 || !isOpp(board[o]) || capt[o]) continue;
          const l = nb[o * 4 + d];
          if (l < 0 || board[l] !== 0) continue;
          any = true;
          capt[o] = 1; caps.push(o); path.push(l);
          if (!king && g.row[l] === promo) {
            if (v.crownEnd) emit(true, wasMan);          // American: crowning ends the move
            else if (v.crownMid) dfs(l, true, wasMan);   // Russian: crowned now, goes on as a king
            else dfs(l, false, wasMan);                  // International/Brazilian: stays a man unless it stops here
          } else dfs(l, king, wasMan);
          path.pop(); caps.pop(); capt[o] = 0;
        }
      }
      if (!any && caps.length) emit(king, wasMan);
    }

    for (let s = 0; s < g.S; s++) {
      const p = board[s] * sg;
      if (p <= 0) continue;
      board[s] = 0;                // the moving piece leaves its square
      path.length = 0; path.push(s);
      dfs(s, p === 2, p === 1);
      board[s] = p * sg;
    }
    let res = out;
    if (v.majority && res.length) {
      let max = 0;
      for (const m of res) if (m.caps.length > max) max = m.caps.length;
      res = res.filter(m => m.caps.length === max);
    }
    // flying kings can take the same pieces by different routes to the same square: that is one move (FMJD)
    if (v.flying && res.length > 1) {
      const seen = new Set();
      res = res.filter(m => {
        const k = m.path[0] + '>' + m.path[m.path.length - 1] + ':' + m.caps.slice().sort((a, b) => a - b).join(',');
        if (seen.has(k)) return false;
        seen.add(k); return true;
      });
    }
    return res;
  }

  // apply a move to a board (in place); returns the moved piece's old value
  function doMove(board, m) {
    const from = m.path[0], to = m.path[m.path.length - 1];
    const p = board[from];
    board[from] = 0;
    for (let i = 0; i < m.caps.length; i++) board[m.caps[i]] = 0;
    board[to] = m.crown ? (p > 0 ? 2 : -2) : p;
    return p;
  }

  // ------------------------------------------------------------------ material + draw rules
  function material(board) {
    const m = [{ men: 0, kings: 0 }, { men: 0, kings: 0 }];
    for (let i = 0; i < board.length; i++) {
      const x = board[i];
      if (x === 1) m[0].men++; else if (x === 2) m[0].kings++;
      else if (x === -1) m[1].men++; else if (x === -2) m[1].kings++;
    }
    return m;
  }
  // Endgame move limits for the current material. Returns {kind, limit (plies), reset} or {limit:0}.
  // reset: the count restarts whenever material changes (Russian "balance" rules); FMJD/CBJD counts don't.
  // Sources and exact wording: docs/rules-check.md.
  function endgameLimit(v, board) {
    const none = { limit: 0, kind: '', reset: false };
    if (v.endgame === 'none') return none;
    const g = geo(v.n), m = material(board);
    const total = m[0].men + m[0].kings + m[1].men + m[1].kings;
    let best = none;
    const offer = (kind, limit, reset) => { if (!best.limit || limit < best.limit) best = { kind, limit, reset }; };
    for (let s = 0; s < 2; s++) {
      const a = m[s], b = m[1 - s];
      if (!(b.kings === 1 && b.men === 0)) continue;
      const lone = s === 0 ? -2 : 2;
      let onMain = false;
      for (let q = 0; q < g.S; q++) if (board[q] === lone) onMain = g.rc[q][0] + g.rc[q][1] === v.n - 1;
      const tot = a.men + a.kings;
      if (v.endgame === 'fmjd') {          // FMJD 6.3 / 6.4
        if (a.kings >= 1 && tot === 3) offer('16', 32, false);
        if (a.kings >= 1 && tot <= 2) offer('5', 10, false);
      } else if (v.endgame === 'cbjd') {   // CBJD art. 99 / 100
        if (a.kings >= 1 && tot <= 2) offer('5', 10, false);
        if (a.kings >= 1 && tot === 3 && onMain) offer('main', 10, false);
      } else if (v.endgame === 'russian') { // Russian rules 2.1.9.1 .3 .4 .7
        if (tot === 3 && onMain) offer('r7', 10, true);
        if (a.kings >= 3 && (onMain || tot >= 4)) offer('r15', 30, true);
      }
    }
    if (v.endgame === 'russian' && m[0].kings && m[1].kings) { // .5: both sides have kings, balance unchanged
      if (total <= 3) offer('b5', 10, true);
      else if (total <= 5) offer('b30', 60, true);
      else if (total <= 7) offer('b60', 120, true);
    }
    return best;
  }
  const posKey = (board, turn) => turn + ':' + board.map(x => 'kmeMK'[x + 2]).join('');

  // ------------------------------------------------------------------ game state
  // state = { v, variant, start:{board,turn}, board, turn, ply, moves:[path...],
  //           kq (plies of king-only non-captures), reps:[keys since last irreversible move],
  //           eg:{kind, since}, offer: side|-1, result: null|{winner: 0|1|null, reason} }
  function newGame(variant, opts) {
    const v = V(variant);
    opts = opts || {};
    const board = opts.board ? opts.board.slice() : startBoard(v);
    const turn = opts.turn === 1 ? 1 : 0;
    const st = {
      v: 1, variant: v.id, start: { board: board.slice(), turn }, board, turn, ply: 0, moves: [],
      kq: 0, reps: [posKey(board, turn)], eg: null, offer: -1, result: null,
    };
    st.eg = egStart(v, board, 0);
    settle(st);
    return st;
  }
  function egStart(v, board, ply) {
    const e = endgameLimit(v, board);
    return e.limit ? { kind: e.kind, limit: e.limit, since: ply } : null;
  }
  function clone(st) { return JSON.parse(JSON.stringify(st)); }
  function legal(st) { return st.result ? [] : genMoves(V(st.variant), st.board.slice(), st.turn); }
  const samePath = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  function findMove(st, path) {
    if (!Array.isArray(path)) return null;
    const ms = legal(st);
    for (const m of ms) if (samePath(m.path, path)) return m;
    return null;
  }

  // check the end of the game after a move (or at the start)
  function settle(st) {
    const v = V(st.variant);
    if (st.result) return st;
    const ms = genMoves(v, st.board.slice(), st.turn);
    if (!ms.length) { st.result = { winner: 1 - st.turn, reason: 'nomoves' }; return st; }
    const key = st.reps[st.reps.length - 1];
    let n = 0;
    for (const k of st.reps) if (k === key) n++;
    if (n >= 3) { st.result = { winner: null, reason: 'repetition' }; return st; }
    if (v.kingLimit && st.kq >= v.kingLimit) { st.result = { winner: null, reason: 'kingmoves' }; return st; }
    if (st.eg && st.ply - st.eg.since >= st.eg.limit) { st.result = { winner: null, reason: 'endgame' }; return st; }
    return st;
  }

  // action: {path:[...]} a move · {resign:true} · {draw:'offer'|'accept'|'decline'}
  // `side` is who acts. Throws on anything illegal. Returns a NEW state.
  function act(st0, side, action) {
    if (!action || typeof action !== 'object') throw new Error('Bad move');
    if (st0.result) throw new Error('The game is over');
    const st = clone(st0);
    if (action.resign) {
      if (side !== 0 && side !== 1) throw new Error('Bad side');
      st.result = { winner: 1 - side, reason: 'resign' };
      return st;
    }
    if (action.draw) {
      if (action.draw === 'offer') {
        if (side !== st.turn || st.offer >= 0) throw new Error('You can offer a draw on your turn');
        st.offer = side; return st;
      }
      if (st.offer < 0 || side === st.offer) throw new Error('No draw offer to answer');
      if (action.draw === 'accept') { st.result = { winner: null, reason: 'agreed' }; st.offer = -1; return st; }
      if (action.draw === 'decline') { st.offer = -1; return st; }
      throw new Error('Bad move');
    }
    if (st.offer >= 0) throw new Error('Waiting for an answer to the draw offer');
    if (side !== st.turn) throw new Error('Not your turn');
    const m = findMove(st, action.path);
    if (!m) throw new Error('Illegal move');
    const v = V(st.variant);
    const p = doMove(st.board, m);
    const irreversible = m.caps.length > 0 || Math.abs(p) === 1;
    st.kq = irreversible ? 0 : st.kq + 1;
    st.moves.push(m.path.slice());
    st.ply++;
    st.turn = 1 - st.turn;
    const key = posKey(st.board, st.turn);
    st.reps = irreversible ? [key] : st.reps.concat([key]);
    // the endgame counter restarts whenever the material changes
    const matChanged = m.caps.length > 0 || m.crown;
    if (matChanged) {
      const e = endgameLimit(v, st.board);
      if (!e.limit) st.eg = null;
      else if (!st.eg || st.eg.kind !== e.kind || e.reset) st.eg = { kind: e.kind, limit: e.limit, since: st.ply };
    }
    return settle(st);
  }

  // how many moves (per side) until an automatic draw, or null
  function drawCountdown(st) {
    const v = V(st.variant);
    const out = [];
    if (v.kingLimit && st.kq > 0) out.push({ left: Math.ceil((v.kingLimit - st.kq) / 2), why: 'kings' });
    if (st.eg) out.push({ left: Math.ceil((st.eg.limit - (st.ply - st.eg.since)) / 2), why: st.eg.kind });
    let rep = 0;
    const key = st.reps[st.reps.length - 1];
    for (const k of st.reps) if (k === key) rep++;
    if (rep === 2) out.push({ left: 0, why: 'repeat' });
    out.sort((a, b) => a.left - b.left);
    return out[0] || null;
  }

  // ------------------------------------------------------------------ notation
  function sqName(variant, s) {
    const v = V(variant), g = geo(v.n), r = g.rc[s][0], c = g.rc[s][1];
    if (v.notation === 'alg') return 'abcdefghij'[c] + (v.n - r);
    if (v.n === 8) { // American: Black (first mover) on 1-12, square 1 in Black's far-right double corner
      const rr = v.n - 1 - r, cc = v.n - 1 - c;
      return String(rr * 4 + Math.floor(cc / 2) + 1);
    }
    return String(r * g.half + Math.floor(c / 2) + 1); // international: White (first mover) on 31-50
  }
  function moveText(variant, path, caps) {
    const v = V(variant);
    const isCap = caps ? caps.length > 0 : false;
    const sep = isCap ? (v.notation === 'alg' ? ':' : 'x') : '-';
    if (!isCap) return sqName(variant, path[0]) + sep + sqName(variant, path[path.length - 1]);
    return path.map(s => sqName(variant, s)).join(sep);
  }

  // replay a game from its start (for review and online)
  function replay(st, upto) {
    let s = newGame(st.variant, { board: st.start.board, turn: st.start.turn });
    const n = upto == null ? st.moves.length : upto;
    for (let i = 0; i < n; i++) s = act(s, s.turn, { path: st.moves[i] });
    return s;
  }
  function capsOf(st, path) { const m = findMove(st, path); return m ? m.caps : []; }

  const REASONS = {
    nomoves: 'no moves left', resign: 'resigned', repetition: 'same position three times',
    kingmoves: 'too many king moves without a capture', endgame: 'endgame move limit', agreed: 'draw agreed',
  };

  return {
    VARIANTS, VARIANT_IDS, V, geo, startBoard, genMoves, genCaptures, genQuiet, doMove, material,
    endgameLimit, posKey, newGame, legal, findMove, act, settle, clone, drawCountdown, sqName, moveText,
    replay, capsOf, REASONS, samePath,
  };
});
