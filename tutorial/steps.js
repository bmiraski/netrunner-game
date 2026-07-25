// Tutorial script (Phase 6). Authored against the REAL replay of
// hb-core (Corp AI standard, seed TUTORIAL_SEED*7+1) vs gabe-core, seed 11 —
// see tests/tutorial.test.js, which replays the whole guided sequence and
// fails if an engine/AI change ever shifts it.
//
// Guided steps: while these are active, only the taught option can be chosen.
// Each step: {
//   match: { ctx?, promptIncludes? }   sanity check against the live decision
//   allow: { id? } or { labelIncludes? }  the one permitted option
//   title, text                        overlay callout (plain text)
// }
export const TUTORIAL_SEED = 11;
export const TUTORIAL_CORP_DECK = 'hb-core';
export const TUTORIAL_RUNNER_DECK = 'gabe-core';

export const GUIDED_STEPS = [
  {
    match: { ctx: 'setup' }, allow: { id: 'keep' },
    title: 'Welcome to Netrunner',
    text: 'You are the RUNNER (bottom), hacking the CORP (top). First to 7 agenda points wins — you steal agendas from corp servers, the corp scores them. This starting hand is strong: economy plus icebreakers. Keep it.',
  },
  {
    match: { ctx: 'actionMenu' }, allow: { labelIncludes: 'Sure Gamble' },
    title: 'Clicks & credits',
    text: 'Each turn you get 4 clicks (the gold ◴ pips) to spend on actions. Credits pay for everything. Start with economy: Sure Gamble costs 5 credits and pays back 9 — a 4-credit profit for one click. Play it.',
  },
  {
    match: { ctx: 'actionMenu' }, allow: { labelIncludes: 'Peacock' },
    title: 'Install an icebreaker',
    text: 'The corp defends servers with ICE. Icebreakers are programs that get you through. Peacock breaks CODE GATES. Programs cost memory (μ) — you have 4 MU. Install Peacock (3 credits).',
  },
  {
    match: { ctx: 'actionMenu' }, allow: { id: 'draw' },
    title: 'Draw cards',
    text: 'A click can draw a card from your stack. Card advantage keeps your options open — and cards in hand also absorb damage. Draw one now.',
  },
  {
    match: { ctx: 'actionMenu' }, allow: { id: 'credit' },
    title: 'Click for a credit',
    text: 'The most basic action: one click for one credit. Fine when you have nothing better. Take the credit — that is your last click, so your turn will end (you discard down to 5 cards at end of turn if over).',
  },
  {
    match: { ctx: 'actionMenu' }, allow: { id: 'run:remote1' },
    title: 'Your first run',
    text: 'The corp built REMOTE 1 and rezzed Adonis Campaign there — it pays them 3 credits every turn. The server has NO ice protecting it. Running an undefended server is free money: click Run on remote1.',
  },
  {
    match: { ctx: 'runStep', promptIncludes: 'Jack out' }, allow: { id: 'continue' },
    title: 'Jack out?',
    text: 'At the edge of any server — even one with no ice — you may jack out instead of finishing the run. Jacking out ends the run immediately with no access. Nothing here threatens you: continue.',
  },
  {
    match: { ctx: 'runStep', promptIncludes: 'Adonis' }, allow: { id: 'trash' },
    title: 'Access & trash',
    text: 'A successful run lets you ACCESS the cards there. Many corp cards show a trash cost — pay it to bin them. Trash Adonis for 3 credits, or it pays the corp 9 more over the next turns.',
  },
  {
    match: { ctx: 'actionMenu' }, allow: { id: 'run:rd' },
    title: 'Run on R&D',
    text: 'Central servers: HQ (their hand), R&D (their deck), Archives (their discard). Running R&D lets you see — and steal — the top of their deck. There is one unrezzed ice there; the corp may pay to rez it as you approach. Run R&D.',
  },
  {
    match: { ctx: 'runStep', promptIncludes: 'Viktor' }, allow: { id: 'clickbreak' },
    title: 'Ice: break or suffer',
    text: 'The corp rezzed Viktor 1.0 — subroutines shown in the run panel fire unless broken. Peacock is too weak here without boosting (+3 strength for 2 credits), and you are low on credits. But Viktor is a BIOROID: you may spend a click to break a subroutine. Click through "Do 1 core damage".',
  },
  {
    match: { ctx: 'runStep', promptIncludes: 'Viktor' }, allow: { id: 'clickbreak' },
    title: 'Break the other one',
    text: '"End the run" would stop you cold. Spend your last click to break it too. (You could also jack out on a later approach — retreating is often right when the math is bad.)',
  },
  {
    match: { ctx: 'runStep', promptIncludes: 'Viktor' }, allow: { id: 'continue' },
    title: 'All subroutines broken',
    text: 'Every subroutine is green in the run panel — the ice cannot hurt you now. Continue into the server and access the top card of R&D.',
  },
  {
    match: { ctx: 'runStep', promptIncludes: 'Jack out' }, allow: { id: 'continue' },
    title: 'One more chance to bail',
    text: 'Every run offers a last jack-out right at the server, even after the ice is beaten. You already paid the cost to get here — continue in and access.',
  },
  {
    match: { ctx: 'actionMenu' }, allow: null,   // free play begins
    title: 'You stole an agenda!',
    text: 'Project Ares was on top of R&D — accessed agendas are stolen automatically. That is how you win. From here the game is yours: watch corp credits, trash their economy, and run where they are weakest. Use the HINT button any time for a suggestion.',
  },
];

// One-time callouts fired by log events (any time, guided or free play).
export const EVENT_CALLOUTS = {
  'agenda-scored': {
    title: 'The corp scored an agenda',
    text: 'The corp advanced an agenda in a remote server and scored it. Watch for cards they install AND advance behind ice — steal them before they finish, or make the server too expensive to defend.',
  },
  'tags-added': {
    title: 'You are TAGGED',
    text: 'While tagged, the corp can trash your resources and play brutal tagged-only cards. Clearing a tag costs 1 click + 2 credits — usually do it immediately.',
  },
  'damage': {
    title: 'Damage!',
    text: 'Damage makes you discard random cards from your grip. If you cannot discard enough, you are FLATLINED and lose. Keep cards in hand against damage-heavy corps.',
  },
  'trace-start': {
    title: 'Trace initiated',
    text: 'A trace pits the corp’s trace strength (they can boost with credits) against your LINK plus credits you spend. Beating it exactly is often cheap — or let it land if the consequence is mild.',
  },
  'run-ends-sub': {
    title: 'The run was stopped',
    text: 'An unbroken "End the run" subroutine ended your run. No access this time — build up credits or the right breaker and try again.',
  },
  'virus-purged': {
    title: 'Virus purge',
    text: 'The corp spent a full turn removing all virus counters. Purging costs them tempo — your virus programs forced it.',
  },
};
