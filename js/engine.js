/* The checkers engine: alpha-beta (PVS) with iterative deepening, a transposition table, killer and
   history move ordering, forced-capture quiescence, single-reply extensions, draw-rule awareness and
   endgame knowledge. Typed arrays only, so it is fast in a Web Worker and in node.
   Works for every variant in CkRules (8x8 and 10x10, short or flying kings).
   UMD: window.CkEngine / module.exports. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'));
  else root.CkEngine = factory(root.CkRules);
})(typeof self !== 'undefined' ? self : this, function (R) {
  'use strict';

  const MAXPLY = 100, MM = 160, CAPMAX = 24, MATE = 30000, INF = 32000;
  const B = new Int8Array(50);
  const mFrom = new Int16Array(MAXPLY * MM), mTo = new Int16Array(MAXPLY * MM), mCrown = new Int8Array(MAXPLY * MM);
  const mPiece = new Int8Array(MAXPLY * MM), mNc = new Int8Array(MAXPLY * MM), mScore = new Int32Array(MAXPLY * MM);
  const mCaps = new Int16Array(MAXPLY * MM * CAPMAX), mCapV = new Int8Array(MAXPLY * MM * CAPMAX);
  const mCount = new Int32Array(MAXPLY);
  const capt = new Uint8Array(50), pathCaps = new Int16Array(CAPMAX);
  let pcN = 0;

  // ---- variant context
  let v = null, g = null, S = 0, N = 0, NB = null, ROW = null;
  let MAN = 100, KING = 135, kingLimit = 0;
  let advTab = [null, null], advLate = [null, null], kingTab = null, onMain = null, dblCorner = null, distTab = null;
  const FWD = [[0, 1], [2, 3]], ALL = [0, 1, 2, 3];

  // ---- zobrist
  const ZLO = new Int32Array(50 * 4), ZHI = new Int32Array(50 * 4);
  let SIDE_LO, SIDE_HI;
  (function () {
    let a = 0x9e3779b9 | 0;
    const rnd = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return (t ^ (t >>> 14)) | 0; };
    for (let i = 0; i < 200; i++) { ZLO[i] = rnd(); ZHI[i] = rnd(); }
    SIDE_LO = rnd(); SIDE_HI = rnd();
  })();
  const pidx = x => (x === 1 ? 0 : x === 2 ? 1 : x === -1 ? 2 : 3);
  let hLo = 0, hHi = 0;

  // ---- transposition table
  const TT_BITS = 19, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
  const ttKey = new Int32Array(TT_SIZE), ttScore = new Int16Array(TT_SIZE), ttDepth = new Int8Array(TT_SIZE);
  const ttFlag = new Uint8Array(TT_SIZE), ttMove = new Uint8Array(TT_SIZE);
  const EXACT = 1, LOWER = 2, UPPER = 3;

  // ---- ordering
  const killer = new Int32Array(MAXPLY * 2);
  const hist = new Int32Array(50 * 50);
  const hashLo = new Int32Array(MAXPLY + 200), hashHi = new Int32Array(MAXPLY + 200);

  function setVariant(id) {
    const nv = R.V(id);
    if (v === nv) return;
    v = nv; g = R.geo(v.n); S = g.S; N = v.n; NB = g.nb; ROW = g.row;
    kingLimit = v.kingLimit;
    MAN = 100;
    KING = v.flying ? (N === 10 ? 300 : 250) : 135;
    const mid = (N - 1) / 2;
    advTab = [new Int16Array(S), new Int16Array(S)];
    advLate = [new Int16Array(S), new Int16Array(S)];
    kingTab = new Int16Array(S); onMain = new Uint8Array(S); dblCorner = new Uint8Array(S);
    for (let s = 0; s < S; s++) {
      const r = g.rc[s][0], c = g.rc[s][1];
      const cen = Math.abs(c - mid) <= 1.5 && Math.abs(r - mid) <= 1.5 ? 1 : 0;
      for (let side = 0; side < 2; side++) {
        const adv = side === 0 ? N - 1 - r : r;             // rows advanced from own back row
        let a = adv * 3 + cen * 5;
        if (adv === 0) a += 9;                               // back-rank guard against enemy kings
        if (c === 0 || c === N - 1) a -= 3;                  // edge men are less flexible
        advTab[side][s] = a;
        advLate[side][s] = adv * adv * (N === 10 ? 2 : 4);  // late game: racing to crown matters
      }
      const dc = Math.abs(c - mid) + Math.abs(r - mid);
      kingTab[s] = Math.round(12 - dc * 2.2);
      if (r + c === N - 1) onMain[s] = 1;                   // the long (main) diagonal a1-h8
      if ((r <= 1 && c <= 1) || (r >= N - 2 && c >= N - 2)) dblCorner[s] = 1;
      if (v.flying && onMain[s]) kingTab[s] += 14;
    }
    distTab = new Int8Array(S * S);
    for (let a = 0; a < S; a++) for (let b = 0; b < S; b++)
      distTab[a * S + b] = Math.max(Math.abs(g.rc[a][0] - g.rc[b][0]), Math.abs(g.rc[a][1] - g.rc[b][1]));
    clearTT();
  }
  function clearTT() { ttKey.fill(0); ttDepth.fill(0); ttFlag.fill(0); hist.fill(0); killer.fill(-1); }

  // ------------------------------------------------------------------ move generation into ply p
  let gp = 0, gBase = 0, gSide = 0, gSg = 1, gPromo = 0;
  function addMove(from, to, crown, piece) {
    const i = mCount[gp];
    if (i >= MM) return;
    const k = gBase + i;
    mFrom[k] = from; mTo[k] = to; mCrown[k] = crown ? 1 : 0; mPiece[k] = piece; mNc[k] = pcN;
    const cb = k * CAPMAX;
    for (let j = 0; j < pcN; j++) { mCaps[cb + j] = pathCaps[j]; mCapV[cb + j] = B[pathCaps[j]]; }
    mCount[gp] = i + 1;
  }
  function canCapFrom(at, king) {
    const dirs = king || v.menBack ? ALL : FWD[gSide];
    for (let i = 0; i < dirs.length; i++) {
      const d = dirs[i];
      let t = NB[at * 4 + d];
      if (king && v.flying) while (t >= 0 && B[t] === 0) t = NB[t * 4 + d];
      if (t < 0 || B[t] * gSg >= 0 || capt[t]) continue;
      const l = NB[t * 4 + d];
      if (l >= 0 && B[l] === 0) return true;
    }
    return false;
  }
  const landBuf = new Int16Array(MAXPLY * 16 * 10);
  function dfs(from, piece, cur, king, wasMan, depth) {
    let any = false;
    const dirs = king || v.menBack ? ALL : FWD[gSide];
    for (let i = 0; i < dirs.length; i++) {
      const d = dirs[i];
      if (king && v.flying) {
        let t = NB[cur * 4 + d];
        while (t >= 0 && B[t] === 0) t = NB[t * 4 + d];
        if (t < 0 || B[t] * gSg >= 0 || capt[t]) continue;
        const lb = depth * 10 * 2; // two halves: lands, then continuing lands
        let nl = 0, l = NB[t * 4 + d];
        while (l >= 0 && B[l] === 0) { landBuf[lb + nl++] = l; l = NB[l * 4 + d]; }
        if (!nl) continue;
        any = true;
        capt[t] = 1; pathCaps[pcN++] = t;
        let nc = 0;
        for (let k = 0; k < nl; k++) if (canCapFrom(landBuf[lb + k], true)) landBuf[lb + 10 + nc++] = landBuf[lb + k];
        if (nc) for (let k = 0; k < nc; k++) dfs(from, piece, landBuf[lb + 10 + k], true, wasMan, depth + 1);
        else for (let k = 0; k < nl; k++) addMove(from, landBuf[lb + k], wasMan, piece);
        pcN--; capt[t] = 0;
      } else {
        const o = NB[cur * 4 + d];
        if (o < 0 || B[o] * gSg >= 0 || capt[o]) continue;
        const l = NB[o * 4 + d];
        if (l < 0 || B[l] !== 0) continue;
        any = true;
        capt[o] = 1; pathCaps[pcN++] = o;
        if (!king && ROW[l] === gPromo) {
          if (v.crownEnd) addMove(from, l, true, piece);
          else if (v.crownMid) dfs(from, piece, l, true, wasMan, depth + 1);
          else dfs(from, piece, l, false, wasMan, depth + 1);
        } else dfs(from, piece, l, king, wasMan, depth + 1);
        pcN--; capt[o] = 0;
      }
    }
    if (!any && pcN) addMove(from, cur, wasMan && (king || ROW[cur] === gPromo), piece);
  }
  // returns number of moves; captures first. capsOnly: only captures (for casual quiescence)
  function gen(p, side, capsOnly) {
    gp = p; gBase = p * MM; gSide = side; gSg = side === 0 ? 1 : -1; gPromo = side === 0 ? 0 : N - 1;
    mCount[p] = 0; pcN = 0;
    for (let s = 0; s < S; s++) {
      const x = B[s] * gSg;
      if (x <= 0) continue;
      B[s] = 0;
      dfs(s, x * gSg, s, x === 2, x === 1, 0);
      B[s] = x * gSg;
    }
    let n = mCount[p];
    if (n && v.majority) {
      let max = 0;
      for (let i = 0; i < n; i++) if (mNc[gBase + i] > max) max = mNc[gBase + i];
      let w = 0;
      for (let i = 0; i < n; i++) if (mNc[gBase + i] === max) { if (w !== i) copyMove(gBase + i, gBase + w); w++; }
      n = mCount[p] = w;
    }
    if (n > 1 && v.flying) n = mCount[p] = dedup(n);
    if (n && v.mandatory) return n;
    if (capsOnly) return n;
    // quiet moves
    for (let s = 0; s < S; s++) {
      const x = B[s] * gSg;
      if (x <= 0) continue;
      if (x === 2) {
        for (let d = 0; d < 4; d++) {
          let t = NB[s * 4 + d];
          while (t >= 0 && B[t] === 0) { addMove(s, t, false, B[s]); if (!v.flying) break; t = NB[t * 4 + d]; }
        }
      } else {
        const fd = FWD[side];
        for (let i = 0; i < 2; i++) {
          const t = NB[s * 4 + fd[i]];
          if (t >= 0 && B[t] === 0) addMove(s, t, ROW[t] === gPromo, B[s]);
        }
      }
    }
    return mCount[p];
  }
  // same pieces taken, same start and end square = one move (FMJD); different routes don't count twice
  function dedup(n) {
    let w = 0;
    for (let i = 0; i < n; i++) {
      const ki = gBase + i;
      let dup = false;
      for (let j = 0; j < w && !dup; j++) {
        const kj = gBase + j;
        if (mFrom[kj] !== mFrom[ki] || mTo[kj] !== mTo[ki] || mNc[kj] !== mNc[ki]) continue;
        let all = true;
        for (let a = 0; a < mNc[ki] && all; a++) {
          const c = mCaps[ki * CAPMAX + a];
          let f = false;
          for (let b = 0; b < mNc[kj]; b++) if (mCaps[kj * CAPMAX + b] === c) { f = true; break; }
          all = f;
        }
        dup = all;
      }
      if (!dup) { if (w !== i) copyMove(ki, gBase + w); w++; }
    }
    return w;
  }
  function copyMove(a, b) {
    mFrom[b] = mFrom[a]; mTo[b] = mTo[a]; mCrown[b] = mCrown[a]; mPiece[b] = mPiece[a]; mNc[b] = mNc[a];
    const ca = a * CAPMAX, cb = b * CAPMAX;
    for (let j = 0; j < mNc[a]; j++) { mCaps[cb + j] = mCaps[ca + j]; mCapV[cb + j] = mCapV[ca + j]; }
  }

  function make(k) {
    const f = mFrom[k], t = mTo[k], p = mPiece[k];
    B[f] = 0; hLo ^= ZLO[f * 4 + pidx(p)]; hHi ^= ZHI[f * 4 + pidx(p)];
    const cb = k * CAPMAX;
    for (let j = 0; j < mNc[k]; j++) { const c = mCaps[cb + j], cv = mCapV[cb + j]; B[c] = 0; hLo ^= ZLO[c * 4 + pidx(cv)]; hHi ^= ZHI[c * 4 + pidx(cv)]; }
    const np = mCrown[k] ? (p > 0 ? 2 : -2) : p;
    B[t] = np; hLo ^= ZLO[t * 4 + pidx(np)]; hHi ^= ZHI[t * 4 + pidx(np)];
    hLo ^= SIDE_LO; hHi ^= SIDE_HI;
  }
  function unmake(k) {
    const f = mFrom[k], t = mTo[k], p = mPiece[k];
    const np = mCrown[k] ? (p > 0 ? 2 : -2) : p;
    B[t] = 0; hLo ^= ZLO[t * 4 + pidx(np)]; hHi ^= ZHI[t * 4 + pidx(np)];
    const cb = k * CAPMAX;
    for (let j = 0; j < mNc[k]; j++) { const c = mCaps[cb + j], cv = mCapV[cb + j]; B[c] = cv; hLo ^= ZLO[c * 4 + pidx(cv)]; hHi ^= ZHI[c * 4 + pidx(cv)]; }
    B[f] = p; hLo ^= ZLO[f * 4 + pidx(p)]; hHi ^= ZHI[f * 4 + pidx(p)];
    hLo ^= SIDE_LO; hHi ^= SIDE_HI;
  }
  function computeHash(side) {
    let lo = 0, hi = 0;
    for (let s = 0; s < S; s++) if (B[s]) { lo ^= ZLO[s * 4 + pidx(B[s])]; hi ^= ZHI[s * 4 + pidx(B[s])]; }
    if (side === 1) { lo ^= SIDE_LO; hi ^= SIDE_HI; }
    return [lo, hi];
  }

  // ------------------------------------------------------------------ evaluation (side-0 view)
  const sqList = [new Int16Array(50), new Int16Array(50)];
  function evaluate(side) {
    let sc = 0, m0 = 0, k0 = 0, m1 = 0, k1 = 0;
    for (let s = 0; s < S; s++) {
      const x = B[s];
      if (x === 0) continue;
      if (x === 1) { m0++; sc += advTab[0][s]; }
      else if (x === -1) { m1++; sc -= advTab[1][s]; }
      else if (x === 2) { sqList[0][k0++] = s; sc += kingTab[s]; }
      else { sqList[1][k1++] = s; sc -= kingTab[s]; }
    }
    const tot = m0 + k0 + m1 + k1;
    const mat0 = m0 * MAN + k0 * KING, mat1 = m1 * MAN + k1 * KING;
    let diff = mat0 - mat1;
    // trading down when ahead: the same lead counts for more on an emptier board
    const full = 2 * v.rows * g.half;
    diff += Math.trunc(diff * (full - tot) / (full * 2));
    sc += diff;
    if (tot <= (N === 10 ? 20 : 14)) {
      for (let s = 0; s < S; s++) {
        const x = B[s];
        if (x === 1) sc += advLate[0][s] + (k1 === 0 ? runaway(s, 0) : 0);
        else if (x === -1) sc -= advLate[1][s] + (k0 === 0 ? runaway(s, 1) : 0);
      }
    }
    // kings-only endgames
    if (m0 + m1 === 0 && k0 && k1) {
      if (k0 === k1) sc = Math.trunc(sc / 4);
      const strong = k0 > k1 ? 0 : k1 > k0 ? 1 : -1;
      if (strong >= 0) {
        const ws = 1 - strong, sgn = strong === 0 ? 1 : -1;
        let bonus = 0;
        for (let i = 0; i < (strong === 0 ? k0 : k1); i++) {
          let best = 99;
          for (let j = 0; j < (ws === 0 ? k0 : k1); j++) best = Math.min(best, distTab[sqList[strong][i] * S + sqList[ws][j]]);
          bonus -= best * 4;
        }
        for (let j = 0; j < (ws === 0 ? k0 : k1); j++) {
          const w = sqList[ws][j];
          if (!v.flying && dblCorner[w]) bonus -= 12;
          bonus -= kingTab[w];
        }
        sc += sgn * bonus;
      }
    }
    // flying-king endgames that are known draws (a lone king holds against small material)
    if (v.flying) {
      if ((k1 === 1 && m1 === 0 && m0 + k0 <= 3 && k0 >= 1) || (k0 === 1 && m0 === 0 && m1 + k1 <= 3 && k1 >= 1)) {
        const lone = k1 === 1 && m1 === 0 && m0 + k0 <= 3 ? 1 : 0;
        const big = lone === 0 ? m1 + k1 : m0 + k0;
        const holdsMain = onMain[sqList[lone][0]];
        if (big <= 2 || (v.id !== 'russian') || holdsMain) sc = Math.trunc(sc / 12);
      }
    }
    return side === 0 ? sc : -sc;
  }
  // a man nobody can stop from crowning (no enemy kings; nothing in its path cone)
  function runaway(s, side) {
    const r = g.rc[s][0], c = g.rc[s][1];
    const dir = side === 0 ? -1 : 1, goal = side === 0 ? 0 : N - 1;
    const steps = Math.abs(goal - r);
    if (steps === 0) return 0;
    for (let k = 1; k <= steps; k++) {
      const rr = r + dir * k;
      for (let cc = c - k - 1; cc <= c + k + 1; cc++) {
        if (cc < 0 || cc >= N) continue;
        const q = g.idx[rr * N + cc];
        if (q >= 0 && B[q] !== 0 && (side === 0 ? B[q] < 0 : B[q] > 0)) return 0;
      }
    }
    return Math.max(0, Math.round((KING - MAN) * 0.6) - steps * 6);
  }

  // ------------------------------------------------------------------ search
  let nodes = 0, stopAt = 0, nodeLimit = 0, aborted = false, rootHist = [], egLeft = 1e9;
  function timeUp() {
    if (nodeLimit && nodes >= nodeLimit) return true;
    if (stopAt && Date.now() >= stopAt) return true;
    return false;
  }

  function orderScore(p, n, ttm, ply) {
    const base = p * MM;
    const k1 = killer[ply * 2], k2 = killer[ply * 2 + 1];
    for (let i = 0; i < n; i++) {
      const k = base + i;
      let sc = 0;
      if (i === ttm) sc = 1 << 29;
      else {
        sc = mNc[k] * 1000000 + (mCrown[k] ? 500000 : 0);
        const key = mFrom[k] * 64 + mTo[k];
        if (key === k1) sc += 400000; else if (key === k2) sc += 300000;
        sc += Math.min(hist[mFrom[k] * 50 + mTo[k]], 200000);
      }
      mScore[k] = sc;
    }
  }
  function pick(p, i, n) {
    const base = p * MM;
    let bi = i, bs = mScore[base + i];
    for (let j = i + 1; j < n; j++) if (mScore[base + j] > bs) { bs = mScore[base + j]; bi = j; }
    if (bi !== i) { swapMove(base + i, base + bi); }
  }
  function swapMove(a, b) {
    let t;
    t = mFrom[a]; mFrom[a] = mFrom[b]; mFrom[b] = t;
    t = mTo[a]; mTo[a] = mTo[b]; mTo[b] = t;
    t = mCrown[a]; mCrown[a] = mCrown[b]; mCrown[b] = t;
    t = mPiece[a]; mPiece[a] = mPiece[b]; mPiece[b] = t;
    t = mNc[a]; mNc[a] = mNc[b]; mNc[b] = t;
    t = mScore[a]; mScore[a] = mScore[b]; mScore[b] = t;
    const ca = a * CAPMAX, cb = b * CAPMAX, m = Math.max(mNc[a], mNc[b]);
    for (let j = 0; j < m; j++) {
      t = mCaps[ca + j]; mCaps[ca + j] = mCaps[cb + j]; mCaps[cb + j] = t;
      t = mCapV[ca + j]; mCapV[ca + j] = mCapV[cb + j]; mCapV[cb + j] = t;
    }
  }
  // the TT stores the move's (from,to,ncaps) signature, re-found after generation (lists are reordered in place)
  function sig(k) { return ((mFrom[k] * 64 + mTo[k]) * 32 + mNc[k]) & 0xffff; }
  const ttSig = new Uint16Array(TT_SIZE);

  function isRepetition(ply, kq) {
    // same position with the same side to move, inside the reversible stretch
    const lim = Math.min(kq, ply + rootHist.length);
    for (let back = 4; back <= lim; back += 2) {
      const i = ply - back;
      if (i >= 0) { if (hashLo[i] === hLo && hashHi[i] === hHi) return true; }
      else {
        const h = rootHist[rootHist.length + i];
        if (h && h[0] === hLo && h[1] === hHi) return true;
      }
    }
    return false;
  }

  function search(depth, alpha, beta, ply, side, kq, extended) {
    if ((++nodes & 2047) === 0 && timeUp()) aborted = true;
    if (aborted) return 0;
    hashLo[ply] = hLo; hashHi[ply] = hHi;
    if (ply > 0) {
      if (kingLimit && kq >= kingLimit) return 0;
      if (ply >= egLeft) return 0;
      if (kq >= 4 && isRepetition(ply, kq)) return 0;
    }
    if (ply >= MAXPLY - 2) return evaluate(side);
    const n = gen(ply, side, false);
    if (n === 0) return -(MATE - ply);
    const base = ply * MM;
    const capturing = mNc[base] > 0;
    if (depth <= 0) {
      if (!capturing) {
        if (v.mandatory) return evaluate(side);
      } else if (!v.mandatory) {
        // casual: you may decline a capture, so standing pat is allowed
        const stand = evaluate(side);
        if (stand >= beta) return stand;
        if (stand > alpha) alpha = stand;
        let cn = 0;
        for (let i = 0; i < n; i++) if (mNc[base + i]) cn++;
        if (!cn) return stand;
      }
    }
    // single reply: don't spend depth on it
    if (n === 1 && depth > 0 && !extended) depth++;

    // transposition table
    const ti = hLo & TT_MASK;
    let ttm = -1;
    if (ttKey[ti] === hHi && ttFlag[ti]) {
      const sg = ttSig[ti];
      for (let i = 0; i < n; i++) if (sig(base + i) === sg) { ttm = i; break; }
      if (ttDepth[ti] >= depth && ply > 0) {
        let sc = ttScore[ti];
        if (sc > MATE - 500) sc -= ply; else if (sc < -MATE + 500) sc += ply;
        const f = ttFlag[ti];
        if (f === EXACT) return sc;
        if (f === LOWER && sc >= beta) return sc;
        if (f === UPPER && sc <= alpha) return sc;
      }
    }
    orderScore(ply, n, ttm, ply);
    const a0 = alpha;
    let best = -INF, bestSig = 0, bestKey = -1;
    for (let i = 0; i < n; i++) {
      pick(ply, i, n);
      const k = base + i;
      if (depth <= 0 && !v.mandatory && !mNc[k]) continue; // casual quiescence: captures only
      const isKingQuiet = mNc[k] === 0 && (mPiece[k] === 2 || mPiece[k] === -2);
      const nkq = isKingQuiet ? kq + 1 : 0;
      make(k);
      let sc;
      if (i === 0 || depth <= 0) sc = -search(depth - 1, -beta, -alpha, ply + 1, 1 - side, nkq, extended || n === 1);
      else {
        // late quiet moves get a shallower look first (re-searched if they surprise)
        let red = 0;
        if (depth >= 3 && i >= 3 && !mNc[k] && !mCrown[k] && mScore[k] < 300000) red = i >= 8 && depth >= 5 ? 2 : 1;
        sc = -search(depth - 1 - red, -alpha - 1, -alpha, ply + 1, 1 - side, nkq, extended || n === 1);
        if (red && sc > alpha && !aborted) sc = -search(depth - 1, -alpha - 1, -alpha, ply + 1, 1 - side, nkq, extended || n === 1);
        if (sc > alpha && sc < beta && !aborted) sc = -search(depth - 1, -beta, -alpha, ply + 1, 1 - side, nkq, extended || n === 1);
      }
      unmake(k);
      if (aborted) return 0;
      if (sc > best) { best = sc; bestSig = sig(k); bestKey = mFrom[k] * 64 + mTo[k]; }
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) {
        if (!mNc[k]) {
          if (killer[ply * 2] !== bestKey) { killer[ply * 2 + 1] = killer[ply * 2]; killer[ply * 2] = bestKey; }
          if (depth > 0) hist[mFrom[k] * 50 + mTo[k]] += depth * depth;
        }
        break;
      }
    }
    if (best === -INF) return alpha; // casual quiescence with no captures searched
    // store
    if (depth >= ttDepth[ti] || ttKey[ti] !== hHi) {
      let st = best;
      if (st > MATE - 500) st += ply; else if (st < -MATE + 500) st -= ply;
      ttKey[ti] = hHi; ttScore[ti] = Math.max(-32000, Math.min(32000, st)); ttDepth[ti] = Math.max(-100, Math.min(100, depth));
      ttFlag[ti] = best <= a0 ? UPPER : best >= beta ? LOWER : EXACT; ttSig[ti] = bestSig;
    }
    return best;
  }

  // ------------------------------------------------------------------ public API
  function loadState(st) {
    setVariant(st.variant);
    for (let s = 0; s < S; s++) B[s] = st.board[s];
    const h = computeHash(st.turn); hLo = h[0]; hHi = h[1];
    // earlier positions since the last irreversible move (for repetition)
    rootHist = [];
    const keys = st.reps.slice(0, -1);
    const save = Array.from(B.subarray(0, S));
    for (const key of keys) {
      const parts = key.split(':'), side = +parts[0], str = parts[1];
      for (let s = 0; s < S; s++) B[s] = 'kmeMK'.indexOf(str[s]) - 2;
      rootHist.push(computeHash(side));
    }
    for (let s = 0; s < S; s++) B[s] = save[s];
    egLeft = st.eg ? Math.max(1, st.eg.limit - (st.ply - st.eg.since)) : 1e9;
  }
  function moveOf(k) {
    const caps = [];
    for (let j = 0; j < mNc[k]; j++) caps.push(mCaps[k * CAPMAX + j]);
    return { from: mFrom[k], to: mTo[k], caps };
  }
  // match an engine move to a rules move (rules moves carry the full path)
  function toRules(legal, em) {
    const cs = em.caps.slice().sort((a, b) => a - b).join(',');
    for (const m of legal) {
      if (m.path[0] !== em.from || m.path[m.path.length - 1] !== em.to || m.caps.length !== em.caps.length) continue;
      if (m.caps.slice().sort((a, b) => a - b).join(',') === cs) return m;
    }
    return null;
  }
  function rngFrom(seed) {
    let a = seed | 0;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /* think(state, opts) -> { move: rules move, score (centi-men, from the side to move), depth, nodes, pv:[{from,to,caps}],
                            roots: [{move, score}] when opts.multi }
     opts: { depth, nodes, ms, multi, noise (centi-men), seed, newGame } */
  function think(st, opts) {
    opts = opts || {};
    const legal = R.legal(st);
    if (!legal.length) return { move: null, score: -MATE, depth: 0, nodes: 0, pv: [], roots: [] };
    loadState(st);
    if (opts.newGame) clearTT();
    nodes = 0; aborted = false;
    nodeLimit = opts.nodes || 0;
    stopAt = opts.ms ? Date.now() + opts.ms : 0;
    const maxDepth = Math.min(opts.depth || 60, MAXPLY - 20);
    const side = st.turn;
    let bestK = -1, bestScore = 0, done = 0, bestMove = null;
    const rootN = gen(0, side, false);
    // root list kept stable in its own arrays
    const roots = [];
    for (let i = 0; i < rootN; i++) roots.push({ em: moveOf(i), score: -INF });
    if (rootN === 1 && !opts.multi) {
      const m = toRules(legal, roots[0].em);
      return { move: m, score: 0, depth: 0, nodes: 0, pv: [roots[0].em], roots: [], forced: true };
    }
    let order = roots.map((_, i) => i);
    for (let d = 1; d <= maxDepth; d++) {
      let alpha = -INF, beta = INF, iterBest = -1, iterScore = -INF;
      for (let oi = 0; oi < order.length; oi++) {
        const ri = order[oi];
        // regenerate ply 0 each time (search below overwrites nothing at ply 0, but keep it simple)
        const k = findRoot(roots[ri].em, side);
        make(k);
        const kq = roots[ri].em.caps.length === 0 && Math.abs(mPiece[k]) === 2 ? st.kq + 1 : 0;
        let sc;
        if (opts.multi || oi === 0) sc = -search(d - 1, -INF, INF, 1, 1 - side, kq, false);
        else {
          sc = -search(d - 1, -alpha - 1, -alpha, 1, 1 - side, kq, false);
          if (sc > alpha && !aborted) sc = -search(d - 1, -beta, -alpha, 1, 1 - side, kq, false);
        }
        unmake(findRoot(roots[ri].em, side, true));
        if (aborted) break;
        roots[ri].score = (opts.multi || oi === 0 || sc > alpha) ? sc : Math.min(sc, alpha);
        roots[ri].exact = opts.multi || oi === 0 || sc > alpha;
        if (sc > iterScore) { iterScore = sc; iterBest = ri; }
        if (sc > alpha) alpha = sc;
      }
      if (aborted && iterBest < 0) break;
      if (iterBest >= 0) { bestK = iterBest; bestScore = iterScore; done = aborted ? done : d; }
      if (aborted) break;
      // next iteration: best first, then by score
      order.sort((a, b) => (a === bestK ? -1 : b === bestK ? 1 : roots[b].score - roots[a].score));
      if (Math.abs(bestScore) > MATE - 200 && d > MATE - Math.abs(bestScore) + 2) break; // forced win/loss found
      // don't start an iteration we can't finish (each one takes ~3x the last)
      if (stopAt && opts.ms && Date.now() > stopAt - opts.ms * 0.45) break;
    }
    if (bestK < 0) bestK = 0;
    // noise for the weak levels: pick among root moves with random jitter (needs the multi scores)
    let pickK = bestK;
    if (opts.noise && opts.multi) {
      const rnd = rngFrom(opts.seed == null ? (Date.now() & 0xffffff) : opts.seed);
      let bs = -INF;
      for (let i = 0; i < roots.length; i++) {
        const s = roots[i].score + (rnd() * 2 - 1) * opts.noise;
        if (s > bs) { bs = s; pickK = i; }
      }
    }
    bestMove = toRules(legal, roots[pickK].em);
    const pv = principal(st, roots[bestK].em, 14);
    const out = { move: bestMove, score: bestScore, depth: done, nodes, pv };
    if (opts.multi) out.roots = roots.map(r => ({ move: toRules(legal, r.em), score: r.score }));
    return out;
  }
  function findRoot(em, side, after) {
    // ply 0 holds the root list; it may have been regenerated by nothing else, so look it up
    const n = mCount[0];
    for (let i = 0; i < n; i++) {
      const k = i;
      if (mFrom[k] === em.from && mTo[k] === em.to && mNc[k] === em.caps.length) {
        let same = true;
        for (let j = 0; j < mNc[k]; j++) if (mCaps[k * CAPMAX + j] !== em.caps[j]) { same = false; break; }
        if (same) return k;
      }
    }
    void after;
    gen(0, side, false);
    return findRoot(em, side);
  }
  // walk the TT from the best root move to get the expected line
  function principal(st, first, max) {
    loadState(st);
    const pv = [first];
    let side = st.turn;
    gen(0, side, false);
    let k = findRoot(first, side);
    const made = [];
    make(k); made.push(k); side = 1 - side;
    const seen = new Set();
    for (let ply = 1; ply < max; ply++) {
      const key = hLo + ':' + hHi;
      if (seen.has(key)) break;
      seen.add(key);
      const n = gen(ply, side, false);
      if (!n) break;
      const ti = hLo & TT_MASK;
      if (ttKey[ti] !== hHi || !ttFlag[ti]) break;
      let found = -1;
      for (let i = 0; i < n; i++) if (sig(ply * MM + i) === ttSig[ti]) { found = ply * MM + i; break; }
      if (found < 0) break;
      pv.push(moveOf(found));
      make(found); made.push(found); side = 1 - side;
    }
    for (let i = made.length - 1; i >= 0; i--) unmake(made[i]);
    return pv;
  }

  // static evaluation of a state from side 0's view (for tests)
  function staticEval(st) { loadState(st); return evaluate(0); }

  // perft over the fast generator (tests compare it with CkRules)
  function perft(st, depth) {
    loadState(st);
    function rec(d, ply, side) {
      const n = gen(ply, side, false);
      if (d === 1) return n;
      let t = 0;
      for (let i = 0; i < n; i++) { const k = ply * MM + i; make(k); t += rec(d - 1, ply + 1, 1 - side); unmake(k); }
      return t;
    }
    return rec(depth, 0, st.turn);
  }

  // display helpers: score from side 0's view in men (pawns), and a win chance
  const isMate = sc => Math.abs(sc) > MATE - 500;
  function winChance(sc) { if (isMate(sc)) return sc > 0 ? 1 : 0; return 1 / (1 + Math.exp(-sc / 160)); }

  return { think, perft, staticEval, MATE, isMate, winChance, clearTT, setVariant };
});
