// Card text rendering: NRDB markup -> styled HTML, faction styling, card DOM.
// Markup tokens in card.text: [credit] [click] [subroutine] [trash] [mu]
// [recurring-credit] [link], plus <strong>. Everything else is escaped.

export const FACTION = {
  anarch:            { name: 'Anarch',   color: '#ff5c35' },
  criminal:          { name: 'Criminal', color: '#4f9eff' },
  shaper:            { name: 'Shaper',   color: '#6ee06e' },
  'haas-bioroid':    { name: 'Haas-Bioroid', color: '#b57edc' },
  jinteki:           { name: 'Jinteki',  color: '#ff4d6d' },
  nbn:               { name: 'NBN',      color: '#ffd23f' },
  'weyland-consortium': { name: 'Weyland', color: '#3ecfa3' },
  neutral:           { name: 'Neutral',  color: '#9aa5b1' },
  'neutral-corp':    { name: 'Neutral',  color: '#9aa5b1' },
  'neutral-runner':  { name: 'Neutral',  color: '#9aa5b1' },
};

export function factionColor(faction) {
  return (FACTION[faction] ?? FACTION.neutral).color;
}

const SYMBOLS = {
  '[credit]':          '<span class="sym sym-credit" title="credit">&#x2B21;<i>c</i></span>',
  '[click]':           '<span class="sym sym-click" title="click">&#x25F4;</span>',
  '[subroutine]':      '<span class="sym sym-sub" title="subroutine">&#x21B3;</span>',
  '[trash]':           '<span class="sym sym-trash" title="trash">&#x2926;</span>',
  '[mu]':              '<span class="sym sym-mu" title="memory unit">&mu;</span>',
  '[recurring-credit]':'<span class="sym sym-credit" title="recurring credit">&#x2B21;<i>c</i>&#x21BA;</span>',
  '[link]':            '<span class="sym sym-link" title="link">&#x2934;</span>',
};

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// card.text -> safe HTML with symbol spans, <strong> preserved, newlines -> <br>
export function markupToHtml(text) {
  if (!text) return '';
  let h = escapeHtml(text);
  h = h.replace(/&lt;(\/?)strong&gt;/g, '<$1strong>');
  for (const [tok, html] of Object.entries(SYMBOLS)) {
    h = h.split(tok).join(html);
  }
  return h.replace(/\n/g, '<br>');
}

// Short one-line stat string for a card (for tiles/tooltips).
export function statLine(card) {
  const bits = [];
  if (card.cost != null) bits.push(`${card.cost}c`);
  if (card.advancementCost != null) bits.push(`adv ${card.advancementCost}`);
  if (card.agendaPoints != null) bits.push(`${card.agendaPoints} pts`);
  if (card.strength != null) bits.push(`str ${card.strength}`);
  if (card.memoryCost != null) bits.push(`${card.memoryCost} mu`);
  if (card.trashCost != null) bits.push(`trash ${card.trashCost}`);
  return bits.join(' · ');
}

// Full card panel HTML (inspector).
export function cardPanelHtml(card) {
  const color = factionColor(card.faction);
  const sub = card.subtypes?.length ? card.subtypes.join(' - ') : '';
  return `
  <div class="card-full" style="--fc:${color}">
    <div class="cf-title">${escapeHtml(card.title)}${card.uniqueness ? ' &#x25C6;' : ''}</div>
    <div class="cf-typeline">${escapeHtml(card.type)}${sub ? ': ' + escapeHtml(sub) : ''}
      <span class="cf-faction">${escapeHtml((FACTION[card.faction] ?? FACTION.neutral).name)}</span></div>
    <div class="cf-stats">${escapeHtml(statLine(card))}</div>
    <div class="cf-text">${markupToHtml(card.text)}</div>
    ${card.flavor ? `<div class="cf-flavor">${escapeHtml(card.flavor)}</div>` : ''}
  </div>`;
}
