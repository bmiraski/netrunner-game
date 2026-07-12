// Board renderer: full repaint from game state, perspective-filtered.
// The UI is a decision renderer (ENGINE.md): everything here is read-only;
// clicks dispatch decision option ids back through app.answer(id).
import { memoryUsed, memoryLimit, handSize } from '../engine/state.js';
import { activeSubs, iceStrength } from '../engine/run.js';
import { linkBonus } from '../engine/effects.js';
import { escapeHtml, factionColor, statLine, cardPanelHtml } from './cardtext.js';
import { eventText, serverName } from './logtext.js';

const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstChild;
};

// --- perspective -----------------------------------------------------------
// viewer 'corp' | 'runner' | 'all'
const seesCorpHidden = v => v === 'corp' || v === 'all';

function corpCardVisible(it, viewer) {
  return it.rezzed || it.faceup || seesCorpHidden(viewer);
}

// --- option map: decision option ids -> board targets -----------------------
// verb:instId | t:sid | run:sid | bare instId  (see engine/game.js, run.js)
export function buildOptionMap(decision) {
  const byInst = new Map(), byServer = new Map();
  if (!decision) return { byInst, byServer };
  for (const o of decision.options ?? []) {
    let m;
    if ((m = o.id.match(/^(?:play|install|rez|advance|score|break|boost|ability|d):(\d+)$/))) {
      push(byInst, Number(m[1]), o);
    } else if ((m = o.id.match(/^(?:t|run):(.+)$/))) {
      push(byServer, m[1], o);
    } else if (/^\d+$/.test(o.id)) {
      push(byInst, Number(o.id), o);
    }
  }
  return { byInst, byServer };
}
const push = (map, k, v) => { (map.get(k) ?? map.set(k, []).get(k)).push(v); };

// --- card tiles -------------------------------------------------------------
function tile(app, it, { facedown = false, ice = false } = {}) {
  const card = it.card;
  const shown = !facedown;
  const color = shown ? factionColor(card.faction) : '#39404d';
  const subline = shown && card.subtypes?.length
    ? `<div class="tile-sub">${escapeHtml(card.subtypes.slice(0, 3).join(' · '))}</div>` : '';
  const el = h(`<div class="tile ${ice ? 'tile-ice' : ''} ${facedown ? 'tile-facedown' : ''}"
       data-inst="${it.id}" style="--fc:${color}">
    <div class="tile-title">${shown ? escapeHtml(card.title) : (ice ? 'ICE' : 'CARD')}</div>
    ${subline}
    ${shown ? `<div class="tile-stats">${escapeHtml(statLine(card))}</div>` : ''}
    ${badges(it, shown)}
  </div>`);
  if (ice && !it.rezzed) el.classList.add('tile-unrezzed');
  el.addEventListener('click', (e) => { e.stopPropagation(); app.onCardClick(it.id, el, shown ? card : null); });
  if (shown) el.addEventListener('mouseenter', () => app.preview(card));
  return el;
}

function badges(it, shown) {
  const b = [];
  if (it.advancement) b.push(`<span class="badge b-adv">${it.advancement}</span>`);
  for (const [k, n] of Object.entries(it.counters ?? {})) {
    if (n) b.push(`<span class="badge b-${k}">${n}${k[0]}</span>`);
  }
  if (shown && it.card.type === 'ice' && it.rezzed) b.push(`<span class="badge b-str">${it.card.strength ?? 0}</span>`);
  return b.length ? `<div class="tile-badges">${b.join('')}</div>` : '';
}

// --- servers ----------------------------------------------------------------
function serverBox(app, g, sid, viewer) {
  const srv = g.state.corp.servers[sid];
  const box = h(`<div class="server" data-server="${sid}">
      <div class="server-name">${escapeHtml(serverName(sid))}</div>
      <div class="server-content"></div>
      <div class="server-ice"></div>
    </div>`);
  const contentEl = box.querySelector('.server-content');
  if (sid === 'hq' || sid === 'rd') {
    const count = sid === 'hq' ? g.state.corp.hand.length : g.state.corp.deck.length;
    contentEl.appendChild(h(`<div class="pile">${count}</div>`));
  } else if (sid === 'archives') {
    const ids = g.state.corp.archives;
    const up = ids.filter(id => g.insts[id].faceup);
    contentEl.appendChild(h(`<div class="pile" title="${up.length} faceup / ${ids.length - up.length} facedown">${ids.length}</div>`));
    for (const id of up) contentEl.appendChild(tile(app, g.insts[id]));
    if (seesCorpHidden(viewer)) {
      for (const id of ids.filter(i => !g.insts[i].faceup)) {
        contentEl.appendChild(tile(app, g.insts[id]));
      }
    }
  } else {
    for (const id of srv.content) {
      const it = g.insts[id];
      contentEl.appendChild(tile(app, it, { facedown: !corpCardVisible(it, viewer) }));
    }
    if (!srv.content.length) contentEl.appendChild(h('<div class="empty-slot"></div>'));
  }
  // ice: index 0 = innermost; display outermost at bottom (closest to runner)
  const iceEl = box.querySelector('.server-ice');
  for (let i = srv.ice.length - 1; i >= 0; i--) {
    const it = g.insts[srv.ice[i]];
    iceEl.appendChild(tile(app, it, { facedown: !it.rezzed && !seesCorpHidden(viewer), ice: true }));
  }
  box.addEventListener('click', () => app.onServerClick(sid, box));
  return box;
}

