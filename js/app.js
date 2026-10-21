/* Checkers Lab: the page. Rules live in rules.js, the engine in engine.js (run in Web Workers),
   online seats in online.js (loaded only when someone opens online play). */
(function () {
  'use strict';
  const R = window.CkRules, L = window.CkLevels, E = window.CkEngine, OG = window.CkOnlineGame;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BUILD = '2026-10-20.4';

  // ================================================================== sounds + effects (js/fx.js, all switchable in Settings)
  const FX = window.FX, SFX = window.CkSfx;
  FX.init({ game: 'checkers', accent: '#6ea8fe' });
  SFX.defineSounds(FX);
  const later = (fn, ms) => setTimeout(fn, ms);
  // Animations off: CSS transitions and keyframes stop too; Fast: the piece slide is quicker
  const fxClass = () => { const h = document.documentElement.classList; h.toggle('fx-still', !FX.settings.animations); h.toggle('fx-fast', FX.settings.animSpeed === 'fast'); };
  fxClass(); FX.onChange(fxClass);
  const OTHER = 0.85; // the computer's / opponent's moves: the same sounds, a little quieter than yours
  // a move heard but not slid (dropped, another tab, Animations off): the game-over sound waits until it has played
  let soundsUntil = 0;
  function moveSounds(m, vol) {
    const p = SFX.playMove(FX, m, vol, later);
    soundsUntil = Date.now() + (p.hops.length * SFX.HOP + 90) * SFX.speed(FX);
  }

  // ================================================================== storage
  const KEY = 'checkers:v1';
  const DEF = { variant: 'american', mode: 'computer', level: 3, side: 'first', coach: true, dots: true, numbers: false, turnBoard: false, name: '' };
  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') s = {};
    const st = Object.assign({}, DEF, s.settings && typeof s.settings === 'object' ? s.settings : {});
    if (!R.VARIANTS[st.variant]) st.variant = 'american';
    if (st.mode !== 'two') st.mode = 'computer';
    if (!L.LEVELS.some(l => l.id === st.level)) st.level = 3;
    if (!['first', 'second', 'random'].includes(st.side)) st.side = 'first';
    ['coach', 'dots', 'numbers', 'turnBoard'].forEach(k => { st[k] = !!st[k]; });
    st.name = typeof st.name === 'string' ? st.name.slice(0, 20) : '';
    const out = { settings: st, game: null, last: null, pz: { solved: {}, idx: {}, tried: {} }, an: null, online: !!s.online };
    if (validGame(s.game)) out.game = s.game;
    if (validGame(s.last)) out.last = s.last;
    const obj = x => (x && typeof x === 'object' ? x : {});
    if (s.pz && typeof s.pz === 'object') out.pz = { solved: obj(s.pz.solved), idx: obj(s.pz.idx), tried: obj(s.pz.tried) };
    out.pz.tried = out.pz.tried || {};
    if (s.an && s.an.st) { try { R.legal(s.an.st); out.an = s.an; } catch (e) { out.an = null; } }
    return out;
  }
  function validGame(g) {
    if (!g || typeof g !== 'object' || !g.st) return false;
    try { const re = R.replay(g.st); return JSON.stringify(re.board) === JSON.stringify(g.st.board); } catch (e) { return false; }
  }
  const store = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* private mode */ } }
  // the same game open in two tabs: a move made in one shows in the other (instead of the stale tab overwriting it)
  window.addEventListener('storage', e => {
    if (e.key !== KEY || e.newValue == null) return;
    const fresh = load();
    ['settings', 'game', 'last', 'pz', 'an'].forEach(k => { store[k] = fresh[k]; });
    ui.gen++; ui.thinking = false; ui.sel = null; ui.hint = null;
    render();
    afterChange();
  });
  // only the tab you are looking at plays the computer's moves; a hidden one catches up when shown
  document.addEventListener('visibilitychange', () => { if (!document.hidden && store.game && !store.game.st.result) afterChange(); });

  // ================================================================== engine runners (Web Workers, main-thread fallback)
  function runner(latestOnly) {
    let w = null, broken = false, seq = 0, busy = 0;
    const pending = new Map();
    function make() {
      try {
        w = new Worker('js/worker.js?v=1');
        w.onmessage = e => {
          const d = e.data || {};
          const p = pending.get(d.id);
          busy = Math.max(0, busy - 1);
          if (!p) return;
          pending.delete(d.id);
          if (d.error) p.rej(new Error(d.error)); else p.res(d.r);
        };
        w.onerror = () => { broken = true; w = null; pending.forEach(p => p.rej(new Error('worker'))); pending.clear(); };
      } catch (e) { broken = true; w = null; }
    }
    return {
      run(state, opts) {
        return new Promise((res, rej) => {
          if (!w && !broken) make();
          if (latestOnly && busy && w) { // throw away the old search
            w.terminate(); w = null; pending.forEach(p => p.rej(new Error('cancelled'))); pending.clear(); busy = 0; make();
          }
          const id = ++seq;
          if (w) { pending.set(id, { res, rej }); busy++; w.postMessage({ id, state, opts }); }
          else setTimeout(() => { try { res(E.think(state, opts)); } catch (e) { rej(e); } }, 20);
        });
      },
    };
  }
  const ai = runner(false), coach = runner(false), deep = runner(true);

  // ================================================================== small helpers
  const V = id => R.V(id);
  const sideName = (variant, side) => V(variant).sides[side];
  const pieceSym = (variant, side) => (V(variant).sides[side] === 'Black' ? 'pD' : 'pL');
  // a real checker seen from the player's seat: contact shadow, side wall, ringed top; a king is a second checker
  // stacked on the first (the top one carries a stamped crown)
  const pieceSVG = (sym, king, cls) => '<svg viewBox="0 0 100 100"' + (cls ? ' class="' + cls + '"' : '') + '><use href="#sh"/>' +
    (king ? '<use href="#' + sym + '" y="2"/><g class="crownuse"><use href="#' + sym + '" y="-3"/><use href="#crown" transform="translate(50 44) scale(.56) translate(-50 -50)"/></g>' : '<use href="#' + sym + '"/>') + '</svg>';
  const disc = (variant, side, king) => pieceSVG(pieceSym(variant, side), king, 'disc');
  // the checkers a player has taken, set on the table in front of them in little stacks of four (slightly untidy, like real ones)
  function pileHTML(variant, side, n, seed) {
    let h = '';
    const sym = pieceSym(variant, side);
    for (let s = 0; s * 4 < n; s++) {
      const k = Math.min(4, n - s * 4), j = window.TABLE ? TABLE.jitter(seed, s, { rot: 0, off: 1.5 }) : { x: 0, y: 0 };
      h += '<span class="stk" style="--n:' + k + ';translate:' + j.x + 'px ' + j.y + 'px">';
      for (let i = 0; i < k; i++) {
        const d = window.TABLE ? TABLE.jitter(seed + ':' + s, i, { rot: 0, off: 1.2 }) : { x: 0 };
        h += '<svg viewBox="0 0 100 100" style="--i:' + i + ';margin-left:' + d.x + 'px"><use href="#' + sym + '"/></svg>';
      }
      h += '</span>';
    }
    return h;
  }
  const qBtn = text => '<button class="q" data-q="' + esc(text) + '" aria-label="Why?">?</button>';
  function toast(msg) {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2300);
  }
  function confirmBox(msg, yes, onYes) {
    const back = document.createElement('div');
    back.className = 'confirm-back';
    back.innerHTML = '<div class="panel"><p style="margin:0 0 14px">' + esc(msg) + '</p><div class="row" style="justify-content:flex-end">' +
      '<button class="btn ghost" data-c="no">Cancel</button><button class="btn primary" data-c="yes">' + esc(yes) + '</button></div></div>';
    back.addEventListener('click', e => {
      const b = e.target.closest('[data-c]');
      if (e.target === back || b) {
        back.remove();
        const go = b && b.dataset.c === 'yes' ? onYes : null;
        // drop the box's history entry first, then act (the action may push its own entry)
        if (layerOn() && history.state.layer === 'confirm') popQuiet(go); else if (go) go();
      }
    });
    document.body.appendChild(back);
    // the box gets its own history entry, so the phone's Back closes it instead of leaving the game;
    // a box opened from a sheet takes over the sheet's entry (the sheet is already gone)
    if (layerOn() && history.state.layer === 'sheet' && !$('#sheet')) { try { history.replaceState({ tab: ui.tab, layer: 'confirm' }, '', location.hash || '#' + ui.tab); } catch (e) { /* file:// */ } }
    else pushLayer('confirm');
  }
  // an open sheet or the online screen gets its own history entry, so the phone's Back closes it first
  const layerOn = () => { try { return !!(history.state && history.state.layer); } catch (e) { return false; } };
  let quietPops = 0;
  const afterPops = [];
  function popQuiet(then) {
    quietPops++; afterPops.push(then || null);
    try { history.back(); } catch (e) { quietPops--; afterPops.pop(); if (then) then(); }
  }
  function pushLayer(layer) { try { history.pushState({ tab: ui.tab, layer }, '', location.hash || '#' + ui.tab); } catch (e) { /* file:// */ } }
  function sheet(title, html, onClick) {
    const had = $('#sheet');
    if (had) had.remove();
    const back = document.createElement('div');
    back.className = 'sheet-back'; back.id = 'sheet';
    back.innerHTML = '<div class="sheet"><div class="row"><h3 class="grow">' + esc(title) + '</h3><button class="btn small ghost" data-close>Close</button></div><div class="scroll">' + html + '</div></div>';
    back.addEventListener('click', e => {
      if (e.target === back || e.target.closest('[data-close]')) closeSheet();
      else if (onClick) onClick(e);
      // the sheet closed itself and nothing new took its history entry: drop the entry quietly
      if (!$('#sheet') && layerOn() && history.state.layer === 'sheet') popQuiet();
    });
    document.body.appendChild(back);
    if (!had && !(layerOn() && history.state.layer === 'sheet')) pushLayer('sheet');
  }
  function closeSheet() { const s = $('#sheet'); if (s) s.remove(); }
  const material = st => R.material(st.board);
  // which pieces each move of a game took (needed for "x" vs "-" in notation); cached per game state
  const capsCache = new WeakMap();
  function capsAll(st) {
    let c = capsCache.get(st);
    if (c) return c;
    c = [];
    let s = R.newGame(st.variant, { board: st.start.board, turn: st.start.turn });
    for (let i = 0; i < st.moves.length; i++) {
      const m = R.findMove(s, st.moves[i]);
      c.push(m ? m.caps : []);
      if (!m) break;
      const b = s.board.slice(); R.doMove(b, m);
      s = { variant: st.variant, board: b, turn: 1 - s.turn, result: null };
    }
    capsCache.set(st, c);
    return c;
  }
  const mvText = (st, k) => R.moveText(st.variant, st.moves[k], capsAll(st)[k] || []);
  const startCount = variant => V(variant).rows * V(variant).n / 2;

  // score (centi-men, from side 0) -> text from `side`'s point of view
  function evalText(sc, side) {
    if (sc == null) return '…';
    const s = side === 0 ? sc : -sc;
    if (E.isMate(s)) { const n = Math.ceil((E.MATE - Math.abs(s)) / 2); return (s > 0 ? 'Win' : 'Loss') + ' in ' + n; }
    const x = s / 100;
    return (x > 0.05 ? '+' : x < -0.05 ? '−' : '') + Math.abs(x).toFixed(1);
  }
  function evalFill(sc, side) { // share of the bar that is `side`'s
    if (sc == null) return 0.5;
    const s = side === 0 ? sc : -sc;
    if (E.isMate(s)) return s > 0 ? 1 : 0;
    return 0.5 + 0.5 * Math.tanh(s / 300);
  }
  const GRADES = [
    { max: 0.1, label: 'Best', cls: 'g-best' }, { max: 0.3, label: 'Good', cls: 'g-good' },
    { max: 0.7, label: 'Inaccuracy', cls: 'g-inacc' }, { max: 1.5, label: 'Mistake', cls: 'g-mistake' },
    { max: 1e9, label: 'Blunder', cls: 'g-blunder' },
  ];
  function gradeOf(lost, forced) {
    if (forced) return { label: 'Forced', cls: 'g-forced' };
    return GRADES.find(g => lost <= g.max);
  }
  const gradeChip = a => a && a.g ? '<span class="grade ' + a.g.cls + '">' + esc(a.g.label) + '</span>' : '';
  const capMen = sc => (E.isMate(sc) ? (sc > 0 ? 2000 : -2000) : Math.max(-2000, Math.min(2000, sc)));

  // ================================================================== board drawing
  function boardHTML(o) {
    const v = V(o.variant), g = R.geo(v.n), n = v.n, cell = 100 / n;
    const pos = s => { const r = g.rc[s][0], c = g.rc[s][1]; return o.flip ? [n - 1 - r, n - 1 - c] : [r, c]; };
    const last = new Set(o.last || []);
    let h = '<div class="board" data-board="' + (o.id || '') + '" data-n="' + n + '" data-flip="' + (o.flip ? 1 : 0) + '" style="--cell:' + cell + '%">';
    for (let s = 0; s < g.S; s++) {
      const [r, c] = pos(s);
      // each dark square shows its own patch of the grain, like squares cut from one plank
      const gx = (s * 37) % 8 * 12.5, gy = (s * 53) % 3 * 50;
      h += '<div class="sq' + (last.has(s) ? ' last' : '') + '" data-s="' + s + '" style="left:' + c * cell + '%;top:' + r * cell + '%;width:' + cell + '%;height:' + cell + '%;--gx:' + gx + '%;--gy:' + gy + '%">' +
        (o.numbers ? '<span class="no">' + R.sqName(v.id, s) + '</span>' : '') + '</div>';
    }
    for (let s = 0; s < g.S; s++) {
      const x = o.board[s];
      if (!x) continue;
      const [r, c] = pos(s);
      const side = x > 0 ? 0 : 1, king = Math.abs(x) === 2;
      const cls = 'pc' + (o.sel === s ? ' sel' : '') + (o.can && o.can.has(s) ? ' can' : '') + (o.crowned === s ? ' crowned' : '');
      h += '<div class="' + cls + '" data-sq="' + s + '" data-side="' + side + '" style="left:' + c * cell + '%;top:' + r * cell + '%;width:' + cell + '%;height:' + cell + '%">' +
        pieceSVG(pieceSym(v.id, side), king) + '</div>';
    }
    for (const d of o.dots || []) {
      const [r, c] = pos(d.sq);
      h += '<i class="dot' + (d.kind ? ' ' + d.kind : '') + '" style="left:' + (c + 0.5) * cell + '%;top:' + (r + 0.5) * cell + '%"></i>';
    }
    if (o.arrows && o.arrows.length) {
      h += '<svg class="arrows" viewBox="0 0 ' + n + ' ' + n + '">';
      for (const a of o.arrows) {
        const pts = a.path.map(s => { const [r, c] = pos(s); return (c + 0.5) + ',' + (r + 0.5); }).join(' ');
        const col = a.color === 'blue' ? '#6ea8fe' : '#6ee7a8';
        h += '<polyline points="' + pts + '" fill="none" stroke="' + col + '" stroke-width="' + (n === 10 ? 0.16 : 0.2) + '" stroke-linecap="round" stroke-linejoin="round" opacity=".88" marker-end="url(#' + (a.color === 'blue' ? 'ahb' : 'ah') + ')"/>';
      }
      h += '</svg>';
    }
    return h + '</div>';
  }
  function sqAt(boardEl, x, y) {
    const n = +boardEl.dataset.n, flip = boardEl.dataset.flip === '1';
    const rect = boardEl.getBoundingClientRect();
    let c = Math.floor((x - rect.left) / rect.width * n), r = Math.floor((y - rect.top) / rect.height * n);
    if (r < 0 || c < 0 || r >= n || c >= n) return -1;
    if (flip) { r = n - 1 - r; c = n - 1 - c; }
    return R.geo(n).idx[r * n + c];
  }
  // slide a piece along its path with its sounds (wood, one capture per jump, a ding when crowned);
  // a taken piece lifts off as the jumper passes. Animations off: no slide, the sounds keep their pace.
  function animateMove(boardEl, move, cb, vol) {
    vol = vol || 1;
    const el = boardEl && SFX.fxOn(FX) ? boardEl.querySelector('.pc[data-sq="' + move.path[0] + '"]') : null;
    if (!el) { moveSounds(move, vol); cb(); return; }
    const n = +boardEl.dataset.n, flip = boardEl.dataset.flip === '1', g = R.geo(n), cell = 100 / n;
    const caps = move.caps.map(c => boardEl.querySelector('.pc[data-sq="' + c + '"]'));
    const p = SFX.plan(move), sp = SFX.speed(FX);
    el.style.zIndex = 3;
    let i = 1;
    const step = () => {
      if (i >= move.path.length) { setTimeout(() => { SFX.endSounds(FX, p, vol); cb(); }, 70 * sp); return; }
      const s = move.path[i];
      let r = g.rc[s][0], c = g.rc[s][1];
      if (flip) { r = n - 1 - r; c = n - 1 - c; }
      el.style.left = c * cell + '%'; el.style.top = r * cell + '%';
      SFX.hopSounds(FX, p, i - 1, vol, later);
      const ce = caps[i - 1];
      // a taken checker is picked up and put on the capturer's pile beside the board (other tabs: it lifts off)
      const pile = ce && boardEl.dataset.board === 'play' && document.querySelector('#v-play .pl[data-side="' + el.dataset.side + '"] .pile');
      if (ce) setTimeout(() => {
        if (pile && FX.flyTo) { FX.flyTo(ce, pile, { scale: 0.4, duration: 420 }); ce.classList.add('gone-now'); } else SFX.liftOff(FX, ce);
      }, 120 * sp);
      i++;
      setTimeout(step, SFX.HOP * sp);
    };
    requestAnimationFrame(step);
  }
  // after a move is drawn in its new place: the crown, "+N" by the capturer's count, a big multi-jump
  function afterMoveFx(m, mover, mine) {
    if (!m || ui.tab !== 'play') return;
    const b = document.querySelector('.board[data-board="play"]');
    SFX.afterMove(FX, m, { piece: b && b.querySelector('.pc[data-sq="' + m.path[m.path.length - 1] + '"]'),
      count: document.querySelector('#v-play .pl[data-side="' + mover + '"] .cap'), mine });
  }
  // a refused tap: the soft error sound and a shake of the piece
  function refuse(sq, boardId) {
    FX.play('error');
    const el = document.querySelector('.board[data-board="' + (boardId || 'play') + '"] .pc[data-sq="' + sq + '"]');
    if (el) FX.shake(el);
  }

  // ================================================================== tabs + help bubbles
  const ui = {
    tab: 'play', online: false, sel: null, gen: 0, ended: {}, thinking: false, roots: {}, shown: null, hint: null, anim: false,
    rv: { ply: 0, key: '' }, an: { mode: 'move', pal: 1, res: null, key: '' }, pz: { i: 0, state: null, done: false, msg: '', line: null },
  };
  $('#tabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]');
    if (b) showTab(b.dataset.tab, true);
  });
  function showTab(tab, push) {
    if (!['play', 'puzzles', 'review', 'analyze', 'settings'].includes(tab)) tab = 'play';
    ui.tab = tab;
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + tab));
    // leaving a sheet/online layer for another tab replaces the layer's entry, so Back then goes to the old tab
    if (push) try { history[layerOn() ? 'replaceState' : 'pushState']({ tab }, '', '#' + tab); } catch (e) { /* file:// */ }
    closeSheet();
    render();
  }
  // Back goes to where you just were: first closes an open box, sheet or the online screen, then steps back through tabs
  window.addEventListener('popstate', e => {
    const s = e.state || {};
    if (quietPops > 0) { quietPops--; const f = afterPops.shift(); if (f) f(); return; }
    // back onto a layer (a box opened over the online screen): close the box; forward onto a closed layer: nothing to reopen
    if (s.layer) { document.querySelectorAll('.confirm-back').forEach(b => b.remove()); return; }
    const boxes = document.querySelectorAll('.confirm-back');
    const sh = $('#sheet');
    const tab = s.tab || (location.hash || '#play').slice(1);
    if (boxes.length || sh) { boxes.forEach(b => b.remove()); closeSheet(); if (tab === ui.tab) return; }
    if (ui.online && !store.online && tab === ui.tab) { ui.online = false; renderPlay(); return; }
    showTab(tab, false);
  });
  document.addEventListener('click', e => {
    const old = $('.pop');
    const q = e.target.closest('[data-q]');
    if (old) old.remove();
    if (!q || (old && old.dataset.for === q.dataset.q)) return;
    const pop = document.createElement('div');
    pop.className = 'pop'; pop.textContent = q.dataset.q; pop.dataset.for = q.dataset.q;
    document.body.appendChild(pop);
    const r = q.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    const x = Math.min(window.innerWidth - w - 12, Math.max(12, r.left + r.width / 2 - w / 2));
    let y = r.bottom + 8;
    if (y + h > window.innerHeight - 8) y = r.top - h - 8;
    pop.style.left = x + 'px'; pop.style.top = Math.max(8, y) + 'px';
  });
  function render() {
    if (ui.tab === 'play') renderPlay();
    else if (ui.tab === 'puzzles') renderPuzzles();
    else if (ui.tab === 'review') renderReview();
    else if (ui.tab === 'analyze') renderAnalyze();
    else renderSettings();
  }
  let resizeT = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(render, 120); });
  const isWide = () => window.innerWidth >= 900;

  // board size that fits the space left in a view (no page scroll)
  function fitBoard(view, reservedH, reservedW) {
    const h = view.clientHeight - (isWide() ? 28 : 18) - reservedH;
    const w = (isWide() ? view.clientWidth - 36 : view.clientWidth - 24) - reservedW;
    return Math.max(200, Math.floor(Math.min(h, w) - 8));
  }

  // ================================================================== the current game (local or online)
  const net = { room: null, snap: null, busy: false, connecting: false };
  function cur() {
    if (net.snap && (net.snap.status === 'playing' || net.snap.status === 'finished') && net.snap.pub) {
      const pub = net.snap.pub;
      const mySeat = net.snap.mySeat;
      const my = mySeat >= 0 ? OG.sideOf(pub, mySeat) : 0;
      const names = [0, 1].map(side => { const seat = OG.seatOf(pub, side); const s = net.snap.seats[seat]; return s ? (s.kind === 'computer' ? 'Computer' : s.name || 'Player') : '?'; });
      const away = [0, 1].map(side => { const s = net.snap.seats[OG.seatOf(pub, side)]; return !!(s && s.kind === 'human' && !s.online); });
      return { st: pub.g, mode: 'online', my, names, away, anal: ui.onlineAnal || (ui.onlineAnal = {}) };
    }
    const g = store.game;
    if (!g) return null;
    const lv = L.byId(g.level);
    const names = g.mode === 'two' ? [sideName(g.st.variant, 0), sideName(g.st.variant, 1)] : [0, 1].map(s => (s === g.my ? 'You' : lv.name + ' computer'));
    return { st: g.st, mode: g.mode, my: g.my, names, away: [false, false], anal: g.anal || (g.anal = {}), level: g.level };
  }
  function bottomSide(c) {
    if (c.mode === 'two' && store.settings.turnBoard) return c.st.offer >= 0 ? 1 - c.st.offer : c.st.turn;
    return c.my;
  }
  function canIAct(c) {
    // a draw offer waits for its answer (Accept / Decline) before anyone moves
    if (!c || c.st.result || ui.anim || c.st.offer >= 0) return false;
    if (c.mode === 'online') return !!(net.snap && net.snap.myTurn) && !net.busy;
    if (c.mode === 'two') return true;
    return c.st.turn === c.my && !ui.thinking;
  }

  // ================================================================== PLAY
  const vPlay = $('#v-play');
  function renderPlay() {
    const c = cur();
    // a game in progress sits on a wooden table (table.css); setup and the online lobby keep the plain look
    vPlay.classList.toggle('tbl-surface', !!c); vPlay.classList.toggle('tbl-wood-dark', !!c);
    if (c) renderGame(c);
    else if (ui.online) renderOnline();
    else renderSetup();
  }

  // ---------------------------------------------------------------- setup
  function miniBoard(n) {
    let r = '<svg class="mini" viewBox="0 0 ' + n + ' ' + n + '"><rect width="' + n + '" height="' + n + '" fill="#e3cfa8"/>';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if ((x + y) % 2) r += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="#8a5a3b"/>';
    return r + '</svg>';
  }
  function levelNote() {
    const m = L.MEASURED;
    if (!m) return 'Each level searches a fixed amount, so it plays the same on a phone and a laptop.';
    return 'Measured in ' + m.gamesPerPair + ' games per pair (colours swapped, random openings): ' +
      Object.keys(m.pairs).map(k => { const [a, b] = k.split('v'); return L.byId(+b).name + ' scores ' + Math.round((1 - m.pairs[k].score) * 100) + '% vs ' + L.byId(+a).name; }).join('; ') + '.';
  }
  function renderSetup() {
    const s = store.settings, v = V(s.variant);
    const vbtn = id => { const x = V(id); return '<button data-variant="' + id + '" aria-pressed="' + (s.variant === id) + '">' + miniBoard(x.n) + '<span style="min-width:0"><b>' + esc(x.name) + '</b><small>' + (id === 'casual' ? 'jumps optional' : x.n + '×' + x.n) + (id === 'casual' ? '' : x.flying ? ' · kings fly' : ' · short kings') + '</small></span></button>'; };
    const sides = [['first', v.sides[0], 'moves first'], ['second', v.sides[1], ''], ['random', 'Random', '']];
    const two = s.mode === 'two';
    vPlay.innerHTML = '<div class="setup two">' +
      '<div class="hero"><img src="icon.svg" alt=""><div><h1>Checkers Lab</h1><p>Every common rule set, a measured computer and a coach.</p></div></div>' +
      '<div class="panel"><div class="row"><span class="label grow">Rules</span>' + qBtn('American checkers is the US and UK game. International (10×10), Russian and Brazilian are the draughts played in most of the world. Casual is the kitchen-table version where jumping is optional. The full rules of each are in Settings.') + '</div>' +
      '<div class="vgrid">' + R.VARIANT_IDS.map(vbtn).join('') + '</div><p class="vblurb">' + esc(v.blurb) + '</p></div>' +
      '<div class="panel">' +
      '<div class="label">Opponent</div><div class="seg" data-set="mode"><button data-v="computer" aria-pressed="' + !two + '">Computer</button><button data-v="two" aria-pressed="' + two + '">Two players<small>same device</small></button></div>' +
      (two ? '' :
        '<div class="row"><span class="label grow">Level</span>' + qBtn(levelNote()) + '</div>' +
        '<div class="seg tight" data-set="level">' + L.LEVELS.map(l => '<button data-v="' + l.id + '" aria-pressed="' + (s.level === l.id) + '">' + esc(l.name) + '</button>').join('') + '</div>' +
        '<div class="label">You play</div><div class="seg tight" data-set="side">' + sides.map(x => '<button data-v="' + x[0] + '" aria-pressed="' + (s.side === x[0]) + '">' + esc(x[1]) + (x[2] ? '<small>' + x[2] + '</small>' : '') + '</button>').join('') + '</div>') +
      '<button class="btn primary" data-start style="width:100%">Start</button>' +
      '<button class="btn" data-on="open" style="width:100%">Play online</button>' +
      '</div></div>';
  }
  function startGame(opts) {
    const s = store.settings;
    opts = opts || {};
    const variant = opts.variant || s.variant;
    let my = 0;
    if (s.mode === 'computer') my = s.side === 'second' ? 1 : s.side === 'random' ? (Math.random() < 0.5 ? 0 : 1) : 0;
    if (opts.my != null) my = opts.my;
    const st = opts.st || R.newGame(variant);
    store.game = { st, mode: opts.mode || s.mode, level: s.level, my, anal: {}, started: Date.now() };
    ui.gen++; ui.sel = null; ui.roots = {}; ui.shown = null; ui.hint = null; ui.thinking = false;
    save();
    showTab('play', ui.tab !== 'play');
    afterChange();
  }

  vPlay.addEventListener('click', e => {
    const t = e.target;
    const vb = t.closest('[data-variant]');
    if (vb) { store.settings.variant = vb.dataset.variant; save(); renderPlay(); return; }
    const segb = t.closest('[data-set] button');
    if (segb) {
      const key = segb.parentElement.dataset.set;
      store.settings[key] = key === 'level' ? Number(segb.dataset.v) : segb.dataset.v;
      save(); renderPlay(); return;
    }
    if (t.closest('[data-start]')) { startGame(); return; }
    const on = t.closest('[data-on]');
    if (on) { onlineBtn(on.dataset.on); return; }
    const sb = t.closest('[data-seat]');
    if (sb && net.room) { net.room.setSeat(Number(sb.dataset.seat), sb.dataset.kind); return; }
    const a = t.closest('[data-act]');
    if (a) { gameAction(a.dataset.act); return; }
  });

  // ---------------------------------------------------------------- the game screen
  function playerRow(c, side) {
    const st = c.st, m = material(st)[side], other = material(st)[1 - side];
    const lostOther = startCount(st.variant) - other.men - other.kings;
    const toMove = !st.result && (st.offer >= 0 ? 1 - st.offer : st.turn) === side;
    const caps = pileHTML(st.variant, 1 - side, lostOther, 'cap' + side);
    return '<div class="pl' + (toMove ? ' turn' : '') + (c.away[side] ? ' away' : '') + '" data-side="' + side + '">' + disc(st.variant, side) +
      '<span class="nm">' + esc(c.names[side]) + '</span><span class="sub">' + (m.men + m.kings) + ' left' + (m.kings ? ' · ' + m.kings + ' king' + (m.kings > 1 ? 's' : '') : '') + (c.away[side] ? ' · away' : '') + '</span>' +
      '<span class="cap pile">' + caps + (lostOther ? '<b>' + lostOther + '</b>' : '') + '</span></div>';
  }
  function coachLine(c) {
    const st = c.st, bot = bottomSide(c);
    const a = c.anal[st.ply];
    const coachOn = store.settings.coach || c.mode === 'online' && false;
    const ev = coachOn && !st.result ? '<span class="ev" style="color:' + evColor(a && a.e, bot) + '">' + evalText(a ? a.e : null, bot) + '</span>' : '';
    let msg = '';
    const last = st.ply > 0 ? c.anal[st.ply - 1] : null;
    if (st.result) msg = resultText(c);
    else if (st.offer >= 0) msg = (st.offer === c.my && c.mode !== 'two' ? 'You offered a draw' : sideName(st.variant, st.offer) + ' offers a draw');
    else if (ui.thinking) msg = 'Computer is thinking…';
    else {
      const dc = R.drawCountdown(st);
      const prev = st.ply > 0 ? mvText(st, st.ply - 1) : '';
      if (coachOn && last && last.g) msg = gradeChip(last) + ' ' + esc(prev) + (last.lost > 0.1 && !last.forced ? ' <span class="muted">−' + last.lost.toFixed(1) + '</span>' : '');
      else if (prev) msg = '<span class="muted">Last:</span> ' + esc(prev);
      if (dc && dc.left <= 10) msg += ' <span class="muted">· draw ' + (dc.why === 'repeat' ? 'if repeated' : 'in ' + dc.left) + '</span>';
      if (!msg) msg = c.mode === 'two' ? esc(sideName(st.variant, st.turn)) + ' to move' : canIAct(c) ? 'Your move' : 'Waiting…';
    }
    return '<div class="coach">' + ev + '<span class="msg">' + msg + '</span>' +
      (coachOn ? qBtn('The number is the coach’s score from your side: +1.0 is as good as one extra man. The badge grades the last move by how much it lost compared with the best move. Checkers is a draw with perfect play, so small numbers mean an even game.') : '') + '</div>';
  }
  function evColor(e, side) {
    if (e == null) return 'var(--muted)';
    const s = side === 0 ? e : -e;
    const f = Math.max(0, Math.min(1, 0.5 + s / 300));
    return 'hsl(' + Math.round(f * 130) + ',70%,62%)';
  }
  function resultText(c) {
    const r = c.st.result;
    if (!r) return '';
    const why = R.REASONS[r.reason] || r.reason;
    if (r.winner == null) return 'Draw · ' + why;
    if (c.mode === 'two') return sideName(c.st.variant, r.winner) + ' wins · ' + why;
    return (r.winner === c.my ? 'You win' : 'You lose') + ' · ' + why;
  }
  function moveListHTML(st, anal, curPly) {
    let h = '<table class="moves"><tbody>';
    const start = st.start.turn;
    let i = 0, num = 1;
    if (start === 1 && st.moves.length) { h += '<tr><td class="n">1.</td><td>…</td>' + cell(0) + '</tr>'; i = 1; num = 2; }
    for (; i < st.moves.length; i += 2, num++) h += '<tr><td class="n">' + num + '.</td>' + cell(i) + (i + 1 < st.moves.length ? cell(i + 1) : '<td></td>') + '</tr>';
    function cell(k) {
      const a = anal[k];
      const g = a && a.g && a.g.label !== 'Best' && a.g.label !== 'Good' && a.g.label !== 'Forced' ? '<span class="grade ' + a.g.cls + '">' + (a.g.label === 'Inaccuracy' ? '?!' : a.g.label === 'Mistake' ? '?' : '??') + '</span>' : '';
      return '<td data-ply="' + k + '"' + (k === curPly ? ' class="cur"' : '') + '>' + esc(mvText(st, k)) + g + '</td>';
    }
    return h + '</tbody></table>';
  }

  function renderGame(c) {
    const st = c.st, bot = bottomSide(c), flip = bot === 1, wide = isWide();
    const coachOn = store.settings.coach;
    const a = c.anal[st.ply];
    const top = playerRow(c, 1 - bot), bottom = playerRow(c, bot);
    const fill = evalFill(a && a.e, bot);
    const colOf = side => (pieceSym(st.variant, side) === 'pD' ? '#23252c' : '#e8e2d4');
    const barCol = 'background:' + colOf(bot) + '"><i style="background:' + colOf(1 - bot) + ';width:' + (100 - fill * 100);
    // a phone held sideways puts the board beside the rows instead of above them
    const land = !wide && window.innerHeight < 500 && window.innerWidth > window.innerHeight;
    const size = wide ? fitBoard(vPlay, 72 + 12, 340 + 18 + 26) : land ? Math.max(160, Math.min(vPlay.clientHeight - 20, vPlay.clientWidth - 24 - 290)) : fitBoard(vPlay, 36 * 2 + 8 + 36 + 44 + 6 * 5 + (st.offer >= 0 ? 0 : 0), 0);
    const boardInner = boardFor(c, flip);
    const end = st.result ? '<div class="endcard"><div class="panel"><h2>' + esc(resultText(c).split(' · ')[0]) + '</h2><span class="muted">' + esc(R.REASONS[st.result.reason] || '') + '</span>' +
      '<div class="row"><button class="btn" data-act="review">Review</button><button class="btn primary" data-act="new">New game</button></div></div></div>' : '';
    const offerMine = st.offer >= 0 && !st.result && (c.mode === 'two' || (c.mode === 'online' && net.snap.myTurn));
    const offer = offerMine ? '<div class="offerbar"><span class="grow">' + esc(sideName(st.variant, st.offer)) + ' offers a draw</span><button class="btn small" data-act="decline">Decline</button><button class="btn small primary" data-act="accept">Accept</button></div>' : '';
    const acts = '<div class="acts">' +
      '<button class="btn" data-act="hint"' + (!coachOn || st.result || !canIAct(c) ? ' disabled' : '') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>Hint</button>' +
      (c.mode === 'online' ? '' : '<button class="btn" data-act="undo"' + (canUndo(c) ? '' : ' disabled') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>Undo</button>') +
      '<button class="btn" data-act="menu"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>Game</button></div>';
    if (!wide) {
      vPlay.innerHTML = '<div id="game"' + (land ? ' class="land" style="--bw:' + size + 'px"' : '') + '>' + top +
        '<div class="evalbar h' + (coachOn ? '' : ' off') + '" style="width:' + size + 'px;align-self:center;' + barCol + '%"></i></div>' +
        '<div class="board-wrap" style="width:' + size + 'px;align-self:center">' + boardInner + end + '</div>' +
        bottom + (offer || coachLine(c)) + acts + '</div>';
    } else {
      // the side panel shows what was best at the last position where the player (not the computer) moved
      let k = st.ply - 1;
      if (c.mode !== 'two') while (k >= 0 && sideAt(st, k) !== c.my) k--;
      const pa = k >= 0 ? c.anal[k] : null;
      const pvTxt = coachOn && pa && pa.pv ? pvText(st, pa.pv) : '';
      vPlay.innerHTML = '<div id="game">' +
        '<div class="boardcol" style="width:' + (size + 26) + 'px">' + top +
        '<div class="row" style="align-items:stretch;gap:12px"><div class="evalbar v' + (coachOn ? '' : ' off') + '" style="' + barCol.replace('width:', 'height:') + '%"></i></div>' +
        '<div class="board-wrap" style="width:' + size + 'px">' + boardInner + end + '</div></div>' + bottom + '</div>' +
        '<div id="g-side">' + (offer || coachLine(c)) +
        (coachOn ? '<div class="panel pv">' + (pvTxt ? '<span class="label">' + (c.mode === 'two' ? 'Best at the last move' : 'Best at your last move') + '</span><div>' + pvTxt + '</div>' : '<span class="muted">After each move, the best line from that position shows here.</span>') + '</div>' : '') +
        '<div class="panel sheetpaper" style="flex:1;min-height:0;display:flex;flex-direction:column;gap:6px"><div class="row"><span class="label grow">Moves</span><span class="muted small">' + esc(V(st.variant).long) + '</span></div><div class="scroll" id="mlist">' + moveListHTML(st, c.anal, st.ply - 1) + '</div></div>' +
        acts + '</div></div>';
      const ml = $('#mlist'); if (ml) ml.scrollTop = ml.scrollHeight;
    }
    ui.shown = { key: gameKey(c), ply: st.ply, st };
    // game over (seen for the first time, not on reload): win / lose / draw for this player
    const k = gameKey(c), over = !!st.result;
    if (!ui.anim) {
      const was = ui.ended[k];
      ui.ended[k] = over;
      if (over && was === false) {
        const r = st.result, win = r.winner != null ? sideName(st.variant, r.winner) : null;
        later(() => SFX.celebrateEnd(FX, r, c.mode, c.my, win, vPlay.querySelector('.endcard .panel')), Math.max(0, soundsUntil - Date.now()));
      }
    }
  }
  function pvText(st, pv) {
    let s = st, out = [];
    for (let i = 0; i < pv.length && i < 10; i++) {
      const m = pv[i];
      const t = R.moveText(st.variant, [m.from, m.to], m.caps);
      out.push(i === 0 ? '<b>' + esc(t) + '</b>' : esc(t));
    }
    void s;
    return out.join(' ');
  }
  const gameKey = c => (c.mode === 'online' ? 'on:' + (net.snap && net.snap.code) : 'loc:' + (store.game && store.game.started));
  function boardFor(c, flip) {
    const st = c.st;
    const legal = canIAct(c) ? R.legal(st) : [];
    let dots = [], can = null, sel = null;
    if (ui.sel && legal.length) {
      sel = ui.sel.from;
      const cands = legal.filter(m => startsWith(m.path, ui.sel.prefix));
      const byFinal = {};
      cands.forEach(m => { const f = m.path[m.path.length - 1]; (byFinal[f] = byFinal[f] || []).push(m); });
      for (const f in byFinal) {
        const grp = byFinal[f];
        dots.push({ sq: +f, kind: grp[0].caps.length ? 'cap' : '' });
        if (grp.length > 1) grp.forEach(m => { const nx = m.path[ui.sel.prefix.length]; if (nx !== +f) dots.push({ sq: nx, kind: 'step' }); });
      }
      if (!store.settings.dots) dots = dots.filter(d => d.kind === 'step');
    } else if (legal.length && store.settings.dots && legal[0].caps.length && V(st.variant).mandatory) {
      can = new Set(legal.map(m => m.path[0])); // show which pieces must jump
    }
    const lastPath = st.ply > 0 ? st.moves[st.ply - 1] : null;
    const arrows = ui.hint && ui.hint.ply === st.ply ? [{ path: ui.hint.path }] : [];
    return boardHTML({ id: 'play', variant: st.variant, board: st.board, flip, numbers: store.settings.numbers, last: lastPath ? [lastPath[0], lastPath[lastPath.length - 1]] : [], sel, can, dots, arrows });
  }
  const startsWith = (p, pre) => pre.every((x, i) => p[i] === x);
  function canUndo(c) {
    if (c.mode === 'online' || !c.st.moves.length) return false;
    // a resignation or an agreed draw is final (it is not a move that can be taken back)
    if (c.st.result && (c.st.result.reason === 'resign' || c.st.result.reason === 'agreed')) return false;
    if (c.mode === 'two') return true;
    // vs computer: there must be one of my moves to take back
    for (let i = c.st.moves.length - 1; i >= 0; i--) if (sideAt(c.st, i) === c.my) return true;
    return false;
  }
  const sideAt = (st, ply) => (st.start.turn + ply) % 2;

  // ---------------------------------------------------------------- input on the board (tap or drag)
  let drag = null;
  vPlay.addEventListener('pointerdown', e => {
    const b = e.target.closest('.board[data-board="play"]');
    if (!b || e.button > 0) return;
    const c = cur();
    if (c && !c.st.result && c.st.offer >= 0 && $('.offerbar')) { toast('Accept or decline the draw first'); return; }
    if (!canIAct(c)) return;
    const s = sqAt(b, e.clientX, e.clientY);
    if (s < 0) return;
    const x = c.st.board[s];
    const side = c.st.turn;
    if (x && (x > 0) === (side === 0) && R.legal(c.st).some(m => m.path[0] === s) && !(ui.sel && ui.sel.prefix.length > 1)) {
      const el = b.querySelector('.pc[data-sq="' + s + '"]');
      drag = { b, s, el, x0: e.clientX, y0: e.clientY, moved: false, id: e.pointerId };
      try { b.setPointerCapture(e.pointerId); } catch (er) { /* old Safari */ }
    } else drag = { b, s, el: null, x0: e.clientX, y0: e.clientY, moved: false, id: e.pointerId };
  });
  vPlay.addEventListener('pointermove', e => {
    if (!drag || !drag.el || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) < 7) return;
    if (!drag.moved) { drag.moved = true; drag.el.classList.add('drag'); }
    drag.el.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(1.15)';
  });
  vPlay.addEventListener('pointerup', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    if (d.moved) {
      const to = sqAt(d.b, e.clientX, e.clientY);
      const c = cur();
      const legal = R.legal(c.st).filter(m => m.path[0] === d.s && m.path[m.path.length - 1] === to);
      if (legal.length === 1 && canIAct(c)) { ui.sel = null; playMove(c, legal[0], true); return; }
      d.el.classList.remove('drag'); d.el.style.transform = '';
      if (!legal.length && to >= 0 && to !== d.s) FX.play('error');
      ui.sel = { from: d.s, prefix: [d.s] };
      if (legal.length > 1) { ui.sel.prefix = [d.s]; toast('Two ways to get there: tap the first landing square'); }
      renderPlay();
      return;
    }
    onSquare(d.s);
  });
  vPlay.addEventListener('pointercancel', () => { if (drag && drag.el) { drag.el.classList.remove('drag'); drag.el.style.transform = ''; } drag = null; });

  function onSquare(s) {
    const c = cur();
    if (!canIAct(c)) return;
    const st = c.st, legal = R.legal(st);
    if (ui.sel) {
      const pre = ui.sel.prefix;
      const cands = legal.filter(m => startsWith(m.path, pre));
      const finals = cands.filter(m => m.path.length > pre.length && m.path[m.path.length - 1] === s);
      if (finals.length === 1) { ui.sel = null; playMove(c, finals[0]); return; }
      const steps = cands.filter(m => m.path.length > pre.length && m.path[pre.length] === s);
      if (steps.length) {
        pre.push(s);
        const left = cands.filter(m => startsWith(m.path, pre));
        if (left.length === 1) { ui.sel = null; playMove(c, left[0]); return; }
        renderPlay(); return;
      }
      if (finals.length > 1) { toast('Two ways to get there: tap the first landing square'); return; }
    }
    const x = st.board[s];
    if (x && (x > 0) === (st.turn === 0)) {
      const mine = legal.filter(m => m.path[0] === s);
      if (!mine.length) {
        ui.sel = null; renderPlay();
        if (legal.length && legal[0].caps.length && V(st.variant).mandatory) {
          toast('You must jump');
          legal.forEach(m => { const el = document.querySelector('.board[data-board="play"] .pc[data-sq="' + m.path[0] + '"]'); if (el) el.classList.add('must'); });
        } else toast('That piece can’t move');
        refuse(s);
        return;
      }
      ui.sel = { from: s, prefix: [s] };
      FX.play('tap');
      renderPlay(); return;
    }
    if (ui.sel) { ui.sel = null; renderPlay(); }
  }

  // ---------------------------------------------------------------- making moves
  function playMove(c, m, dropped) {
    ui.hint = null;
    if (c.mode === 'online') {
      net.busy = true;
      const boardEl = document.querySelector('.board[data-board="play"]');
      const go = () => net.room.act({ path: m.path }).then(r => { if (!r.ok) { net.busy = false; toast(r.message || 'Move not sent'); renderPlay(); } });
      if (dropped) { moveSounds(m, 1); go(); } else { ui.anim = true; animateMove(boardEl, m, () => { ui.anim = false; go(); }); }
      return;
    }
    const next = R.act(c.st, c.st.turn, { path: m.path });
    commit(next, m, dropped);
  }
  // show a new local state: slide the move first, then redraw
  function commit(next, m, dropped) {
    const g = store.game;
    if (!g) return;
    const prevPly = g.st.ply, mover = g.st.turn, mine = g.mode === 'two' || mover === g.my;
    g.st = next;
    if (next.result) finishGame();
    save();
    const boardEl = document.querySelector('.board[data-board="play"]');
    const done = () => { ui.anim = false; gradeIfReady(g, prevPly); renderPlay(); afterMoveFx(m, mover, mine); afterChange(); };
    if (dropped || !m || ui.tab !== 'play') { if (m) moveSounds(m, mine ? 1 : OTHER); done(); return; }
    ui.anim = true;
    animateMove(boardEl, m, done, mine ? 1 : OTHER);
  }
  function finishGame() {
    const g = store.game;
    store.last = JSON.parse(JSON.stringify(g));
    ui.rv = { ply: 0, key: '' };
  }
  // after any change: computer moves, coach looks at the new position
  function afterChange() {
    const g = store.game;
    const c = cur();
    if (!c) return;
    const st = c.st;
    if (c.mode !== 'online' && store.settings.coach || c.mode === 'online' && store.settings.coach) requestCoach(c);
    if (!g || c.mode !== 'computer' || st.result) return;
    if (st.offer >= 0 && st.offer === g.my) { computerAnswersDraw(); return; }
    if (st.turn === g.my || ui.thinking || document.hidden) return;
    ui.thinking = true;
    const myGen = ui.gen;
    const lv = L.byId(g.level);
    const t0 = Date.now();
    renderPlay();
    ai.run(st, Object.assign({ seed: (Date.now() & 0xffff) }, lv.opts)).then(r => {
      if (myGen !== ui.gen || !store.game || store.game.st !== st) return;
      const wait = Math.max(0, 450 - (Date.now() - t0));
      setTimeout(() => {
        if (myGen !== ui.gen || !store.game || store.game.st !== st) return;
        ui.thinking = false;
        // the computer resigns a hopeless game only at full strength levels
        const next = R.act(st, st.turn, { path: r.move.path });
        commit(next, r.move);
      }, wait);
    }).catch(() => { if (myGen === ui.gen) { ui.thinking = false; toast('The computer hit a problem. Tap Undo or start again.'); renderPlay(); } });
  }
  function computerAnswersDraw() {
    const g = store.game, st = g.st, myGen = ui.gen;
    ui.thinking = true; renderPlay();
    ai.run(Object.assign({}, st, { offer: -1 }), { nodes: 30000 }).then(r => {
      if (myGen !== ui.gen || !store.game) return;
      ui.thinking = false;
      // score is from the offerer's view (side to move): accept if the computer is not clearly better
      const accept = -r.score <= 40;
      const next = R.act(st, 1 - st.offer, { draw: accept ? 'accept' : 'decline' });
      store.game.st = next;
      if (next.result) finishGame();
      save();
      toast(accept ? 'The computer accepts the draw' : 'The computer declines the draw');
      renderPlay(); afterChange();
    }).catch(() => { // no answer: the offer lapses, so the game can go on
      if (myGen !== ui.gen || !store.game || store.game.st !== st) return;
      ui.thinking = false; store.game.st = R.act(st, 1 - st.offer, { draw: 'decline' }); save();
      toast('The computer declines the draw'); renderPlay(); afterChange();
    });
  }
  // coach: look at every position once, grade the move that was played from it
  function requestCoach(c) {
    const st = c.st, ply = st.ply;
    if (c.anal[ply] || st.result) return;
    const key = gameKey(c), myGen = ui.gen;
    if (ui.coachBusy === key + ':' + ply) return;
    ui.coachBusy = key + ':' + ply;
    coach.run(st, { ms: 380, multi: true }).then(r => {
      ui.coachBusy = null;
      const now = cur();
      if (!now || gameKey(now) !== key || myGen !== ui.gen) return;
      storeAnal(now, ply, st, r);
      if (now.st.ply > ply) gradeMove(now, ply);
      save();
      if (ui.tab === 'play' && !ui.anim) renderPlay();
      // the position may have moved on while we were looking
      if (now.st.ply !== ply) requestCoach(now);
    }).catch(() => { ui.coachBusy = null; });
  }
  function storeAnal(c, ply, st, r) {
    if (!r || !r.move) return;
    const side = st.turn;
    c.anal[ply] = { e: side === 0 ? r.score : -r.score, b: r.move.path, pv: r.pv, d: r.depth };
    ui.roots[gameKey(c) + ':' + ply] = { side, roots: (r.roots || []).map(x => ({ p: x.move && x.move.path, c: x.move && x.move.caps, s: x.score })), best: r.score, n: (r.roots || []).length };
  }
  function gradeMove(c, ply) {
    const a = c.anal[ply], info = ui.roots[gameKey(c) + ':' + ply];
    if (!a || !info || a.g) return;
    const played = c.st.moves[ply];
    if (!played) return;
    const hit = info.roots.find(x => x.p && R.samePath(x.p, played));
    if (!hit) return;
    const lost = Math.max(0, (capMen(info.best) - capMen(hit.s)) / 100);
    a.lost = Math.round(lost * 100) / 100;
    a.caps = hit.c;
    a.forced = info.n === 1;
    // turning a forced win into anything else is always a blunder
    a.g = gradeOf(E.isMate(info.best) && info.best > 0 && !(E.isMate(hit.s) && hit.s > 0) ? 9 : lost, a.forced);
  }
  function gradeIfReady(g, ply) { const c = cur(); if (c && c.anal[ply]) gradeMove(c, ply); }

  // ---------------------------------------------------------------- game buttons
  function gameAction(k) {
    const c = cur();
    if (k === 'new') {
      if (c && c.mode === 'online') { leaveOnline(); return; }
      store.game = null; ui.gen++; ui.thinking = false; save(); renderPlay(); return;
    }
    if (k === 'review') { showTab('review', true); return; }
    if (!c) return;
    if (k === 'hint') {
      const a = c.anal[c.st.ply];
      if (a && a.b) { ui.hint = { ply: c.st.ply, path: a.b }; renderPlay(); }
      else {
        toast('Looking…');
        const ply = c.st.ply;
        coach.run(c.st, { ms: 500 }).then(r => { const now = cur(); if (now && now.st.ply === ply && r.move) { ui.hint = { ply, path: r.move.path }; renderPlay(); } }).catch(() => {});
      }
      return;
    }
    if (k === 'undo') { undo(); return; }
    if (k === 'accept' || k === 'decline') {
      if (c.mode === 'online') { net.room.act({ draw: k }); return; }
      const st = R.act(c.st, 1 - c.st.offer, { draw: k });
      store.game.st = st; if (st.result) finishGame(); save(); renderPlay(); afterChange(); return;
    }
    if (k === 'menu') { gameMenu(c); return; }
  }
  function gameMenu(c) {
    const st = c.st, over = !!st.result;
    const myTurn = c.mode === 'online' ? !!net.snap.myTurn : c.mode === 'two' ? true : st.turn === c.my;
    const items = [];
    if (!over && st.offer < 0 && myTurn) items.push(['draw', 'Offer a draw']);
    if (!over && (c.mode !== 'online' || myTurn)) items.push(['resign', c.mode === 'two' ? sideName(st.variant, st.turn) + ' resigns' : 'Resign']);
    items.push(['new', c.mode === 'online' ? 'Leave the room' : 'New game']);
    items.push(['rules', 'Rules: ' + V(st.variant).long]);
    if (c.mode === 'online' && net.snap) items.push(['code', 'Room code ' + net.snap.code]);
    sheet('Game', '<div class="menu-list">' + items.map(x => '<button class="btn" data-m="' + x[0] + '">' + esc(x[1]) + '</button>').join('') + '</div>', e => {
      const b = e.target.closest('[data-m]');
      if (!b) return;
      closeSheet();
      const k = b.dataset.m;
      if (k === 'draw') {
        if (c.mode === 'online') { net.room.act({ draw: 'offer' }); return; }
        const s2 = R.act(st, st.turn, { draw: 'offer' });
        store.game.st = s2; save(); renderPlay(); afterChange();
      } else if (k === 'resign') {
        confirmBox('Resign this game?', 'Resign', () => {
          if (c.mode === 'online') { net.room.act({ resign: true }); return; }
          const side = c.mode === 'two' ? st.turn : c.my;
          store.game.st = R.act(store.game.st, side, { resign: true }); ui.gen++; ui.thinking = false; finishGame(); save(); renderPlay();
        });
      } else if (k === 'new') {
        if (c.mode === 'online') confirmBox('Leave this room? A computer takes your seat.', 'Leave', leaveOnline);
        else if (over || !st.moves.length) gameAction('new');
        else confirmBox('Quit this game and start again?', 'Quit', () => gameAction('new'));
      } else if (k === 'rules') { rulesSheet(st.variant); }
    });
  }
  function undo() {
    const g = store.game;
    if (!g || !canUndo(g)) return;
    let n = g.st.moves.length - 1;
    if (g.mode === 'computer') { while (n >= 0 && sideAt(g.st, n) !== g.my) n--; }
    if (n < 0) return;
    ui.gen++; ui.thinking = false; ui.sel = null; ui.hint = null;
    g.st = R.replay(g.st, n);
    for (const k of Object.keys(g.anal)) if (+k >= n) { if (+k === n) delete g.anal[k].g; else delete g.anal[k]; }
    if (g.anal[n]) { delete g.anal[n].g; delete g.anal[n].lost; }
    save(); renderPlay(); afterChange();
  }

  // ---------------------------------------------------------------- online
  function loadOnline() {
    if (net.room) return Promise.resolve(net.room);
    return import(new URL('js/online.js?v=1', location.href).href).then(mod => {
      if (net.room) return net.room;
      net.room = mod.createOnline({ game: OG.game, gameId: 'checkers', botDelayMs: 500 });
      net.room.on('change', onNet);
      net.room.on('error', msg => { net.busy = false; toast(String(msg)); if (ui.tab === 'play') renderPlay(); });
      return net.room;
    });
  }
  function onNet(snap) {
    const prev = net.snap;
    let post = () => {}, turnFx = () => {};
    net.snap = snap;
    const playing = snap.status === 'playing' || snap.status === 'finished';
    if (snap.status === 'closed' || snap.status === 'left') {
      store.online = false; save();
      if (snap.status === 'closed') toast('The room was closed');
      net.snap = null; ui.onlineAnal = null;
    }
    if (playing && snap.pub) {
      const st = snap.pub.g;
      const oldSt = prev && prev.pub && prev.pub.g;
      net.busy = false;
      if (snap.status === 'finished' && !ui.onlineSaved) {
        ui.onlineSaved = true;
        store.last = { st, mode: 'online', level: 0, my: snap.mySeat >= 0 ? OG.sideOf(snap.pub, snap.mySeat) : 0, anal: ui.onlineAnal || {}, started: Date.now() };
        save();
      }
      // it just became my turn (not on a reload): the your-turn chime, and my name pulses
      const chime = !!(snap.myTurn && !st.result && prev && !prev.myTurn);
      turnFx = () => { if (!chime) return; FX.play('turn'); const nm = ui.tab === 'play' && vPlay.querySelector('.pl.turn .nm'); if (nm) FX.pulse(nm); };
      // slide the other player's move before redrawing (with its sounds); my own move sounded when I made it
      if (oldSt && st.moves.length === oldSt.moves.length + 1) {
        const m = R.findMove(oldSt, st.moves[st.moves.length - 1]);
        const mover = sideAt(st, st.moves.length - 1);
        const myLast = snap.mySeat >= 0 && mover === OG.sideOf(snap.pub, snap.mySeat);
        if (m && !myLast) {
          if (ui.tab === 'play' && !ui.anim) {
            ui.anim = true;
            animateMove(document.querySelector('.board[data-board="play"]'), m, () => { ui.anim = false; renderPlay(); afterMoveFx(m, mover, false); turnFx(); afterChange(); }, OTHER);
            return;
          }
          moveSounds(m, OTHER);
        }
        if (m) post = () => afterMoveFx(m, mover, myLast);
      }
    }
    if (ui.tab === 'play') { renderPlay(); post(); }
    turnFx();
    if (playing) afterChange();
  }
  function leaveOnline() {
    const r = net.room;
    store.online = false; ui.online = false; save();
    net.snap = null; ui.onlineAnal = null; ui.onlineSaved = false;
    if (r) r.leave().catch(() => {});
    if (layerOn() && history.state.layer === 'online') popQuiet();
    renderPlay();
  }
  async function onlineBtn(k) {
    if (k === 'open') { ui.online = true; pushLayer('online'); renderPlay(); loadOnline().catch(() => toast('Online play couldn’t load. Check your internet.')); return; }
    if (k === 'back') {
      if (net.snap && net.snap.status === 'lobby') { confirmBox('Leave this room?', 'Leave', leaveOnline); return; }
      ui.online = false; renderPlay();
      if (layerOn() && history.state.layer === 'online') popQuiet();
      return;
    }
    if (k === 'start') {
      if (net.connecting) return;
      net.connecting = true; renderPlay();
      const r = await net.room.start();
      net.connecting = false;
      if (!r.ok) toast(r.message);
      renderPlay(); return;
    }
    if (k !== 'create' && k !== 'join') return;
    const nameEl = $('#on-name');
    if (nameEl) { store.settings.name = nameEl.value.trim().slice(0, 20); save(); }
    const name = store.settings.name || 'Player';
    const codeEl = $('#on-code');
    const code = codeEl ? codeEl.value.replace(/[^a-z]/gi, '').toUpperCase() : '';
    if (k === 'join' && code.length !== 5) { toast('Room codes have 5 letters'); return; }
    if (net.connecting) return;
    net.connecting = true; renderPlay();
    let r;
    try {
      const room = await loadOnline();
      ui.onlineSaved = false; ui.onlineAnal = {};
      if (k === 'create') {
        const s = store.settings;
        const swap = s.side === 'second' ? 1 : s.side === 'random' ? (Math.random() < 0.5 ? 1 : 0) : 0;
        r = await room.createRoom({ name, seats: ['human', 'empty'], options: { variant: s.variant, swap, level: Math.min(s.level, 4) } });
      } else r = await room.joinRoom(code, name);
    } catch (e) { r = { ok: false, message: 'Online play couldn’t load. Check your internet.' }; }
    net.connecting = false;
    if (r.ok) { store.online = true; save(); } else toast(r.message);
    renderPlay();
  }
  function renderOnline() {
    const s = net.snap;
    const st = s ? s.status : 'none';
    let body;
    if (net.connecting && st !== 'lobby') body = '<div class="panel"><b>Connecting…</b><p class="muted small" style="margin:0">Talking to the game server.</p></div>';
    else if (st === 'joining') body = '<div class="panel"><b>Joining…</b><p class="muted small" style="margin:0">Waiting for the host to give you a seat.</p></div>';
    else if (st === 'lobby') {
      const o = s.options || {}, variant = R.VARIANTS[o.variant] ? o.variant : 'american';
      const seats = s.seats.map((x, i) => {
        const side = i ^ (o.swap ? 1 : 0);
        const who = x.kind === 'human' ? esc(x.name || 'Player') + (i === s.mySeat ? ' <span class="muted">(you)</span>' : '') + (x.online ? '' : ' <span class="muted">· away</span>') :
          x.kind === 'computer' ? esc(L.byId(o.level || 4).name) + ' computer' : '<span class="muted">Open seat</span>';
        let b = '';
        if (s.isHost && i !== s.mySeat) b = x.kind === 'empty' ? '<button class="btn small" data-seat="' + i + '" data-kind="computer">Computer</button>' :
          '<button class="btn small ghost" data-seat="' + i + '" data-kind="empty">' + (x.kind === 'human' ? 'Remove' : 'Open') + '</button>';
        return '<div class="seatrow">' + disc(variant, side) + '<span class="grow">' + who + ' <span class="muted small">· ' + esc(sideName(variant, side)) + '</span></span>' + b + '</div>';
      }).join('');
      body = '<div class="panel" style="align-items:center;gap:4px"><span class="label">Room code</span><div class="code-big">' + esc(s.code) + '</div>' +
        '<p class="muted small" style="margin:0;text-align:center">Friends open this site, tap Play online and type the code.</p></div>' +
        '<div class="panel"><span class="label">' + esc(V(variant).long) + '</span><div class="seats">' + seats + '</div>' +
        (s.isHost ? '<button class="btn primary" data-on="start" style="width:100%"' + (net.connecting ? ' disabled' : '') + '>' + (net.connecting ? 'Starting…' : 'Start') + '</button>' +
          '<p class="muted small" style="margin:0">An open seat becomes a computer.</p>' : '<p class="muted small" style="margin:0">Waiting for the host to start…</p>') + '</div>';
    } else {
      body = '<div class="panel"><span class="label">Your name</span>' +
        '<input class="txt" id="on-name" maxlength="20" autocomplete="nickname" placeholder="Name" value="' + esc(store.settings.name || '') + '">' +
        '<button class="btn primary" data-on="create" style="width:100%">Create a room</button>' +
        '<p class="muted small" style="margin:0">Uses the rules and side you picked. The other seat can be a friend or a computer.</p></div>' +
        '<div class="panel"><span class="label">Join a friend</span><div class="row">' +
        '<input class="txt code" id="on-code" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Code">' +
        '<button class="btn primary" data-on="join">Join</button></div></div>';
    }
    vPlay.innerHTML = '<div class="setup"><div class="row"><button class="btn small ghost" data-on="back">Back</button><span class="grow"></span><span class="label">Play online</span></div>' + body + '</div>';
  }

  // ================================================================== RULES sheet (own words)
  const RULES_TEXT = {
    american: ['8×8 board, 12 men each on the dark squares. Black (the dark pieces) moves first.',
      'Men move one square diagonally forward. Kings move one square in any diagonal direction.',
      'Jumping is compulsory. If you can jump, you must, but you may choose which jump. Finish every jump in a chain.',
      'Men jump forward only; kings jump both ways. A man that reaches the far row is crowned and its move ends there.',
      'You lose when you have no pieces or no legal move. Draw: the same position three times, or 40 moves each with no man moved and nothing captured.'],
    international: ['10×10 board, 20 men each. White moves first.',
      'Men move one square forward but capture forward and backward. Kings fly: they move and capture any distance along a diagonal.',
      'You must take the largest number of pieces possible (a king counts as one). Captured pieces come off only after the whole capture.',
      'A man is crowned only if it ends its move on the far row; passing through mid-capture doesn’t count.',
      'Draws: same position three times; 25 moves each with only kings moving and no captures; 3 pieces (with a king) vs a lone king: 16 moves each; 2 pieces or fewer vs a lone king: 5 moves each.'],
    russian: ['8×8 board, 12 men each. White moves first.',
      'Men move forward but capture backward too. Kings fly any distance.',
      'Capturing is compulsory, but you may choose any capture (not the longest). A king must land where it can keep capturing if it can.',
      'A man that reaches the far row during a capture becomes a king at once and keeps capturing as a king.',
      'Draws: same position three times; 15 moves each with only kings; 3 kings vs a king on the long diagonal: 15 moves; 3 pieces vs a king on the long diagonal: 5 moves; kings on both sides with 2–3 / 4–5 / 6–7 pieces: 5 / 30 / 60 moves.'],
    brazilian: ['8×8 board, 12 men each. White moves first. International rules on a smaller board.',
      'Men capture backward too. Kings fly. You must take the most pieces.',
      'A man is crowned only if it ends its move on the far row.',
      'Draws: same position three times; 20 moves each with only kings and no captures; 2 pieces or fewer (with a king) vs a lone king: 5 moves; 3 pieces vs a lone king on the long diagonal: 5 moves.'],
    casual: ['American checkers, but jumping is optional: you can make a plain move even when a jump is there.',
      'If you start a jump, you finish the whole chain.', 'Everything else (kings, crowning, draws) is the same as American.'],
  };
  function rulesSheet(variant) {
    sheet(V(variant).long, '<ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;font-size:14px">' + RULES_TEXT[variant].map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>');
  }

  // ================================================================== REVIEW
  const vReview = $('#v-review');
  function reviewGame() {
    const c = cur();
    if (c && c.mode !== 'online' && store.game && store.game.st.moves.length && !store.game.st.result) return { g: store.game, live: true };
    if (store.last) return { g: store.last, live: false };
    // a game that has just started (no moves yet) is still a game in progress, not "no game"
    if (store.game) return { g: store.game, live: true };
    if (c && c.mode === 'online') return { g: { st: c.st, mode: 'online', level: 0, my: c.my, anal: c.anal, started: gameKey(c) }, live: true };
    return null;
  }
  function renderReview() {
    const R0 = reviewGame();
    if (!R0) {
      vReview.innerHTML = '<div class="setup"><div class="panel"><b>No game yet</b><p class="muted" style="margin:0">Play a game, then come back here to see every move graded, the score graph and what the best moves were.</p><button class="btn primary" data-go="play">Play</button></div></div>';
      return;
    }
    const g = R0.g, st = g.st, n = st.moves.length;
    const key = g.started + ':' + n;
    if (ui.rv.key !== key) { ui.rv = { ply: Math.max(0, n - 1), key }; }
    const ply = Math.min(ui.rv.ply, n);
    const pos = R.replay(st, ply);
    const anal = g.anal || (g.anal = {});
    const me = g.mode === 'two' ? 0 : g.my;
    const a = anal[ply];
    const played = ply < n ? st.moves[ply] : null;
    const missing = []; for (let i = 0; i <= n; i++) if (!anal[i] && !(i === n && st.result)) missing.push(i);
    const graded = []; for (let i = 0; i < n; i++) if (!(anal[i] && anal[i].g)) graded.push(i);
    // accuracy per side
    const acc = [0, 1].map(side => {
      let sum = 0, k = 0;
      for (let i = 0; i < n; i++) if (sideAt(st, i) === side && anal[i] && anal[i].g && !anal[i].forced) { sum += Math.max(0, 100 - 40 * anal[i].lost); k++; }
      return k ? Math.round(sum / k) : null;
    });
    const wide = isWide();
    // phone: the board takes what is left after the other rows, keeping about three move rows visible
    const size = wide ? fitBoard(vReview, 0, 360 + 18) : fitBoard(vReview, 30 + 52 + 64 + 44 + (missing.length || graded.length ? 44 : 0) + 84 + 7 * 6, 0);
    const flip = me === 1;
    const arrows = [];
    if (played) arrows.push({ path: played, color: 'blue' });
    if (a && a.b && played && !R.samePath(a.b, played) && a.g && a.g.label !== 'Best') arrows.push({ path: a.b });
    const last = ply > 0 ? st.moves[ply - 1] : null;
    const boardH = boardHTML({ id: 'review', variant: st.variant, board: pos.board, flip, numbers: store.settings.numbers, last: last ? [last[0], last[last.length - 1]] : [], arrows });
    const who = side => (g.mode === 'two' ? sideName(st.variant, side) : side === g.my ? 'You' : (g.mode === 'online' ? 'Them' : L.byId(g.level).name));
    let info;
    if (played) {
      const mover = sideAt(st, ply);
      info = '<b>' + esc(who(mover)) + '</b> played <b>' + esc(mvText(st, ply)) + '</b> ' + gradeChip(a) +
        (a && a.g && a.lost > 0.1 && !a.forced ? ' <span class="muted">lost ' + a.lost.toFixed(1) + '</span>' : '') +
        (a && a.b && !R.samePath(a.b, played) && a.g && a.g.label !== 'Best' ? '<br><span class="muted">Best was</span> <b style="color:var(--good)">' + esc(R.moveText(st.variant, a.b, R.capsOf(pos, a.b))) + '</b>' : '');
    } else info = st.result ? '<b>' + esc(st.result.winner == null ? 'Draw' : who(st.result.winner) + (who(st.result.winner) === 'You' ? ' win' : ' wins')) + '</b> · ' + esc(R.REASONS[st.result.reason] || '') : 'Game in progress';
    const head = '<div class="acc">' + [0, 1].map(side => '<span>' + disc(st.variant, side).replace('class="disc"', 'style="width:16px;height:16px;vertical-align:-3px"') + ' ' + esc(who(side)) + ' <span class="big" style="color:' + (acc[side] == null ? 'var(--muted)' : 'hsl(' + Math.round(Math.max(0, acc[side] - 50) / 50 * 130) + ',70%,62%)') + '">' + (acc[side] == null ? '–' : acc[side] + '%') + '</span></span>').join('') +
      qBtn('Accuracy: 100% means every move was the coach’s best. Each move loses points for how much worse it was than the best move (1 point = one man); forced moves don’t count.') + '</div>';
    const graph = '<div class="chart" id="rv-chart">' + graphSVG(st, anal, me, ply) + '</div>';
    const nav = '<div class="navrow"><button class="btn" data-rv="first" aria-label="Start">«</button><button class="btn" data-rv="prev" aria-label="Back">‹</button><button class="btn" data-rv="next" aria-label="Forward">›</button><button class="btn" data-rv="last" aria-label="End">»</button></div>';
    const status = missing.length || graded.length ? (ui.rvBusy ? '<div class="muted small">Analyzing… ' + ui.rvBusy + '</div>' : '<button class="btn" data-rv="analyze">Analyze ' + (missing.length || graded.length) + ' positions</button>') : '';
    const list = '<div class="scroll" id="rv-list" style="flex:1">' + moveListHTML(st, anal, ply) + '</div>';
    const infoBox = '<div class="panel small" style="padding:8px 10px;min-height:52px">' + info + '</div>';
    if (wide) vReview.innerHTML = '<div class="split"><div class="board-wrap" style="width:' + size + 'px">' + boardH + '</div><div class="side">' + head + graph + infoBox + nav + status + list + '</div></div>';
    else vReview.innerHTML = '<div class="split">' + head + '<div class="board-wrap" style="width:' + size + 'px;align-self:center">' + boardH + '</div>' + infoBox + graph + nav + status + list + '</div>';
    const cel = vReview.querySelector('#rv-list td.cur'); if (cel) cel.scrollIntoView({ block: 'nearest' });
  }
  function graphSVG(st, anal, me, ply) {
    const n = st.moves.length, W = 300, H = 100;
    const x = i => (n ? i / n * W : 0);
    const y = e => { const s = me === 0 ? e : -e; const f = E.isMate(s) ? (s > 0 ? 1 : -1) : Math.tanh(s / 250); return H / 2 - f * (H / 2 - 4); };
    let pts = [];
    for (let i = 0; i <= n; i++) if (anal[i]) pts.push([x(i), y(anal[i].e)]);
    let h = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"><rect width="' + W + '" height="' + H / 2 + '" fill="rgba(110,231,168,.05)"/><line x1="0" x2="' + W + '" y1="' + H / 2 + '" y2="' + H / 2 + '" stroke="#2a3042"/>';
    if (pts.length > 1) {
      h += '<path d="M' + pts[0][0] + ',' + H / 2 + ' L' + pts.map(p => p.join(',')).join(' L') + ' L' + pts[pts.length - 1][0] + ',' + H / 2 + 'Z" fill="rgba(110,168,254,.18)"/>';
      h += '<polyline points="' + pts.map(p => p.join(',')).join(' ') + '" fill="none" stroke="#6ea8fe" stroke-width="1.6" vector-effect="non-scaling-stroke"/>';
    }
    for (let i = 0; i < n; i++) {
      const a = anal[i];
      if (a && a.g && /Mistake|Blunder|Inaccuracy/.test(a.g.label) && anal[i + 1]) {
        const col = a.g.label === 'Blunder' ? '#f08c8c' : a.g.label === 'Mistake' ? '#f0a86e' : '#f0d36e';
        h += '<circle cx="' + x(i + 1) + '" cy="' + y(anal[i + 1].e) + '" r="2.6" fill="' + col + '"/>';
      }
    }
    h += '<line x1="' + x(ply) + '" x2="' + x(ply) + '" y1="0" y2="' + H + '" stroke="#f0b354" stroke-width="1.2" vector-effect="non-scaling-stroke"/>';
    return h + '</svg>';
  }
  vReview.addEventListener('click', e => {
    const go = e.target.closest('[data-go]');
    if (go) { showTab(go.dataset.go, true); return; }
    const R0 = reviewGame();
    if (!R0) return;
    const n = R0.g.st.moves.length;
    const b = e.target.closest('[data-rv]');
    if (b) {
      const k = b.dataset.rv;
      if (k === 'first') ui.rv.ply = 0;
      else if (k === 'prev') ui.rv.ply = Math.max(0, ui.rv.ply - 1);
      else if (k === 'next') ui.rv.ply = Math.min(n, ui.rv.ply + 1);
      else if (k === 'last') ui.rv.ply = n;
      else if (k === 'analyze') { analyzeGame(R0.g); return; }
      renderReview(); return;
    }
    const td = e.target.closest('td[data-ply]');
    if (td) { ui.rv.ply = +td.dataset.ply; renderReview(); return; }
    const ch = e.target.closest('#rv-chart');
    if (ch) { const r = ch.getBoundingClientRect(); ui.rv.ply = Math.max(0, Math.min(n, Math.round((e.clientX - r.left) / r.width * n))); renderReview(); }
  });
  // run the coach over every position of a game that hasn't been looked at
  async function analyzeGame(g) {
    if (ui.rvBusy) return;
    const st = g.st, n = st.moves.length;
    g.anal = g.anal || {};
    const fake = { anal: g.anal, st, mode: g.mode };
    const key = 'rv:' + g.started;
    let s = R.replay(st, 0);
    for (let i = 0; i <= n; i++) {
      if (i > 0) s = R.act(s, s.turn, { path: st.moves[i - 1] });
      if (s.result) break;
      if (g.anal[i] && g.anal[i].g) continue;
      ui.rvBusy = Math.round(i / Math.max(1, n) * 100) + '%';
      if (ui.tab === 'review') renderReview();
      let r = null;
      try { r = await coach.run(s, { ms: 300, multi: true }); } catch (e) { r = null; }
      if (!r || !r.move) continue;
      if (!g.anal[i]) g.anal[i] = { e: s.turn === 0 ? r.score : -r.score, b: r.move.path, pv: r.pv, d: r.depth };
      const roots = (r.roots || []).map(x => ({ p: x.move && x.move.path, c: x.move && x.move.caps, s: x.score }));
      if (i < n) {
        const hit = roots.find(x => x.p && R.samePath(x.p, st.moves[i]));
        if (hit) {
          const lost = Math.max(0, (capMen(r.score) - capMen(hit.s)) / 100);
          const a = g.anal[i];
          a.lost = Math.round(lost * 100) / 100; a.caps = hit.c; a.forced = roots.length === 1;
          a.g = gradeOf(E.isMate(r.score) && r.score > 0 && !(E.isMate(hit.s) && hit.s > 0) ? 9 : lost, a.forced);
        }
      }
    }
    void fake; void key;
    ui.rvBusy = null;
    save();
    if (ui.tab === 'review') renderReview();
  }

  // ================================================================== ANALYZE (position explorer + editor, for a real table)
  const vAn = $('#v-analyze');
  function anState() {
    if (!store.an || !store.an.st || !R.VARIANTS[store.an.st.variant]) store.an = { st: R.newGame(store.settings.variant), flip: false };
    return store.an;
  }
  function renderAnalyze() {
    const an = anState(), st = an.st, v = V(st.variant), wide = isWide();
    const edit = ui.an.mode === 'edit';
    const res = ui.an.res && ui.an.res.key === anKey(st) ? ui.an.res : null;
    const legal = !edit && !st.result ? R.legal(st) : [];
    let dots = [], sel = null;
    if (!edit && ui.an.sel != null) {
      sel = ui.an.sel;
      const pre = ui.an.pre || [sel], byFinal = {};
      legal.filter(m => startsWith(m.path, pre)).forEach(m => { const f = m.path[m.path.length - 1]; (byFinal[f] = byFinal[f] || []).push(m); });
      for (const f in byFinal) {
        const grp = byFinal[f];
        dots.push({ sq: +f, kind: grp[0].caps.length ? 'cap' : '' });
        if (grp.length > 1) grp.forEach(m => { const nx = m.path[pre.length]; if (nx !== +f) dots.push({ sq: nx, kind: 'step' }); });
      }
    }
    const arrows = !edit && res && res.r.move ? [{ path: res.r.move.path }] : [];
    const size = wide ? fitBoard(vAn, 0, 360 + 18) : fitBoard(vAn, 44 + 8 + (edit ? 50 + 44 + 44 : 96 + 44) + 30, 0);
    const boardH = boardHTML({ id: 'an', variant: st.variant, board: st.board, flip: !!an.flip, numbers: store.settings.numbers, sel, dots, arrows,
      last: st.ply > 0 ? [st.moves[st.ply - 1][0], st.moves[st.ply - 1][st.moves[st.ply - 1].length - 1]] : [] });
    const top = '<div class="row"><select id="an-var" aria-label="Rules">' + R.VARIANT_IDS.map(id => '<option value="' + id + '"' + (id === st.variant ? ' selected' : '') + '>' + esc(V(id).name) + '</option>').join('') + '</select>' +
      '<div class="seg tight grow" data-anmode><button data-v="move" aria-pressed="' + !edit + '">Move</button><button data-v="edit" aria-pressed="' + edit + '">Set up</button></div>' +
      qBtn('Copy a position from a real board with Set up, then switch to Move to see the computer’s best move and its score. Play from here starts a game against the computer from this exact position.') + '</div>';
    let panel;
    if (edit) {
      const pal = [[1, disc(st.variant, 0)], [2, disc(st.variant, 0, true)], [-1, disc(st.variant, 1)], [-2, disc(st.variant, 1, true)], [0, '<span class="er">Empty</span>']];
      panel = '<div class="palette" data-pal>' + pal.map(p => '<button data-v="' + p[0] + '" aria-pressed="' + (ui.an.pal === p[0]) + '">' + p[1] + '</button>').join('') + '</div>' +
        '<div class="seg tight" data-anturn>' + [0, 1].map(s => '<button data-v="' + s + '" aria-pressed="' + (st.turn === s) + '">' + esc(sideName(st.variant, s)) + ' to move</button>').join('') + '</div>' +
        '<div class="navrow"><button class="btn" data-an="start">Start position</button><button class="btn" data-an="clear">Clear</button><button class="btn" data-an="flip">Flip</button></div>';
    } else {
      const ev = res ? evalText(st.turn === 0 ? res.r.score : -res.r.score, an.flip ? 1 : 0) : '…';
      const best = res && res.r.move ? R.moveText(st.variant, res.r.move.path, res.r.move.caps) : '';
      const line = st.result ? '<b>' + esc(st.result.winner == null ? 'Draw' : sideName(st.variant, st.result.winner) + ' wins') + '</b> · ' + esc(R.REASONS[st.result.reason]) :
        '<span class="muted">' + esc(sideName(st.variant, st.turn)) + ' to move.</span> ' + (best ? 'Best: <b style="color:var(--good)">' + esc(best) + '</b>' : 'Thinking…') +
        (res && res.r.pv && res.r.pv.length > 1 ? '<div class="pv" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + pvText(st, res.r.pv) + '</div>' : '');
      panel = '<div class="coach" style="align-items:flex-start;padding:6px 10px;min-height:58px"><span class="ev" style="color:' + evColor(res ? (st.turn === 0 ? res.r.score : -res.r.score) : null, an.flip ? 1 : 0) + '">' + ev + '</span><span class="msg" style="white-space:normal">' + line + '</span>' +
        (res ? '<span class="muted small" style="flex:none">depth ' + res.r.depth + '</span>' : '') + '</div>' +
        '<div class="navrow"><button class="btn" data-an="undo"' + (st.moves.length ? '' : ' disabled') + '>Undo</button><button class="btn" data-an="flip">Flip</button><button class="btn primary" data-an="play"' + (st.result ? ' disabled' : '') + '>Play from here</button></div>';
    }
    if (wide) vAn.innerHTML = '<div class="split"><div class="board-wrap" style="width:' + size + 'px">' + boardH + '</div><div class="side">' + top + panel + (!edit ? '<div class="panel" style="flex:1;min-height:0;display:flex;flex-direction:column"><span class="label">Moves</span><div class="scroll">' + moveListHTML(st, {}, st.ply - 1) + '</div></div>' : '') + '</div></div>';
    else vAn.innerHTML = '<div class="split">' + top + '<div class="board-wrap" style="width:' + size + 'px;align-self:center">' + boardH + '</div>' + panel + '</div>';
    if (!edit && !st.result && !res) {
      const k = anKey(st);
      if (ui.an.asked !== k) {
        ui.an.asked = k;
        deep.run(st, { ms: isWide() ? 1500 : 1000 }).then(r => { ui.an.res = { key: k, r }; if (ui.tab === 'analyze' && anKey(anState().st) === k) renderAnalyze(); }).catch(() => {});
      }
    }
  }
  const anKey = st => R.posKey(st.board, st.turn) + '|' + st.variant + '|' + st.ply;
  function anSet(st) { store.an.st = st; ui.an.sel = null; ui.an.pre = null; save(); renderAnalyze(); }
  vAn.addEventListener('change', e => {
    if (e.target.id === 'an-var') { store.an = { st: R.newGame(e.target.value), flip: false }; ui.an.sel = null; save(); renderAnalyze(); }
  });
  vAn.addEventListener('click', e => {
    const an = anState(), st = an.st;
    const mb = e.target.closest('[data-anmode] button');
    if (mb) {
      ui.an.mode = mb.dataset.v;
      if (ui.an.mode === 'move') anSet(R.newGame(st.variant, { board: st.board, turn: st.turn })); else renderAnalyze();
      return;
    }
    const pb = e.target.closest('[data-pal] button');
    if (pb) { ui.an.pal = +pb.dataset.v; renderAnalyze(); return; }
    const tb = e.target.closest('[data-anturn] button');
    if (tb) { anSet(R.newGame(st.variant, { board: st.board, turn: +tb.dataset.v })); return; }
    const b = e.target.closest('[data-an]');
    if (b) {
      const k = b.dataset.an;
      if (k === 'start') anSet(R.newGame(st.variant));
      else if (k === 'clear') anSet(R.newGame(st.variant, { board: new Array(R.geo(V(st.variant).n).S).fill(0), turn: st.turn }));
      else if (k === 'flip') { an.flip = !an.flip; save(); renderAnalyze(); }
      else if (k === 'undo') anSet(R.replay(st, st.moves.length - 1));
      else if (k === 'play') {
        const cur0 = cur();
        const go = () => {
          const pos = R.newGame(st.variant, { board: st.board, turn: st.turn });
          store.settings.variant = st.variant;
          startGame({ variant: st.variant, st: pos, my: an.flip ? 1 : 0, mode: 'computer' });
        };
        if (cur0 && cur0.mode !== 'online' && cur0.st.moves.length && !cur0.st.result) confirmBox('Quit your current game and play from this position?', 'Play', go);
        else if (cur0 && cur0.mode === 'online') toast('Leave the online room first');
        else go();
      }
      return;
    }
  });
  vAn.addEventListener('pointerup', e => {
    const bEl = e.target.closest('.board[data-board="an"]');
    if (!bEl || ui.an.busy) return;
    const an = anState(), st = an.st;
    const s = sqAt(bEl, e.clientX, e.clientY);
    if (s < 0) return;
    if (ui.an.mode === 'edit') {
      const b = st.board.slice();
      const v = V(st.variant), g = R.geo(v.n);
      let val = ui.an.pal;
      // men can't stand on their own crowning row
      if (val === 1 && g.row[s] === 0) val = 2;
      if (val === -1 && g.row[s] === v.n - 1) val = -2;
      b[s] = b[s] === val ? 0 : val;
      store.an.st = R.newGame(st.variant, { board: b, turn: st.turn }); save(); renderAnalyze();
      return;
    }
    if (st.result) return;
    const legal = R.legal(st);
    if (ui.an.sel != null) {
      const go = m => {
        const bEl2 = document.querySelector('.board[data-board="an"]');
        ui.an.sel = null; ui.an.pre = null; ui.an.busy = true; // taps wait until the slide has landed
        animateMove(bEl2, m, () => { ui.an.busy = false; if (store.an && store.an.st === st) anSet(R.act(st, st.turn, { path: m.path })); else if (ui.tab === 'analyze') renderAnalyze(); });
      };
      // as on the Play tab: when two capture routes end on the same square, the first landing square picks the route
      const pre = ui.an.pre || [ui.an.sel];
      const cands = legal.filter(m => startsWith(m.path, pre));
      const finals = cands.filter(m => m.path.length > pre.length && m.path[m.path.length - 1] === s);
      if (finals.length === 1) { go(finals[0]); return; }
      const steps = cands.filter(m => m.path.length > pre.length && m.path[pre.length] === s);
      if (steps.length) {
        const pre2 = pre.concat([s]), left = cands.filter(m => startsWith(m.path, pre2));
        if (left.length === 1) { go(left[0]); return; }
        ui.an.pre = pre2; renderAnalyze(); return;
      }
      if (finals.length > 1) { toast('Two ways to get there: tap the first landing square'); return; }
    }
    ui.an.pre = null;
    const x = st.board[s];
    if (x && (x > 0) === (st.turn === 0) && legal.some(m => m.path[0] === s)) { ui.an.sel = s; FX.play('tap'); renderAnalyze(); return; }
    if (x && (x > 0) === (st.turn === 0) && legal.length && legal[0].caps.length) { toast('A jump is compulsory'); FX.play('error'); }
    ui.an.sel = null; renderAnalyze();
  });

  // ================================================================== PUZZLES
  const vPz = $('#v-puzzles');
  const PZ = window.CkPuzzles || [];
  function pzList() {
    const v = store.settings.variant;
    const list = PZ.filter(p => p.v === v);
    return list.length ? list : PZ.filter(p => p.v === 'american');
  }
  function pzBoard(p) { return p.b.split('').map(ch => 'kmeMK'.indexOf(ch) - 2); }
  function renderPuzzles() {
    const list = pzList();
    if (!list.length) { vPz.innerHTML = '<div class="setup"><div class="panel"><b>Puzzles are on their way</b></div></div>'; return; }
    const variant = list[0].v;
    const idxKey = variant;
    let i = Math.min(store.pz.idx[idxKey] || 0, list.length - 1);
    const p = list[i];
    if (!ui.pz.state || ui.pz.id !== p.id) { ui.pz = { id: p.id, state: R.newGame(p.v, { board: pzBoard(p), turn: p.t }), done: false, msg: '', sel: null, tries: 0 }; }
    const st = ui.pz.state, wide = isWide();
    const flip = p.t === 1;
    const legal = !ui.pz.done && st.turn === p.t ? R.legal(st) : [];
    const dots = ui.pz.sel != null ? legal.filter(m => m.path[0] === ui.pz.sel).map(m => ({ sq: m.path[m.path.length - 1], kind: m.caps.length ? 'cap' : '' })) : [];
    const arrows = ui.pz.showSol ? [{ path: p.line[0] }] : [];
    const size = wide ? fitBoard(vPz, 0, 360 + 18) : fitBoard(vPz, 44 + 52 + 44 + 24 + 20, 0);
    const solved = Object.keys(store.pz.solved).filter(id => list.some(x => x.id === id)).length;
    const goal = p.kind === 'win' ? 'and win the game' : 'and win material';
    const head = '<div class="row"><span class="label grow">Puzzle ' + (i + 1) + ' of ' + list.length + (store.pz.solved[p.id] ? ' · solved' : '') + '</span><span class="muted small">' + solved + ' solved · ' + esc(V(variant).name) + '</span>' +
      qBtn('These positions come from games the computer played against itself. In each one there is a move that wins material or the game; every other move is clearly worse. Your puzzles follow the rules you picked on the Play tab.') + '</div>';
    const msg = '<div class="coach">' + disc(p.v, p.t) + '<span class="msg" style="white-space:normal">' + (ui.pz.msg || '<b>' + esc(sideName(p.v, p.t)) + ' to move ' + goal + '</b>') + '</span></div>';
    const nav = '<div class="navrow"><button class="btn" data-pz="prev"' + (i ? '' : ' disabled') + '>‹</button><button class="btn" data-pz="hint"' + (ui.pz.done ? ' disabled' : '') + '>Hint</button><button class="btn" data-pz="sol"' + (ui.pz.done ? ' disabled' : '') + '>Show</button><button class="btn primary" data-pz="next"' + (i < list.length - 1 ? '' : ' disabled') + '>Next</button></div>';
    const boardH = boardHTML({ id: 'pz', variant: p.v, board: st.board, flip, numbers: store.settings.numbers, sel: ui.pz.sel, dots, arrows,
      can: ui.pz.hint ? new Set([p.line[0][0]]) : null, last: st.ply > 0 ? [st.moves[st.ply - 1][0], st.moves[st.ply - 1][st.moves[st.ply - 1].length - 1]] : [] });
    if (wide) vPz.innerHTML = '<div class="split"><div class="board-wrap" style="width:' + size + 'px">' + boardH + '</div><div class="side">' + head + msg + nav + '</div></div>';
    else vPz.innerHTML = '<div class="split">' + head + '<div class="board-wrap" style="width:' + size + 'px;align-self:center">' + boardH + '</div>' + msg + nav + '</div>';
  }
  vPz.addEventListener('click', e => {
    const b = e.target.closest('[data-pz]');
    if (!b) return;
    const list = pzList(), key = list[0].v;
    const i = Math.min(store.pz.idx[key] || 0, list.length - 1);
    const k = b.dataset.pz;
    if (k === 'next' || k === 'prev') { store.pz.idx[key] = Math.max(0, Math.min(list.length - 1, i + (k === 'next' ? 1 : -1))); ui.pz.state = null; save(); renderPuzzles(); return; }
    if (k === 'hint') { ui.pz.hint = true; ui.pz.msg = 'Look at the glowing piece.'; renderPuzzles(); return; }
    if (k === 'sol') { ui.pz.showSol = true; ui.pz.msg = 'The green arrow is the winning move. Play it to see the rest.'; renderPuzzles(); }
  });
  vPz.addEventListener('pointerup', e => {
    const bEl = e.target.closest('.board[data-board="pz"]');
    if (!bEl || ui.pz.done || ui.pz.busy) return;
    const list = pzList(), key = list[0].v;
    const p = list[Math.min(store.pz.idx[key] || 0, list.length - 1)];
    const st = ui.pz.state;
    const s = sqAt(bEl, e.clientX, e.clientY);
    if (s < 0) return;
    const legal = R.legal(st);
    if (ui.pz.sel != null) {
      const ms = legal.filter(m => m.path[0] === ui.pz.sel && m.path[m.path.length - 1] === s);
      if (ms.length) {
        // two capture routes to the same square: either counts, and the solution's own route keeps the replay on track
        const m = ms.find(x => p.sol.some(y => R.samePath(x.path, y))) || ms[0];
        ui.pz.sel = null;
        const ok = p.sol.some(x => R.samePath(x, m.path)) || p.sol.some(x => x[0] === m.path[0] && x[x.length - 1] === m.path[m.path.length - 1]);
        ui.pz.busy = true;
        animateMove(bEl, m, () => {
          ui.pz.busy = false;
          // remember the attempt across reloads, so a reload never turns a second try into "First try!"
          const before = !!store.pz.tried[p.id];
          store.pz.tried[p.id] = 1;
          if (!ok) {
            ui.pz.tries++; save();
            ui.pz.msg = '<span class="grade g-mistake">Not quite</span> That lets the win slip. Try again.';
            ui.pz.state = R.newGame(p.v, { board: pzBoard(p), turn: p.t });
            renderPuzzles();
            FX.play('error'); FX.shake(vPz.querySelector('.board-wrap'));
            return;
          }
          store.pz.solved[p.id] = 1; save();
          ui.pz.state = R.act(st, st.turn, { path: m.path });
          ui.pz.done = true;
          ui.pz.msg = '<span class="grade g-best">Correct</span> ' + (ui.pz.tries || before ? '' : 'First try! ') + 'Here is how it goes on…';
          renderPuzzles();
          FX.celebrate({ kind: 'big', at: vPz.querySelector('.board-wrap') });
          playLine(p, 1);
        });
        return;
      }
    }
    const x = st.board[s];
    if (x && (x > 0) === (st.turn === 0) && legal.some(m => m.path[0] === s)) { ui.pz.sel = s; FX.play('tap'); renderPuzzles(); return; }
    if (x && (x > 0) === (st.turn === 0) && legal.length && legal[0].caps.length && V(st.variant).mandatory) { toast('A jump is compulsory'); FX.play('error'); }
    ui.pz.sel = null; renderPuzzles();
  });
  // replay the rest of the winning line slowly
  function playLine(p, k) {
    const id = p.id;
    if (k >= p.line.length) { ui.pz.msg += ' <b>Done.</b>'; renderPuzzles(); return; }
    setTimeout(() => {
      if (ui.pz.id !== id || ui.tab !== 'puzzles') return;
      const st = ui.pz.state;
      const m = R.findMove(st, p.line[k]);
      if (!m) return;
      animateMove(document.querySelector('.board[data-board="pz"]'), m, () => {
        if (ui.pz.id !== id) return;
        ui.pz.state = R.act(st, st.turn, { path: m.path });
        renderPuzzles(); playLine(p, k + 1);
      });
    }, 550);
  }

  // ================================================================== SETTINGS
  const vSet = $('#v-settings');
  function renderSettings() {
    const s = store.settings;
    const sw = (k, title, sub) => '<div class="setrow"><div class="grow"><b>' + esc(title) + '</b><span>' + esc(sub) + '</span></div><label class="switch"><input type="checkbox" data-sw="' + k + '"' + (s[k] ? ' checked' : '') + '><span></span></label></div>';
    const m = L.MEASURED;
    const strength = m ? '<table class="rt strength"><thead><tr><th>Match</th><th>Wins</th><th>Draws</th><th>Losses</th><th>Score</th></tr></thead><tbody>' +
      Object.keys(m.pairs).map(k => { const [a, b] = k.split('v'); const r = m.pairs[k]; const sc = 1 - r.score; return '<tr><td>' + esc(L.byId(+b).name) + ' vs ' + esc(L.byId(+a).name) + '</td><td>' + r.l + '</td><td>' + r.d + '</td><td>' + r.w + '</td><td class="sc" style="color:hsl(' + Math.round(sc * 130) + ',70%,62%)">' + Math.round(sc * 100) + '%</td></tr>'; }).join('') +
      '</tbody></table><p class="muted small" style="margin:6px 0 0">' + m.gamesPerPair + ' games per match, ' + esc(V(m.variant).name) + ' rules, random openings, colours swapped. Score counts a draw as half.</p>' : '<p class="muted small">Not measured yet.</p>';
    const yes = '✓', no = '–';
    const rows = [
      ['Board', id => V(id).n + '×' + V(id).n],
      ['First move', id => V(id).sides[0]],
      ['Men jump back', id => (V(id).menBack ? yes : no)],
      ['Flying kings', id => (V(id).flying ? yes : no)],
      ['Must take most', id => (V(id).majority ? yes : no)],
      ['Must jump', id => (V(id).mandatory ? yes : no)],
    ];
    vSet.innerHTML = '<div class="set scroll">' +
      '<div class="panel">' + sw('coach', 'Coach', 'Score bar, move grades and the Hint button') + sw('dots', 'Show moves', 'Dots where the selected piece can go') +
      sw('numbers', 'Square names', 'Numbers or letters on the board, as in books') + sw('turnBoard', 'Turn the board', 'Two players: the side to move is at the bottom') + '</div>' +
      '<div class="panel" id="fx-box"><span class="label">Sound &amp; effects</span></div>' +
      '<div class="panel"><div class="row"><span class="label grow">How strong is the computer?</span>' + qBtn('Each level searches a fixed number of positions, so it plays the same on any device. Weaker levels also add random mistakes. The table is real games between the levels.') + '</div>' + strength + '</div>' +
      '<div class="panel"><div class="row"><span class="label grow">Rules compared</span>' + qBtn('Checkers was solved in 2007 (Schaeffer et al., Science): with perfect play, American checkers is a draw. Every rule set here follows the official rules; tap a name for the details.') + '</div>' +
      '<div class="rtwrap"><table class="rt"><thead><tr><th></th>' + R.VARIANT_IDS.map(id => '<th><button class="btn small ghost" data-rules="' + id + '" style="padding:0 4px;min-height:28px">' + esc(V(id).name) + '</button></th>').join('') + '</tr></thead><tbody>' +
      rows.map(r => '<tr><td>' + r[0] + '</td>' + R.VARIANT_IDS.map(id => '<td>' + esc(r[1](id)) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div></div>' +
      '<div class="panel"><div class="setrow"><div class="grow"><b>Online play</b><span>Friends on their own phones, or a computer in the other seat.</span></div><button class="btn small" data-online>Open</button></div></div>' +
      '<p class="ver">Build ' + BUILD + ' · <a href="../">More games</a></p></div>';
    FX.renderSettings($('#fx-box'));
  }
  vSet.addEventListener('change', e => {
    const k = e.target.dataset.sw;
    if (!k) return;
    store.settings[k] = e.target.checked; save();
    if (k === 'coach' && e.target.checked) { const c = cur(); if (c) requestCoach(c); }
  });
  vSet.addEventListener('click', e => {
    const r = e.target.closest('[data-rules]');
    if (r) { rulesSheet(r.dataset.rules); return; }
    if (e.target.closest('[data-online]')) { if (!store.game) ui.online = true; showTab('play', true); if (store.game) toast('Finish or quit the current game first'); }
  });
  document.addEventListener('click', e => { const go = e.target.closest('[data-go]'); if (go && !e.target.closest('#v-review')) showTab(go.dataset.go, true); });

  // ================================================================== start
  const first = (location.hash || '').slice(1);
  try { history.replaceState({ tab: first || 'play' }, '', location.hash || '#play'); } catch (e) { /* file:// */ }
  showTab(first || 'play', false);
  if (store.game && !store.game.st.result) afterChange();
  if (store.online) {
    ui.online = true; net.connecting = true; renderPlay();
    loadOnline().then(r => r.resume()).then(ok => {
      net.connecting = false;
      if (!ok) { store.online = false; ui.online = false; save(); }
      renderPlay();
    }).catch(() => { net.connecting = false; store.online = false; ui.online = false; save(); renderPlay(); });
  }
})();
