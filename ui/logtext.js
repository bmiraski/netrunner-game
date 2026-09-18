// Event log -> human-readable text, perspective-safe.
// viewer: 'corp' | 'runner' | 'all' (watch mode sees everything).
// Returns {text, cls} or null to skip an event entirely.

const SERVER_NAMES = { hq: 'HQ', rd: 'R&D', archives: 'Archives' };
export const serverName = sid =>
  SERVER_NAMES[sid] ?? (sid ? sid.replace(/^remote(\d+)$/, 'Remote $1') : '?');

const who = p => (p === 'corp' ? 'Corp' : 'Runner');

export function eventText(ev, g, viewer) {
  const d = ev.data ?? {};
  const t = id => g.insts[id]?.card.title ?? `#${id}`;
  // corp hidden-info mask: runner (and runner-seat viewer) must not learn
  // identities of facedown corp cards from the log
  const corpHidden = viewer === 'runner';
  const m = {
    // --- turn structure ---
    'mulligan':       () => `${who(d.who)} takes a mulligan.`,
    'turn-start':     () => ({ text: `— ${who(d.who)} turn ${ev.turn} (${d.credits}cr) —`, cls: 'log-turn' }),
    'turn-end':       () => null,
    'clicks-gained':  () => `${who(d.who)} gains ${d.n} click${d.n === 1 ? '' : 's'} (${d.why}).`,
    'clicks-lost':    () => `${who(d.who)} loses ${d.n} click${d.n === 1 ? '' : 's'} (${d.why}).`,
    'click-lost':     () => `${who(d.who)} loses a click.`,
    // --- economy ---
    'credits-gained': () => `${who(d.who)} gains ${d.n}cr${d.why ? ` (${d.why})` : ''}.`,
    'credits-spent':  () => `${who(d.who)} spends ${d.n}cr${d.why ? ` (${d.why})` : ''}.`,
    'pool-credits-spent': () => `${d.used}cr from ${d.from} spent (${d.why}).`,
    'counters-loaded': () => `${t(d.id)} loaded with ${d.n} ${d.kind} counter${d.n === 1 ? '' : 's'}.`,
    'counters-added': () => `${t(d.id)}: ${d.n > 0 ? '+' : ''}${d.n} ${d.kind} counter${Math.abs(d.n) === 1 ? '' : 's'} (now ${d.total}).`,
    // --- installs / rez / plays ---
    'corp-installed': () => d.type === 'ice'
      ? `Corp installs ice protecting ${serverName(d.server)}.`
      : `Corp installs a card in ${serverName(d.server)}.`,
    'runner-installed': () => `Runner installs ${d.title}.`,
    'install-failed': () => `Install failed (${d.why}).`,
    'hosted':         () => `${t(d.id)} hosted on ${t(d.on)}.`,
    'card-returned-to-stack': () => `${d.title} is returned to the top of the stack.`,
    'card-rezzed':    () => `Corp rezzes ${d.title}.`,
    'ice-rezzed':     () => `Corp rezzes ${d.title}.`,
    'derezzed':       () => `${d.title} derezzed.`,
    'operation-played': () => `Corp plays ${d.title}.`,
    'event-played':   () => `Runner plays ${d.title}.`,
    'card-ability':   () => `${d.title}: ability used.`,
    'card-advanced':  () => {
      const it = g.insts[d.id];
      const name = (corpHidden && it && !it.faceup && !it.rezzed) ? 'a card' : t(d.id);
      return `Corp advances ${name} (${d.advancement}).`;
    },
    'advancement-moved': () => `${d.n} advancement moved from ${t(d.from)} to ${t(d.to)}.`,
    'tinkered':       () => `Tinkering rewrites ${t(d.iceId)}.`,
    'chimera-typed':  () => `Chimera becomes a ${d.type.replace('-', ' ')} until derezzed.`,
    'femme-target-chosen': () => `Femme Fatale targets ${t(d.iceId)}.`,
    'no-more-runs':   () => `Runner cannot make another run this turn.`,
    'card-peeked':    () => viewer === 'corp'
      ? `Runner looks at the top card of R&D.`
      : `Runner looks at the top card of R&D: ${d.title}.`,
    // --- runs / ice ---
    'run-start':      () => ({ text: `Runner runs ${serverName(d.server)}${d.bpCredits ? ` (+${d.bpCredits} BP credits)` : ''}.`, cls: 'log-run' }),
    'approach-ice':   () => `Approaching ${d.rezzed ? d.title : 'unrezzed ice'} (position ${d.position + 1}).`,
    'approach-server': () => `Approaching ${serverName(d.server)}.`,
    'encounter-ice':  () => ({ text: `Encountering ${d.title} (str ${d.strength}) — ${d.subs.length} sub${d.subs.length === 1 ? '' : 's'}.`, cls: 'log-run' }),
    'ice-passed':     () => `Ice passed.`,
    'ice-bypassed':   () => `${d.title} bypassed.`,
    'sub-broken':     () => `Broken${d.via === 'click' ? ' (click)' : ''}: "${d.sub}".`,
    'breaker-boosted': () => `${t(d.breakerId)} boosted to strength ${d.strength}.`,
    'subroutine-fires': () => ({ text: `Subroutine fires: "${d.sub}".`, cls: 'log-bad' }),
    'run-ends-sub':   () => ({ text: `The run ends${d.via ? ` (${d.via})` : ''}.`, cls: 'log-bad' }),
    'jack-out':       () => `Runner jacks out.`,
    'cannot-jack-out': () => `Runner cannot jack out.`,
    'server-changed': () => `Run redirected: ${serverName(d.from)} → ${serverName(d.to)}.`,
    'run-successful': () => ({ text: `Run on ${serverName(d.server)} is successful.`, cls: 'log-good' }),
    'run-end':        () => d.successful ? null : `Run on ${serverName(d.server)} ends unsuccessfully.`,
    'archer-rez-invalid': () => `Archer rez attempted without a scored agenda — invalid.`,
    // --- accesses / agendas ---
    'access-count':   () => `Accessing ${d.n} card${d.n === 1 ? '' : 's'} from ${serverName(d.server)}.`,
    'card-accessed':  () => `Accessed: ${d.title}.`,
    'access-limited': () => `Access limited to ${d.n}.`,
    'access-restricted': () => `Accesses restricted to ${t(d.to)}.`,
    'agenda-scored':  () => ({ text: `Corp scores ${d.title} (${d.points} pts, total ${d.total}).`, cls: 'log-score' }),
    'agenda-stolen':  () => ({ text: `Runner steals ${d.title} (${d.points} pts, total ${d.total}).`, cls: 'log-score' }),
    'agenda-forfeited': () => `${who(d.who)} forfeits ${d.title}.`,
    'steal-unaffordable': () => `Runner cannot afford to steal ${d.title}.`,
    'notoriety-scored': () => ({ text: `Runner scores ${d.title} (${d.points} pt, total ${d.total}).`, cls: 'log-score' }),
    // --- damage / tags / traces / bad pub ---
    'damage':         () => ({ text: `${d.n} ${d.type} damage (${d.why}).`, cls: 'log-bad' }),
    'damage-prevented': () => `${d.by} prevents damage (${d.remaining} remaining).`,
    'damage-card-lost': () => `Damage: ${t(d.id)} lost.`,
    'brain-damage':   () => ({ text: `Brain damage suffered (total ${d.total}).`, cls: 'log-bad' }),
    'tags-added':     () => ({ text: `Runner takes ${d.n} tag${d.n === 1 ? '' : 's'} (now ${d.total})${d.why ? ` — ${d.why}` : ''}.`, cls: 'log-bad' }),
    'tag-removed':    () => `Runner removes a tag (now ${d.total}).`,
    'trace-start':    () => `Trace ${d.base} initiated.`,
    'trace-result':   () => ({ text: `Trace ${d.success ? 'succeeds' : 'fails'} (strength ${d.ts} vs link ${d.link}).`, cls: d.success ? 'log-bad' : 'log-good' }),
    'psi-result':     () => ({ text: `Psi game${d.ctx ? ` (${d.ctx})` : ''}: Corp bet ${d.corp}cr, Runner bet ${d.runner}cr — ${d.same ? 'matched' : 'different'}.`, cls: d.same ? 'log-good' : 'log-bad' }),
    'bad-publicity':  () => d.n > 0
      ? `Corp takes ${d.n} bad publicity (now ${d.total})${d.why ? ` — ${d.why}` : ''}.`
      : `Corp removes ${-d.n} bad publicity (now ${d.total}).`,
    // --- game end ---
    'game-over':      () => ({ text: `GAME OVER — ${who(d.winner)} wins: ${d.reason}`, cls: 'log-over' }),
    // --- cards & decks ---
    'card-drawn':     () => `${who(d.who)} draws a card (${d.handSize} in hand).`,
    'card-trashed':   () => `${t(d.id)} trashed${d.why ? ` (${d.why})` : ''}.`,
    'trash-prevented': () => `${d.by} prevents ${d.saved} from being trashed.`,
    'card-discarded': () => d.who === 'corp' && corpHidden
      ? `Corp discards a card.`
      : `${who(d.who)} discards ${t(d.id)}.`,
    'card-to-hand':   () => `${d.title} added to hand (${d.why}).`,
    'card-revealed':  () => `${who(d.who)} reveals ${d.title} (${d.why}).`,
    'cards-revealed': () => `${who(d.who)} reveals: ${d.titles.join(', ')}.`,
    'card-moved':     () => `Card moved to ${d.to}.`,
    'exposed':        () => `${d.title} exposed.`,
    'virus-purged':   () => `Corp purges virus counters.`,
    'deck-shuffled':  () => `${who(d.who)} shuffles their deck.`,
    'deck-rearranged': () => `${who(d.who)} rearranges ${d.n} cards${d.zone ? ` (${d.zone})` : ''}.`,
    'search-whiffed': () => `Search finds nothing${d.why ? ` (${d.why})` : ''}.`,
  };
  const f = m[ev.type];
  if (!f) return { text: `${ev.type} ${JSON.stringify(d)}`, cls: 'log-unknown' };
  const r = f();
  if (r == null) return null;
  return typeof r === 'string' ? { text: r, cls: '' } : r;
}