// --- trackers ---------------------------------------------------------------
const pips = n => n > 0
  ? `<span class="pips">${'<span class="pip">&#x25F4;</span>'.repeat(Math.min(n, 9))}${n > 9 ? `+${n - 9}` : ''}</span>`
  : '<span class="pips pips-none">no clicks</span>';

function corpBar(app, g) {
  const c = g.state.corp;
  const idCard = g.insts[c.identity].card;
  const active = g.state.activePlayer === 'corp';
  const el = h(`<div class="side-bar corp-bar ${active ? 'side-active' : ''}" style="--fc:${factionColor(idCard.faction)}">
    <span class="id-name" data-inst="${c.identity}">${escapeHtml(idCard.title)}</span>
    <span class="stat">&#x2B21;<i>c</i> ${c.credits}</span>
    <span class="stat">${pips(c.clicks)}</span>
    <span class="stat">Agenda pts: <b>${c.agendaPoints}</b>/7</span>
    ${c.badPublicity ? `<span class="stat stat-bad">BP ${c.badPublicity}</span>` : ''}
  </div>`);
  el.querySelector('.id-name').addEventListener('mouseenter', () => app.preview(idCard));
  return el;
}

function runnerBar(app, g) {
  const r = g.state.runner;
  const idCard = g.insts[r.identity].card;
  const mu = `${memoryUsed(g)}/${memoryLimit(g)}`;
  const link = r.baseLink + linkBonus(g);
  const active = g.state.activePlayer === 'runner';
  const el = h(`<div class="side-bar runner-bar ${active ? 'side-active' : ''}" style="--fc:${factionColor(idCard.faction)}">
    <span class="id-name" data-inst="${r.identity}">${escapeHtml(idCard.title)}</span>
    <span class="stat">&#x2B21;<i>c</i> ${r.credits}</span>
    <span class="stat">${pips(r.clicks)}</span>
    <span class="stat">&mu; ${mu}</span>
    <span class="stat">Link ${link}</span>
    <span class="stat">Agenda pts: <b>${r.agendaPoints}</b>/7</span>
    ${r.tags ? `<span class="stat stat-bad">Tags ${r.tags}</span>` : ''}
    ${r.brainDamage ? `<span class="stat stat-bad">Brain ${r.brainDamage}</span>` : ''}
    <span class="stat">Stack ${r.deck.length} · Heap ${r.discard.length}</span>
  </div>`);
  el.querySelector('.id-name').addEventListener('mouseenter', () => app.preview(idCard));
  return el;
}

