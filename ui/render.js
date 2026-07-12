// Board renderer: full repaint from game state, perspective-filtered.
// The UI is a decision renderer (ENGINE.md): everything here is read-only;
// clicks dispatch decision option ids back through app.answer(id).
import { memoryUsed, memoryLimit, handSize } from '../engine/state.js';
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
  const el = h(`<div class="tile ${ice ? 'tile-ice' : ''} ${facedown ? 'tile-facedown' : ''}"
       data-inst="${it.id}" style="--fc:${color}">
    <div class="tile-title">${shown ? escapeHtml(card.title) : (ice ? 'ICE' : 'CARD')}</div>
    ${shown ? `<div class="tile-stats">${escapeHtml(statLine(card))}</div>` : ''}
    ${badges(it, shown)}
  </div>`);
  if (ice && !it.rezzed) el.classList.add('tile-unrezzed');
  el.addEventListener('click', (e) => { e.stopPropagation(); app.onCardClick(it.id, el, shown ? card : null); });
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
function corpBar(g) {
  const c = g.state.corp;
  const idCard = g.insts[c.identity].card;
  return h(`<div class="side-bar corp-bar" style="--fc:${factionColor(idCard.faction)}">
    <span class="id-name" data-inst="${c.identity}">${escapeHtml(idCard.title)}</span>
    <span class="stat">&#x2B21;<i>c</i> ${c.credits}</span>
    <span class="stat">&#x25F4; ${c.clicks}</span>
    <span class="stat">Agenda pts: ${c.agendaPoints}</span>
    ${c.badPublicity ? `<span class="stat stat-bad">BP ${c.badPublicity}</span>` : ''}
  </div>`);
}

function runnerBar(g) {
  const r = g.state.runner;
  const idCard = g.insts[r.identity].card;
  const mu = `${memoryUsed(g)}/${memoryLimit(g)}`;
  return h(`<div class="side-bar runner-bar" style="--fc:${factionColor(idCard.faction)}">
    <span class="id-name" data-inst="${r.identity}">${escapeHtml(idCard.title)}</span>
    <span class="stat">&#x2B21;<i>c</i> ${r.credits}</span>
    <span class="stat">&#x25F4; ${r.clicks}</span>
    <span class="stat">&mu; ${mu}</span>
    <span class="stat">Link ${r.baseLink}</span>
    <span class="stat">Agenda pts: ${r.agendaPoints}</span>
    ${r.tags ? `<span class="stat stat-bad">Tags ${r.tags}</span>` : ''}
    ${r.brainDamage ? `<span class="stat stat-bad">Brain ${r.brainDamage}</span>` : ''}
    <span class="stat">Stack ${r.deck.length} · Heap ${r.discard.length}</span>
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

// --- run banner ---------------------------------------------------------------
function runBanner(g) {
  const run = g.state.run;
  if (!run || run.ended) return null;
  let phase = '';
  const events = g.log.events;
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.type === 'run-start' || ev.type === 'run-end') break;
    if (ev.type === 'encounter-ice') { phase = `encountering ${ev.data.title}`; break; }
    if (ev.type === 'approach-ice') { phase = `approaching ${ev.data.rezzed ? ev.data.title : 'unrezzed ice'}`; break; }
    if (ev.type === 'approach-server') { phase = 'approaching the server'; break; }
  }
  return h(`<div class="run-banner">RUN on ${escapeHtml(serverName(run.server))}${phase ? ' — ' + escapeHtml(phase) : ''}${run.successful ? ' — SUCCESSFUL' : ''}</div>`);
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
    promptEl.appendChild(h(`<div class="prompt-head">Waiting for ${d.player}…</div>`));
    return;
  }
  promptEl.appendChild(h(`<div class="prompt-side">${d.player.toUpperCase()} decision</div>`));
  promptEl.appendChild(h(`<div class="prompt-head">${escapeHtml(d.prompt)}</div>`));
  if (d.kind === 'number') {
    const row = h(`<div class="num-row"><input type="number" min="${d.min}" max="${d.max}" value="${d.min}" class="num-input"><button class="btn btn-primary">OK</button></div>`);
    const input = row.querySelector('input');
    row.querySelector('button').addEventListener('click', () => app.answer(Number(input.value)));
    promptEl.appendChild(row);
    input.focus();
    return;
  }
  for (const o of d.options) {
    const b = h(`<button class="btn opt-btn">${escapeHtml(o.label)}</button>`);
    b.addEventListener('click', () => app.answer(o.id));
    promptEl.appendChild(b);
  }
}

// --- top-level render ---------------------------------------------------------------
export function render(app) {
  const { game, viewer, els } = app;
  const g = game.g;
  app.optionMap = buildOptionMap(
    game.decision && (viewer === 'all' || game.decision.player === viewer) ? game.decision : null);

  // corp zone
  els.corpZone.innerHTML = '';
  els.corpZone.appendChild(corpBar(g));
  const serversRow = h('<div class="servers-row"></div>');
  const sids = Object.keys(g.state.corp.servers);
  const remotes = sids.filter(s => s.startsWith('remote'));
  for (const sid of [...remotes, 'archives', 'rd', 'hq']) {
    serversRow.appendChild(serverBox(app, g, sid, viewer));
  }
  els.corpZone.appendChild(serversRow);
  if (viewer === 'corp' || viewer === 'all') els.corpZone.appendChild(handRow(app, g, 'corp', viewer, 'HQ'));

  // middle: run banner
  els.midZone.innerHTML = '';
  const rb = runBanner(g);
  if (rb) els.midZone.appendChild(rb);

  // runner zone
  els.runnerZone.innerHTML = '';
  els.runnerZone.appendChild(runnerBar(g));
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
  renderPrompt(app, els.prompt);
}

export { cardPanelHtml };
