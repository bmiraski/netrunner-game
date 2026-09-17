// "My stats" panel (Phase 8, hosted): lists this account's past games from
// Supabase. Pure rendering, same split as reviewpanel.js/logtext.js.
import { escapeHtml } from './cardtext.js';

const CAP = s => (s === 'corp' ? 'Corp' : s === 'runner' ? 'Runner' : 'Watch');

function fmtDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

export function statsHtml(games, { error } = {}) {
  const body = error
    ? `<div class="rv-empty">Couldn't load your stats: ${escapeHtml(error.message ?? String(error))}</div>`
    : !games.length
      ? '<div class="rv-empty">No games recorded yet — play one, then check back.</div>'
      : statsTable(games);
  return `
    <div class="review-head">
      <div class="review-title">MY STATS</div>
      <div class="review-sub">${games.length} game${games.length === 1 ? '' : 's'} recorded</div>
      <button class="btn review-close">Close</button>
    </div>
    <div class="review-body">${body}</div>`;
}

function statsTable(games) {
  const wins = games.filter(g => g.winner === g.side).length;
  const decided = games.filter(g => g.side === 'corp' || g.side === 'runner').length;
  const summary = decided
    ? `<div class="rv-empty">Win rate: ${wins}/${decided} (${Math.round(100 * wins / decided)}%)</div>`
    : '';
  const rows = games.map(g => `
    <tr>
      <td class="rv-turn">${escapeHtml(fmtDate(g.played_at))}</td>
      <td>${CAP(g.side)}</td>
      <td>${escapeHtml(g.corp_deck ?? '—')}</td>
      <td>${escapeHtml(g.runner_deck ?? '—')}</td>
      <td class="${g.winner === g.side ? 'rv-good' : 'rv-bad'}">${g.winner ? `${CAP(g.winner)} won` : 'in progress'}${g.reason ? ` (${escapeHtml(g.reason)})` : ''}</td>
      <td class="rv-num">T${g.turns ?? '?'}</td>
    </tr>`).join('');
  return `${summary}<table class="rv-table"><thead><tr>
      <th>Date</th><th>You played</th><th>Corp deck</th><th>Runner deck</th><th>Result</th><th>Turns</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}