// --- turn banner --------------------------------------------------------------
function turnBanner(app) {
  const s = app.game.state;
  if (s.winner) {
    return h(`<div class="turn-banner turn-over">GAME OVER — ${s.winner.toUpperCase()} WINS (${escapeHtml(s.winReason ?? '')})</div>`);
  }
  const who = s.activePlayer ? `${s.activePlayer === 'corp' ? 'CORP' : 'RUNNER'} TURN` : 'SETUP';
  const d = app.game.decision;
  const thinking = d && app.viewer !== 'all' && d.player !== app.viewer;
  return h(`<div class="turn-banner ${s.activePlayer ?? ''}">
    <span>TURN ${s.turn}</span><span class="tb-sep">//</span><span>${who}</span>
    ${thinking ? `<span class="tb-sep">//</span><span class="tb-thinking">${d.player} is thinking&hellip;</span>` : ''}
  </div>`);
}

// --- hands ------------------------------------------------------------------
function handRow(app, g, player, viewer, label) {
  const ids = g.state[player].hand;
  const visible = viewer === 'all' || viewer === player;
  const row = h(`<div class="hand-row"><span class="hand-label">${label} (${ids.length}/${handSize(g, player)})</span><div class="hand-cards"></div></div>`);
  const cardsEl = row.querySelector('.hand-cards');
  if (visible) {
    for (const id of ids) cardsEl.appendChild(tile(app, g.insts[id]));
  } else {
    for (const id of ids) cardsEl.appendChild(h('<div class="tile tile-back"></div>'));
  }
  return row;
}

// --- run panel ------------------------------------------------------------
// Step-by-step run visualization: current phase, and during an encounter the
// full subroutine list with per-sub broken/unbroken state.
// Returns {el, focusIceId} — focusIceId gets the board marker.
function runPanel(g) {
  const run = g.state.run;
  if (!run || run.ended) return { el: null, focusIceId: null };

  let phase = '', focusIceId = null;
  const events = g.log.events;
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.type === 'run-start' || ev.type === 'run-end') break;
    if (ev.type === 'approach-ice') {
      phase = `approaching ${ev.data.rezzed ? ev.data.title : 'unrezzed ice'} (position ${ev.data.position + 1})`;
      focusIceId = ev.data.iceId;
      break;
    }
    if (ev.type === 'approach-server') { phase = 'approaching the server'; break; }
    if (ev.type === 'access-count' || ev.type === 'card-accessed') { phase = 'accessing cards'; break; }
  }

  const el = h(`<div class="run-panel">
    <div class="run-head">RUN on ${escapeHtml(serverName(run.server))}${run.successful ? ' — <b>SUCCESSFUL</b>' : ''}</div>
  </div>`);

  const encId = run.encounterIce;
  if (encId) {
    focusIceId = encId;
    const ice = g.insts[encId];
    const subs = activeSubs(g, ice);
    const rows = subs.map(x => {
      const broken = ice.brokenSubs.includes(x.index);
      return `<div class="run-sub ${broken ? 'sub-broken' : 'sub-live'}">
        <span class="sub-mark">${broken ? '&#x2713;' : '&#x21B3;'}</span>
        <span>${escapeHtml(x.label)}</span>
        <span class="sub-state">${broken ? 'broken' : 'unbroken'}</span>
      </div>`;
    }).join('');
    el.appendChild(h(`<div class="run-encounter">
      <div class="run-ice-name">ENCOUNTER: ${escapeHtml(ice.card.title)}
        <span class="run-ice-str">str ${iceStrength(g, encId)}</span></div>
      <div class="run-subs">${rows || '<div class="run-sub sub-none">no active subroutines</div>'}</div>
    </div>`));
  } else if (phase) {
    el.appendChild(h(`<div class="run-phase">${escapeHtml(phase)}</div>`));
  }
  return { el, focusIceId };
}

// --- log -----------------------------------------------------------------------
function renderLog(g, viewer, logEl) {
  logEl.innerHTML = '';
  for (const ev of g.log.events) {
    const r = eventText(ev, g, viewer);
    if (!r) continue;
    logEl.appendChild(h(`<div class="log-line ${r.cls}">${escapeHtml(r.text)}</div>`));
  }
  logEl.scrollTop = logEl.scrollHeight;
}

// --- tutorial callout ---------------------------------------------------------
function renderCallout(app, calloutEl) {
  const tut = app.tutorial;
  if (!tut) { calloutEl.style.display = 'none'; return; }
  calloutEl.style.display = '';
  calloutEl.innerHTML = '';

  // queued one-time event callouts take priority (dismissable)
  const ev = app.eventCallouts[0];
  if (ev) {
    calloutEl.appendChild(h(`<div class="co-box co-event">
      <div class="co-title">${escapeHtml(ev.title)}</div>
      <div class="co-text">${escapeHtml(ev.text)}</div>
    </div>`));
    const ok = h('<button class="btn btn-primary co-ok">Got it</button>');
    ok.addEventListener('click', () => { app.eventCallouts.shift(); renderCallout(app, calloutEl); });
    calloutEl.querySelector('.co-box').appendChild(ok);
    return;
  }

  const c = tut.done ? null : tut.callout();
  if (c) {
    calloutEl.appendChild(h(`<div class="co-box">
      <div class="co-step">TUTORIAL ${escapeHtml(c.step)}</div>
      <div class="co-title">${escapeHtml(c.title)}</div>
      <div class="co-text">${escapeHtml(c.text)}</div>
      <div class="co-do">Do it: the highlighted option below.</div>
    </div>`));
    return;
  }

  // free play (guided script finished): hint on demand
  if (app.game.state.winner) { calloutEl.style.display = 'none'; return; }
  const box = h(`<div class="co-box co-free">
    <div class="co-step">PRACTICE</div>
    <div class="co-text">${app.hintText ? escapeHtml(app.hintText) : 'Your game now. Stuck? Ask for a suggestion.'}</div>
  </div>`);
  const btn = h('<button class="btn co-hint">Hint</button>');
  btn.addEventListener('click', (e) => { e.stopPropagation(); app.showHint(); });
  box.appendChild(btn);
  calloutEl.appendChild(box);
}

// --- prompt ----------------------------------------------------------------------
function renderPrompt(app, promptEl) {
  const { game, viewer } = app;
  const d = game.decision;
  promptEl.innerHTML = '';
  if (game.state.winner) {
    promptEl.appendChild(h(`<div class="prompt-head log-over">GAME OVER — ${game.state.winner.toUpperCase()} wins</div>`));
    promptEl.appendChild(h(`<div class="prompt-sub">${escapeHtml(game.state.winReason ?? '')}</div>`));
    const b = h('<button class="btn btn-primary">New game</button>');
    b.addEventListener('click', () => app.newGame());
    promptEl.appendChild(b);
    return;
  }
  if (!d) return;
  const mine = viewer === 'all' || d.player === viewer;
  if (!mine) {
    promptEl.appendChild(h(`<div class="prompt-head prompt-waiting">${d.player === 'corp' ? 'Corp' : 'Runner'} is thinking&hellip;</div>`));
    return;
  }
  promptEl.appendChild(h(`<div class="prompt-side">${d.player.toUpperCase()} decision</div>`));
  promptEl.appendChild(h(`<div class="prompt-head">${escapeHtml(d.prompt)}</div>`));
  if (d.kind === 'number') {
    const row = h(`<div class="num-row"><input type="number" min="${d.min}" max="${d.max}" value="${d.min}" class="num-input"><button class="btn btn-primary">OK &#x23CE;</button></div>`);
    const input = row.querySelector('input');
    row.querySelector('button').addEventListener('click', () => app.answer(Number(input.value)));
    promptEl.appendChild(row);
    input.focus();
    return;
  }
  const allowed = app.allowedId();
  d.options.forEach((o, i) => {
    const key = i < 9 ? `<span class="kbd">${i + 1}</span>` : '';
    const b = h(`<button class="btn opt-btn">${key}${escapeHtml(o.label)}</button>`);
    if (allowed && o.id !== allowed) {
      b.disabled = true;
      b.classList.add('opt-locked');
    } else if (allowed) {
      b.classList.add('opt-taught');
    }
    b.addEventListener('click', () => app.answer(o.id));
    promptEl.appendChild(b);
  });
}

