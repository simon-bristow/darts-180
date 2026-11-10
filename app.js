'use strict';
(() => {
  const DEFAULT_QUICK = [60, 80, 100, 120, 140, 180];
  const MAX_PLAYERS = 10;
  const BEST_OF = [1, 3, 5, 7, 9, 11];
  const KEY_SETTINGS = 'darts180.settings';
  const KEY_MATCH = 'darts180.match';

  const $ = sel => document.querySelector(sel);
  const app = $('#app');
  const modalRoot = $('#modal-root');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isQuickValue = v => Number.isInteger(v) && v > 0 && Checkout.isValidTurn(v);

  // ---------- Storage ----------
  const store = {
    get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } },
  };

  const settings = (() => {
    const s = Object.assign({ quick: [...DEFAULT_QUICK], recent: [], start: 501, bestOf: 3, players: [], speech: true, voice: '', sound: 'thud' }, store.get(KEY_SETTINGS) || {});
    if (!Array.isArray(s.quick) || s.quick.length !== 6 || !s.quick.every(isQuickValue)) s.quick = [...DEFAULT_QUICK];
    if (![501, 301].includes(s.start)) s.start = 501;
    if (!BEST_OF.includes(s.bestOf)) s.bestOf = 3;
    s.speech = s.speech !== false;
    if (typeof s.voice !== 'string') s.voice = '';
    if (!Speech.sounds().some(x => x.id === s.sound)) s.sound = 'thud';
    s.recent = Array.isArray(s.recent) ? s.recent.filter(x => typeof x === 'string').slice(0, 24) : [];
    s.players = Array.isArray(s.players) ? s.players.filter(x => typeof x === 'string').slice(0, MAX_PLAYERS) : [];
    return s;
  })();
  const saveSettings = () => store.set(KEY_SETTINGS, settings);
  Speech.setVoice(settings.voice);

  // ---------- Caller announcements ----------
  const speak = parts => { if (settings.speech && Speech.supported) Speech.say(parts); };
  const capital = t => t.charAt(0).toUpperCase() + t.slice(1);
  function upNext(d, opening = false) {
    const p = d.P[d.cur];
    if (p.rem <= 170 && Checkout.minDarts(p.rem)) return `${p.name}, you require ${Speech.words(p.rem)}.`;
    return opening ? `${p.name} to throw first. Game on!` : `${p.name} to throw.`;
  }
  function announce(t) {
    const d = derive(match);
    if (t.o) {
      const name = d.P[d.lastOut.player].name;
      speak({ text: d.winner != null ? `Game shot, and the match! ${name}!` : `Game shot, and the ${Speech.ordinal(d.lastOut.leg + 1)} leg, ${name}!`, rate: 0.9 });
      return;
    }
    const call = t.b ? 'Bust!'
      : t.s === 0 ? 'No score.'
      : t.s === 180 ? { text: 'One hundred and eighty!', rate: 0.8, pitch: 1.15 }
      : capital(Speech.words(t.s)) + '.';
    speak([call, { sound: settings.sound }, { pause: 250 }, upNext(d)]);
  }

  let match = (() => {
    const m = store.get(KEY_MATCH);
    if (!m || !Array.isArray(m.players) || !m.players.length || !Array.isArray(m.turns)) return null;
    return m;
  })();
  const saveMatch = () => (match ? store.set(KEY_MATCH, match) : store.del(KEY_MATCH));

  // ---------- Game state derived from the list of turns ----------
  // A turn is { s: score entered, d: darts used, b: bust, o: checked out }.
  function derive(m) {
    const n = m.players.length;
    const toWin = Math.ceil(m.bestOf / 2);
    const first = (m.first || 0) % n;
    const P = m.players.map(name => ({
      name, legs: 0, rem: m.start, points: 0, darts: 0, high: 0,
      c100: 0, c140: 0, c180: 0, bestOut: 0, last: null, legPoints: 0, legDarts: 0,
    }));
    let leg = 0, cur = first, winner = null, lastOut = null;
    // history[leg] = { starter, winner, rounds: [[cell per player]] }; a round is one visit by each player.
    const history = [{ starter: first, winner: null, rounds: [] }];
    let legTurns = new Array(n).fill(0);
    m.turns.forEach((t, i) => {
      if (winner != null) return;
      const p = P[cur];
      const h = history[leg];
      const r = legTurns[cur]++;
      if (!h.rounds[r]) h.rounds[r] = new Array(n).fill(null);
      h.rounds[r][cur] = { s: t.s, b: t.b, o: t.o, rem: t.b ? p.rem : p.rem - t.s };
      p.darts += t.d; p.legDarts += t.d; p.last = t;
      if (!t.b) {
        p.points += t.s; p.legPoints += t.s; p.rem -= t.s;
        p.high = Math.max(p.high, t.s);
        if (t.s === 180) p.c180++; else if (t.s >= 140) p.c140++; else if (t.s >= 100) p.c100++;
      }
      if (t.o) {
        p.legs++;
        p.bestOut = Math.max(p.bestOut, t.s);
        lastOut = { leg, player: cur, score: t.s, darts: p.legDarts, turn: i };
        h.winner = cur;
        if (p.legs >= toWin) { winner = cur; return; }
        leg++;
        history.push({ starter: (first + leg) % n, winner: null, rounds: [] });
        legTurns = new Array(n).fill(0);
        P.forEach(q => { q.rem = m.start; q.legPoints = 0; q.legDarts = 0; q.last = null; });
        cur = (first + leg) % n;
        return;
      }
      cur = (cur + 1) % n;
    });
    const lastTurn = m.turns[m.turns.length - 1];
    return { P, n, leg, cur, winner, toWin, lastOut, history, lastWasOut: !!(lastTurn && lastTurn.o) };
  }

  // ---------- UI state ----------
  if (match && derive(match).winner != null) { match = null; saveMatch(); }
  const setup = { start: settings.start, bestOf: settings.bestOf, players: [...settings.players] };
  const ui = { screen: match ? 'game' : 'setup', entry: '', legOverlay: false, pendingOut: null };
  let pendingConfirm = null;

  // ---------- Toast & modal ----------
  let toastTimer;
  function toast(msg, kind = '') {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show ' + kind;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast'; }, 1900);
  }
  function openModal(html, { wide = false, dismiss = true } = {}) {
    modalRoot.innerHTML = `<div class="backdrop" ${dismiss ? 'data-dismiss="1"' : ''}><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
  }
  function closeModal() { modalRoot.innerHTML = ''; ui.pendingOut = null; pendingConfirm = null; }
  function confirmModal(title, msg, yes, fn) {
    openModal(`<h3>${title}</h3><p>${msg}</p><div class="mrow end"><button class="btn" data-action="close-modal">Cancel</button><button class="btn danger" data-action="confirm-yes">${yes}</button></div>`);
    pendingConfirm = fn;
  }

  // ---------- Setup screen ----------
  function persistSetup() {
    settings.start = setup.start; settings.bestOf = setup.bestOf; settings.players = [...setup.players];
    saveSettings();
  }

  function addPlayer(raw) {
    const name = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 16);
    if (!name) return false;
    if (setup.players.length >= MAX_PLAYERS) { toast('Maximum of 10 players', 'bad'); return false; }
    if (setup.players.some(p => p.toLowerCase() === name.toLowerCase())) { toast(`${name} is already in`, 'bad'); return false; }
    setup.players.push(name);
    persistSetup();
    return true;
  }

  function renderSetup(focusName = false) {
    const s = setup;
    const inList = n => s.players.some(p => p.toLowerCase() === n.toLowerCase());
    const recent = settings.recent.filter(n => !inList(n)).slice(0, 14);
    const full = s.players.length >= MAX_PLAYERS;
    const resumable = match && derive(match).winner == null;
    app.innerHTML = `
    <div class="setup">
      <header class="setup-head full">
        <div class="logo">180</div>
        <div><h1>Darts Scorer</h1><p>Straight in · double out · 1–10 players</p></div>
      </header>
      ${resumable ? `
      <div class="card resume full">
        <div class="resume-text"><strong>Game in progress</strong><span>${match.start} · ${esc(match.players.join(', '))}</span></div>
        <button class="btn ghost" data-action="discard">Discard</button>
        <button class="btn primary" data-action="resume">Resume</button>
      </div>` : ''}
      <section class="card">
        <h2>Game</h2>
        <div class="seg">${[501, 301].map(v => `<button class="seg-btn ${s.start === v ? 'on' : ''}" data-action="set-start" data-v="${v}">${v}</button>`).join('')}</div>
        <h2>Match</h2>
        <div class="seg">${BEST_OF.map(v => `<button class="seg-btn ${s.bestOf === v ? 'on' : ''}" data-action="set-bestof" data-v="${v}">${v === 1 ? '1 leg' : 'Best of ' + v}</button>`).join('')}</div>
        <p class="hint">${s.bestOf === 1 ? 'Single leg — first to check out wins.' : `First to ${Math.ceil(s.bestOf / 2)} legs. The first thrower rotates each leg.`}</p>
      </section>
      <section class="card players-card">
        <h2>Players <span class="count">${s.players.length}/${MAX_PLAYERS}</span></h2>
        <form class="add-row" data-form="add-player" autocomplete="off">
          <input id="name-input" type="text" maxlength="16" placeholder="${full ? 'Player limit reached' : 'Add player name'}" autocapitalize="words" autocorrect="off" spellcheck="false" enterkeyhint="done" ${full ? 'disabled' : ''}>
          <button class="btn primary" type="submit" ${full ? 'disabled' : ''}>Add</button>
        </form>
        ${recent.length && !full ? `<div class="chips"><span class="chips-label">Recent</span>${recent.map(n => `<button class="chip" data-action="add-recent" data-name="${esc(n)}">+ ${esc(n)}</button>`).join('')}</div>` : ''}
        ${s.players.length ? `<ol class="player-list">${s.players.map((p, i) => `
          <li>
            <span class="num">${i + 1}</span><span class="pname">${esc(p)}</span>
            <button class="icon-btn" data-action="move" data-i="${i}" data-v="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
            <button class="icon-btn" data-action="move" data-i="${i}" data-v="1" ${i === s.players.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
            <button class="icon-btn danger" data-action="remove" data-i="${i}" aria-label="Remove">✕</button>
          </li>`).join('')}</ol>` : `<p class="no-players">Add at least one player to start.</p>`}
        ${s.players.length > 1 ? `<div class="mrow"><button class="btn ghost small" data-action="shuffle">Shuffle throw order</button></div>` : ''}
      </section>
      <section class="card">
        <h2>Quick score buttons</h2>
        <div class="quick-preview">${settings.quick.map(v => `<span>${v}</span>`).join('')}</div>
        <div class="mrow"><button class="btn ghost small" data-action="edit-quick">Customise</button></div>
      </section>
      <button class="btn primary big full" data-action="start" ${s.players.length ? '' : 'disabled'}>Start ${s.start}${s.players.length ? ` · ${s.players.length} player${s.players.length > 1 ? 's' : ''}` : ''}</button>
    </div>`;
    if (focusName) { const inp = $('#name-input'); if (inp && !inp.disabled) inp.focus(); }
  }

  function startMatch() {
    match = { start: setup.start, bestOf: setup.bestOf, players: [...setup.players], first: 0, turns: [], created: Date.now() };
    settings.recent = [...setup.players, ...settings.recent.filter(r => !setup.players.some(p => p.toLowerCase() === r.toLowerCase()))].slice(0, 24);
    persistSetup();
    saveMatch();
    ui.screen = 'game'; ui.entry = ''; ui.legOverlay = false;
    keepAwake();
    render();
    speak(upNext(derive(match), true));
  }

  // ---------- Game screen ----------
  const avg = (pts, darts) => (darts ? (pts / darts * 3).toFixed(1) : '–');

  function entryInfo(d) {
    if (!ui.entry) return { note: '', bad: false };
    const n = Number(ui.entry);
    const rem = d.P[d.cur].rem;
    if (!Checkout.isValidTurn(n)) return { note: 'Not possible', bad: true };
    if (n > rem || rem - n === 1) return { note: 'Bust', bad: true };
    if (n === rem) return Checkout.minDarts(rem) ? { note: 'Game shot?', bad: false } : { note: 'Bust', bad: true };
    return { note: `Leaves ${rem - n}`, bad: false };
  }

  function checkoutHtml(rem) {
    if (rem > 170) return '';
    const route = Checkout.suggest(rem);
    if (!route) return '<span class="out-label">No checkout</span>';
    return `<span class="out-label">Checkout</span>${route.map((x, i) => `<span class="dart ${i === route.length - 1 ? 'fin' : ''}">${x}</span>`).join('')}`;
  }

  // Two fixed-height lines: score + note on top, checkout route underneath.
  function entryHtml(d) {
    const cur = d.P[d.cur];
    const info = entryInfo(d);
    const note = ui.entry ? info.note : `${esc(cur.name)} · enter score`;
    return `
      <span class="entry-top">
        <span class="entry-val">${ui.entry || '–'}</span>
        <span class="entry-note ${info.bad ? 'bad' : ''}">${note}</span>
      </span>
      <span class="entry-out">${checkoutHtml(cur.rem)}</span>`;
  }

  function updateEntry() {
    const el = $('#entry');
    if (!el || !match) return;
    el.classList.toggle('empty', !ui.entry);
    el.innerHTML = entryHtml(derive(match));
  }

  function rowHtml(p, i, d) {
    const isCur = i === d.cur && d.winner == null;
    const last = p.last ? (p.last.b ? '<b class="bust">Bust</b>' : `<b>${p.last.s}</b>`) : '–';
    return `
      <div class="prow ${isCur ? 'cur' : ''}">
        <div class="pinfo">
          <div class="pname">${esc(p.name)}</div>
          <div class="psub"><span>Avg <b>${avg(p.points, p.darts)}</b></span><span>Last ${last}</span></div>
        </div>
        ${match.bestOf > 1 ? `<div class="plegs" title="Legs won"><span>Legs</span>${p.legs}</div>` : ''}
        <div class="prem">${p.rem}</div>
      </div>`;
  }

  // Round-by-round scores, one table per leg, newest leg first.
  function scoresHtml(d) {
    const legs = d.history.map((h, i) => ({ h, i })).filter(x => x.h.rounds.length).reverse();
    if (!legs.length) return '<p>No scores yet.</p>';
    const multi = match.bestOf > 1;
    return legs.map(({ h, i }) => {
      const order = d.P.map((_, k) => (h.starter + k) % d.n); // columns in throwing order for this leg
      const cell = c => {
        if (!c) return '<td class="sc-empty"></td>';
        const cls = c.b ? 'sc-bust' : c.o ? 'sc-out' : c.s >= 100 ? 'sc-ton' : '';
        const main = c.b ? (c.s ? `Bust <small>(${c.s})</small>` : 'Bust') : c.s;
        return `<td class="${cls}"><span class="sc-s">${main}</span><span class="sc-rem">${c.o ? 'Checkout' : c.rem}</span></td>`;
      };
      const status = h.winner != null ? `${esc(d.P[h.winner].name)} won` : 'In progress';
      return `<section class="leg-scores">
        ${multi || h.winner != null ? `<h4>${multi ? `Leg ${i + 1}` : 'Leg'} <span>${status}</span></h4>` : ''}
        <div class="table-wrap"><table class="scores">
          <thead><tr><th>Rd</th>${order.map(k => `<th>${esc(d.P[k].name)}</th>`).join('')}</tr></thead>
          <tbody>${h.rounds.map((row, r) => `<tr><td class="sc-rd">${r + 1}</td>${order.map(k => cell(row[k])).join('')}</tr>`).join('')}</tbody>
        </table></div>
      </section>`;
    }).join('');
  }

  function statsTable(d) {
    const legs = match.bestOf > 1;
    return `<div class="table-wrap"><table class="stats">
      <thead><tr><th>Player</th>${legs ? '<th>Legs</th>' : ''}<th>3-dart avg</th><th>Darts</th><th>High</th><th>100+</th><th>140+</th><th>180s</th><th>Best out</th></tr></thead>
      <tbody>${d.P.map(p => `<tr><td>${esc(p.name)}</td>${legs ? `<td>${p.legs}</td>` : ''}<td>${avg(p.points, p.darts)}</td><td>${p.darts}</td><td>${p.high || '–'}</td><td>${p.c100}</td><td>${p.c140}</td><td>${p.c180}</td><td>${p.bestOut || '–'}</td></tr>`).join('')}</tbody>
    </table></div>`;
  }

  function overlayHtml(d) {
    if (d.winner != null) {
      const w = d.P[d.winner];
      return `<div class="overlay"><div class="ocard">
        <div class="trophy">🏆</div>
        <h2>${esc(w.name)} wins${match.bestOf > 1 ? ' the match' : ''}!</h2>
        ${match.bestOf > 1 ? `<p class="score-line">${d.P.map(p => `${esc(p.name)} <b>${p.legs}</b>`).join(' · ')}</p>` : ''}
        ${d.lastOut ? `<p class="muted">Checked out ${d.lastOut.score} · ${d.lastOut.darts} darts</p>` : ''}
        ${statsTable(d)}
        <div class="obtns">
          <button class="btn ghost" data-action="undo">↶ Undo last score</button>
          <button class="btn" data-action="new-game">New game</button>
          <button class="btn primary" data-action="rematch">Rematch</button>
        </div>
      </div></div>`;
    }
    if (ui.legOverlay && d.lastWasOut && d.lastOut) {
      const w = d.P[d.lastOut.player];
      return `<div class="overlay"><div class="ocard">
        <div class="trophy">🎯</div>
        <h2>${esc(w.name)} wins leg ${d.lastOut.leg + 1}</h2>
        <p class="muted">Checked out ${d.lastOut.score} · ${d.lastOut.darts} darts</p>
        <div class="legs-tally">${d.P.map(p => `<div class="${p === w ? 'won' : ''}"><span>${esc(p.name)}</span><strong>${p.legs}</strong></div>`).join('')}</div>
        <p class="muted">First to ${d.toWin} legs</p>
        <div class="obtns">
          <button class="btn ghost" data-action="undo">↶ Undo checkout</button>
          <button class="btn primary big-inline" data-action="next-leg">Next leg · ${esc(d.P[d.cur].name)} throws first</button>
        </div>
      </div></div>`;
    }
    return '';
  }

  function renderGame() {
    const d = derive(match);
    const legLabel = match.bestOf === 1 ? 'Single leg' : `Best of ${match.bestOf} · Leg ${d.leg + 1}`;
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

    app.innerHTML = `
    <div class="game">
      <header class="bar">
        <div class="bar-title"><span class="badge">${match.start}</span><span>${legLabel}</span></div>
        <div class="bar-actions">
          <button class="btn small" data-action="scores">Scores</button>
          <button class="btn small" data-action="stats">Stats</button>
          ${Speech.supported ? `<button class="btn small ${settings.speech ? '' : 'ghost'}" data-action="toggle-speech" aria-pressed="${settings.speech}" aria-label="Speech ${settings.speech ? 'on' : 'off'}">${settings.speech ? '🔊 Speech' : '🔇 Muted'}</button>` : ''}
          <button class="btn small" data-action="edit-quick">Settings</button>
          <button class="btn small ghost" data-action="quit">New game</button>
        </div>
      </header>
      <main class="main">
        <section class="board" aria-label="Scoreboard">${d.P.map((p, i) => rowHtml(p, i, d)).join('')}</section>
        <section class="input">
          <button class="entry ${ui.entry ? '' : 'empty'}" id="entry" data-action="clear" aria-label="Score entry, tap to clear">${entryHtml(d)}</button>
          <div class="quick">${settings.quick.map(v => `<button class="qbtn" data-action="quick" data-v="${v}">${v}</button>`).join('')}</div>
          <div class="pad">
            ${keys.map(k => `<button class="key" data-action="digit" data-v="${k}">${k}</button>`).join('')}
            <button class="key fn" data-action="back" aria-label="Delete">⌫</button>
            <button class="key" data-action="digit" data-v="0">0</button>
            <button class="key enter" data-action="enter">Enter</button>
          </div>
          <div class="actions-row">
            <button class="act undo" data-action="undo" ${match.turns.length ? '' : 'disabled'}>↶ Undo</button>
            <button class="act noscore" data-action="no-score">No score</button>
            <button class="act bust" data-action="bust">Bust</button>
          </div>
        </section>
      </main>
      ${overlayHtml(d)}
    </div>`;
  }

  function blocked() {
    if (!match) return true;
    const d = derive(match);
    return d.winner != null || (ui.legOverlay && d.lastWasOut);
  }

  function pressDigit(k) {
    if (blocked()) return;
    if (ui.entry.length >= 3) return;
    ui.entry = ui.entry === '0' ? k : ui.entry + k;
    updateEntry();
  }
  function backspace() { if (blocked()) return; ui.entry = ui.entry.slice(0, -1); updateEntry(); }

  function rejectEntry(msg) {
    toast(msg, 'bad');
    const el = $('#entry');
    if (el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
  }

  function record(t) {
    match.turns.push(t);
    ui.entry = '';
    saveMatch();
    if (t.o && derive(match).winner == null) ui.legOverlay = true;
    render();
    announce(t);
  }

  function submit(score) {
    if (blocked()) return;
    if (!Checkout.isValidTurn(score)) {
      ui.entry = '';
      updateEntry();
      rejectEntry(`${score} isn't possible with three darts`);
      return;
    }
    const d = derive(match);
    const p = d.P[d.cur];
    const rem = p.rem;
    if (score > rem || rem - score === 1) {
      record({ s: score, d: 3, b: true, o: false });
      toast(`Bust! ${p.name} stays on ${rem}`, 'bad');
      return;
    }
    if (score === rem) {
      const md = Checkout.minDarts(rem);
      if (!md) {
        record({ s: score, d: 3, b: true, o: false });
        toast(`Bust! ${rem} can't be finished on a double`, 'bad');
        return;
      }
      ui.pendingOut = score;
      openModal(`
        <h3>Game shot?</h3>
        <p>${esc(p.name)} needs ${rem}. Finished on a double? How many darts did it take?</p>
        <div class="dart-btns">${[1, 2, 3].map(k => `<button class="btn ${k >= md ? 'primary' : ''}" data-action="out" data-v="${k}" ${k < md ? 'disabled' : ''}>${k} dart${k > 1 ? 's' : ''}</button>`).join('')}</div>
        <div class="mrow">
          <button class="btn danger" data-action="out-bust">Missed the double — bust</button>
          <span class="spacer"></span>
          <button class="btn ghost" data-action="close-modal">Cancel</button>
        </div>`, { dismiss: false });
      return;
    }
    record({ s: score, d: 3, b: false, o: false });
    if (score === 180) toast('ONE HUNDRED AND EIGHTY!', 'gold');
  }

  function undo() {
    if (!match || !match.turns.length) return;
    const t = match.turns.pop();
    ui.legOverlay = false; ui.entry = '';
    saveMatch();
    const d = derive(match);
    toast(`Undone: ${d.P[d.cur].name} ${t.b ? 'bust' : t.s}`);
    render();
  }

  // ---------- Quick-score settings ----------
  function openQuickModal() {
    openModal(`
      <h3>Settings</h3>
      <form data-form="quick" class="quick-form" autocomplete="off">
        <h4 class="form-h">Quick score buttons</h4>
        <p class="form-p">Six one-tap scores. Each must be a possible 3-dart score (1–180).</p>
        ${settings.quick.map((v, i) => `<input type="number" inputmode="numeric" min="1" max="180" name="q${i}" value="${v}" aria-label="Quick score ${i + 1}">`).join('')}
        ${Speech.supported ? `
        <h4 class="form-h">Caller voice</h4>
        <div class="voice-row">
          <select name="voice" aria-label="Caller voice">
            <option value="">Automatic (British male)${Speech.voiceName() && !settings.voice ? ` · ${esc(Speech.voiceName())}` : ''}</option>
            ${Speech.list().map(v => `<option value="${esc(v.name)}" ${v.name === settings.voice ? 'selected' : ''}>${esc(v.name)} · ${esc(v.lang)}</option>`).join('')}
          </select>
          <button type="button" class="btn" data-action="voice-test">▶ Test</button>
        </div>
        <h4 class="form-h">Sound between calls</h4>
        <p class="form-p">Plays after the score is called, before the next player. Tap one to hear it.</p>
        <div class="sound-grid">${Speech.sounds().map(x => `<label class="snd"><input type="radio" name="sound" value="${x.id}" ${x.id === settings.sound ? 'checked' : ''}><span>${x.id === 'none' ? '' : '▶ '}${x.label}</span></label>`).join('')}</div>` : ''}
        <div class="mrow">
          <button type="button" class="btn ghost" data-action="quick-reset">Reset to defaults</button>
          <span class="spacer"></span>
          <button type="button" class="btn" data-action="close-modal">Cancel</button>
          <button type="submit" class="btn primary">Save</button>
        </div>
      </form>`);
  }
  function saveQuick(form) {
    const inputs = [...form.querySelectorAll('input')];
    const vals = inputs.map(i => Number(i.value));
    let ok = true;
    inputs.forEach((inp, i) => { const good = isQuickValue(vals[i]); inp.classList.toggle('err', !good); if (!good) ok = false; });
    if (!ok) { toast('Each must be a possible score from 1–180', 'bad'); return; }
    settings.quick = vals;
    const sel = form.querySelector('select[name=voice]');
    if (sel) { settings.voice = sel.value; Speech.setVoice(settings.voice); }
    const snd = form.querySelector('input[name=sound]:checked');
    if (snd) settings.sound = snd.value;
    saveSettings();
    closeModal();
    render();
    toast('Settings saved');
  }

  // ---------- Actions ----------
  const actions = {
    'set-start': el => { setup.start = Number(el.dataset.v); persistSetup(); renderSetup(); },
    'set-bestof': el => { setup.bestOf = Number(el.dataset.v); persistSetup(); renderSetup(); },
    'add-recent': el => { if (addPlayer(el.dataset.name)) renderSetup(); },
    move: el => {
      const i = Number(el.dataset.i), j = i + Number(el.dataset.v);
      if (j < 0 || j >= setup.players.length) return;
      [setup.players[i], setup.players[j]] = [setup.players[j], setup.players[i]];
      persistSetup(); renderSetup();
    },
    remove: el => { setup.players.splice(Number(el.dataset.i), 1); persistSetup(); renderSetup(); },
    shuffle: () => {
      const a = setup.players;
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      persistSetup(); renderSetup();
    },
    start: () => {
      if (!setup.players.length) return;
      if (match && derive(match).winner == null && match.turns.length) {
        confirmModal('Replace game in progress?', 'Starting a new game will clear the scores from the game in progress.', 'Start new game', () => { closeModal(); startMatch(); });
      } else startMatch();
    },
    resume: () => { ui.screen = 'game'; keepAwake(); render(); speak(upNext(derive(match))); },
    discard: () => confirmModal('Discard game?', 'The game in progress will be cleared.', 'Discard', () => { match = null; saveMatch(); closeModal(); render(); }),
    'edit-quick': openQuickModal,
    'quick-reset': () => modalRoot.querySelectorAll('.quick-form input').forEach((inp, i) => { inp.value = DEFAULT_QUICK[i]; inp.classList.remove('err'); }),
    'close-modal': closeModal,
    'toggle-speech': () => {
      settings.speech = !settings.speech;
      saveSettings();
      render();
      if (settings.speech) speak('Speech on.'); else Speech.say([]);
    },
    'voice-test': () => {
      const sel = modalRoot.querySelector('select[name=voice]');
      Speech.setVoice(sel ? sel.value : settings.voice);
      Speech.say({ text: 'One hundred and eighty!', rate: 0.8, pitch: 1.15 });
      Speech.setVoice(settings.voice);
    },
    'confirm-yes': () => { const fn = pendingConfirm; if (fn) fn(); },
    digit: el => pressDigit(el.dataset.v),
    back: backspace,
    clear: () => { if (!blocked()) { ui.entry = ''; updateEntry(); } },
    enter: () => {
      if (blocked()) return;
      if (!ui.entry) { rejectEntry('Type a score first (0 for no score)'); return; }
      submit(Number(ui.entry));
    },
    'no-score': () => { ui.entry = ''; submit(0); },
    bust: () => {
      if (blocked()) return;
      const d = derive(match);
      ui.entry = '';
      toast(`Bust! ${d.P[d.cur].name} stays on ${d.P[d.cur].rem}`, 'bad');
      record({ s: 0, d: 3, b: true, o: false });
    },
    quick: el => { ui.entry = ''; submit(Number(el.dataset.v)); },
    out: el => { const s = ui.pendingOut; closeModal(); if (s != null) record({ s, d: Number(el.dataset.v), b: false, o: true }); },
    'out-bust': () => {
      const s = ui.pendingOut; closeModal();
      if (s == null) return;
      const d = derive(match);
      toast(`Bust! ${d.P[d.cur].name} stays on ${d.P[d.cur].rem}`, 'bad');
      record({ s, d: 3, b: true, o: false });
    },
    undo,
    scores: () => openModal(`<h3>Scores</h3><p>Each round is one visit per player. Small number is what was left.</p><div class="scores-scroll">${scoresHtml(derive(match))}</div><div class="mrow end"><button class="btn primary" data-action="close-modal">Close</button></div>`, { wide: true }),
    stats: () => openModal(`<h3>Match stats</h3>${statsTable(derive(match))}<div class="mrow end"><button class="btn primary" data-action="close-modal">Close</button></div>`, { wide: true }),
    quit: () => confirmModal('Abandon this game?', 'Scores for the current game will be cleared. Players and settings are kept.', 'Abandon game', () => {
      match = null; saveMatch(); closeModal(); ui.screen = 'setup'; ui.legOverlay = false; render();
    }),
    'next-leg': () => { ui.legOverlay = false; render(); speak(upNext(derive(match), true)); },
    rematch: () => {
      const old = match;
      match = { start: old.start, bestOf: old.bestOf, players: [...old.players], first: ((old.first || 0) + 1) % old.players.length, turns: [], created: Date.now() };
      saveMatch(); ui.legOverlay = false; ui.entry = ''; render();
      speak(upNext(derive(match), true));
    },
    'new-game': () => { match = null; saveMatch(); ui.screen = 'setup'; ui.legOverlay = false; render(); },
  };

  document.addEventListener('click', e => {
    if (e.target.classList && e.target.classList.contains('backdrop') && e.target.dataset.dismiss) { closeModal(); return; }
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.action];
    if (fn) fn(el, e);
  });

  document.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target.dataset.form;
    if (f === 'add-player') {
      const inp = $('#name-input');
      if (inp && addPlayer(inp.value)) renderSetup(true);
    } else if (f === 'quick') saveQuick(e.target);
  });

  // Play a hit sound as soon as it's picked in Settings.
  document.addEventListener('change', e => {
    if (e.target.name === 'sound') Speech.playSound(e.target.value);
  });

  document.addEventListener('keydown', e => {
    if (modalRoot.firstChild) { if (e.key === 'Escape') closeModal(); return; }
    if (ui.screen !== 'game' || !match) return;
    if (e.target.matches && e.target.matches('input, textarea')) return;
    if (/^[0-9]$/.test(e.key)) { pressDigit(e.key); e.preventDefault(); }
    else if (e.key === 'Backspace') { backspace(); e.preventDefault(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (ui.legOverlay && derive(match).lastWasOut) actions['next-leg']();
      else actions.enter();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { undo(); e.preventDefault(); }
  });

  // ---------- Keep the iPad screen awake during a game ----------
  async function keepAwake() {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible' && ui.screen === 'game') await navigator.wakeLock.request('screen');
    } catch { /* not supported or denied */ }
  }
  document.addEventListener('visibilitychange', keepAwake);

  function render() {
    if (ui.screen === 'game' && match) renderGame();
    else { ui.screen = 'setup'; renderSetup(); }
  }

  render();
  keepAwake();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
