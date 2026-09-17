// Post-game review panel (Phase 7): renders analyzeGame()'s report as HTML.
// Pure rendering — no game logic here, same split as cardtext.js/logtext.js.
import { escapeHtml } from './cardtext.js';
import { serverName } from './logtext.js';

const CAP = s => (s === 'corp' ? 'Corp' : s === 'runner' ? 'Runner' : '');
const sevClass = sev => ({ good: 'rv-good', bad: 'rv-bad', info: 'rv-info' }[sev] ?? 'rv-info');

function findingsHtml(findings) {
  if (!findings.length) return '<div class="rv-empty">Nothing notable flagged this game.</div>';
  return findings.map(f => `
    <div class="rv-finding ${sevClass(f.severity)}">
      <span class="rv-turn">${f.turn != null ? `T${f.turn}` : '—'}</span>
      <span class="rv-text">${escapeHtml(f.text)}</span>
    </div>`).join('');
}

function scoringHtml(scoring) {
  if (!scoring.length) return '<div class="rv-empty">No agendas scored or stolen.</div>';
  return `<table class="rv-table"><tbody>${scoring.map(s => `
    <tr>
      <td class="rv-turn">T${s.turn}</td>
      <td class="${s.side === 'corp' ? 'rv-corp' : 'rv-runner'}">${CAP(s.side)}</td>
      <td>${escapeHtml(s.title)}</td>
      <td class="rv-num">+${s.points}</td>
      <td class="rv-num">(${s.total})</td>
    </tr>`).join('')}</tbody></table>`;
}

function economyHtml(economy, clicks) {
  const row = side => `
    <tr>
      <td class="${side === 'corp' ? 'rv-corp' : 'rv-runner'}">${CAP(side)}</td>
      <td class="rv-num">${economy[side].gained}cr</td>
      <td class="rv-num">${economy[side].spent}cr</td>
      <td class="rv-num">${economy[side].final}cr</td>
      <td class="rv-num">${clicks[side].creditClicks}</td>
    </tr>`;
  return `<table class="rv-table rv-econ">
    <thead><tr><th></th><th>Gained</th><th>Spent</th><th>Final</th><th>Credit-clicks</th></tr></thead>
    <tbody>${row('corp')}${row('runner')}</tbody>
  </table>`;
}

function runsHtml(runs) {
  if (!runs.length) return '<div class="rv-empty">No runs made.</div>';
  return `<table class="rv-table"><tbody>${runs.map(r => `
    <tr>
      <td class="rv-turn">T${r.turn}</td>
      <td>${escapeHtml(serverName(r.server))}</td>
      <td class="${r.successful ? 'rv-good' : 'rv-bad'}">${r.successful ? 'success' : 'no entry'}</td>
      <td class="rv-num">${r.cost}cr</td>
      <td class="rv-num">${r.accesses} access${r.accesses === 1 ? '' : 'es'}</td>
      <td class="rv-num">${r.agendaPoints ? `+${r.agendaPoints}pt` : ''}</td>
    </tr>`).join('')}</tbody></table>`;
}

function endgameHtml(endgame, damage) {
  const side = s => `
    <div class="rv-endcol">
      <div class="rv-endhead ${s === 'corp' ? 'rv-corp' : 'rv-runner'}">${CAP(s)}</div>
      <div>${endgame[s].credits}cr banked</div>
      <div>${endgame[s].handSize} card${endgame[s].handSize === 1 ? '' : 's'} in hand</div>
      <div>${endgame[s].agendaPoints} agenda pts</div>
      ${s === 'runner' ? `<div>${endgame.runner.tags} tag${endgame.runner.tags === 1 ? '' : 's'}, ${endgame.runner.brainDamage} brain dmg</div>` : `<div>${endgame.corp.badPublicity} bad pub</div>`}
    </div>`;
  const dmg = damage.events.length
    ? `<div class="rv-dmg">${damage.events.map(d => `T${d.turn}: ${d.n} ${d.type} dmg${d.why ? ` (${escapeHtml(d.why)})` : ''}`).join(' · ')}</div>`
    : '';
  return `<div class="rv-endrow">${side('corp')}${side('runner')}</div>${dmg}`;
}

export function reviewHtml(report) {
  const winnerLine = report.winner
    ? `${CAP(report.winner)} wins (${escapeHtml(report.reason ?? '')}) — ${report.turns} turn${report.turns === 1 ? '' : 's'}`
    : 'Game in progress';
  return `
    <div class="review-head">
      <div class="review-title">POST-GAME REVIEW</div>
      <div class="review-sub">${winnerLine}</div>
      <button class="btn review-close">Close</button>
    </div>
    <div class="review-body">
      <section class="rv-section">
        <h3>Findings</h3>
        ${findingsHtml(report.findings)}
      </section>
      <section class="rv-section">
        <h3>Scoring timeline</h3>
        ${scoringHtml(report.scoring)}
      </section>
      <section class="rv-section">
        <h3>Economy</h3>
        ${economyHtml(report.economy, report.clicks)}
      </section>
      <section class="rv-section">
        <h3>Runs</h3>
        ${runsHtml(report.runs)}
      </section>
      <section class="rv-section">
        <h3>End of game</h3>
        ${endgameHtml(report.endgame, report.damage)}
      </section>
    </div>`;
}