// --- top-level render ---------------------------------------------------------------
export function render(app) {
  const { game, viewer, els } = app;
  const g = game.g;
  let mapDecision =
    game.decision && (viewer === 'all' || game.decision.player === viewer) ? game.decision : null;
  const allowed = app.allowedId();
  if (mapDecision && allowed) {
    mapDecision = { ...mapDecision, options: mapDecision.options.filter(o => o.id === allowed) };
  }
  app.optionMap = buildOptionMap(mapDecision);

  // corp zone
  els.corpZone.innerHTML = '';
  els.corpZone.appendChild(corpBar(app, g));
  const serversRow = h('<div class="servers-row"></div>');
  const sids = Object.keys(g.state.corp.servers);
  const remotes = sids.filter(s => s.startsWith('remote'));
  for (const sid of [...remotes, 'archives', 'rd', 'hq']) {
    serversRow.appendChild(serverBox(app, g, sid, viewer));
  }
  els.corpZone.appendChild(serversRow);
  if (viewer === 'corp' || viewer === 'all') els.corpZone.appendChild(handRow(app, g, 'corp', viewer, 'HQ'));

  // middle: turn banner + run panel
  els.midZone.innerHTML = '';
  els.midZone.appendChild(turnBanner(app));
  const { el: runEl, focusIceId } = runPanel(g);
  if (runEl) els.midZone.appendChild(runEl);
  if (focusIceId != null) {
    for (const iceEl of document.querySelectorAll(`[data-inst="${focusIceId}"]`)) {
      iceEl.classList.add('tile-current-ice');
    }
  }

  // runner zone
  els.runnerZone.innerHTML = '';
  els.runnerZone.appendChild(runnerBar(app, g));
  const rig = g.state.runner.rig;
  const rigRow = h('<div class="rig-row"></div>');
  for (const kind of ['program', 'hardware', 'resource']) {
    const col = h(`<div class="rig-col"><div class="rig-label">${kind}s</div><div class="rig-cards"></div></div>`);
    const cardsEl = col.querySelector('.rig-cards');
    for (const id of rig[kind]) cardsEl.appendChild(tile(app, g.insts[id]));
    rigRow.appendChild(col);
  }
  els.runnerZone.appendChild(rigRow);
  els.runnerZone.appendChild(handRow(app, g, 'runner', viewer, 'Grip'));

  // highlight actionable targets
  for (const [instId] of app.optionMap.byInst) {
    for (const el of document.querySelectorAll(`[data-inst="${instId}"]`)) el.classList.add('actionable');
  }
  for (const [sid] of app.optionMap.byServer) {
    const el = document.querySelector(`[data-server="${sid}"]`);
    if (el) el.classList.add('actionable');
  }

  renderLog(g, viewer, els.log);
  renderCallout(app, els.callout);
  renderPrompt(app, els.prompt);
}

export { cardPanelHtml };
