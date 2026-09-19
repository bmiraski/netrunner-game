// Preconstructed decks for AI play (Phase 4).
//
// Seven single-core decks — one per faction — built for competent heuristic-AI
// play: straightforward economy, full breaker coverage, ice spreads across
// barrier/code gate/sentry, and agenda suites drawn only from the identity's
// faction plus neutrals. Copy counts respect a single Revised Core box
// (min(quantity, deckLimit)) and every deck stays within 15 influence.
//
// Phase 9: Datasucker (20009), Pheromones (20031), and Test Run (20042) were
// previously excluded as incompletely implemented (see docs/CARD_COVERAGE.md
// history) — now fixed and added to their native-faction decks below (0
// influence cost each), swapped in for a Crypsis/Rabbit Hole copy apiece to
// keep each deck at its identity's minimum size.
//
// Genesis Cycle enrichment: each deck below had 3-5 weaker/narrower cards
// swapped for same-faction Genesis Cycle tech that clearly strengthens its
// stated plan (all swaps are in-faction, so influence totals are unchanged
// from pre-Genesis; agenda-point swaps are exact-point-for-exact-point so
// each corp deck's agenda math is unchanged too). See docs/CARD_COVERAGE.md
// for what each new card does.

export const DECKS = {
  corp: [
    {
      key: 'hb-core',
      name: 'HB: Bioroid Glacier',
      identity: '20061', // Haas-Bioroid: Stronger Together
      side: 'corp',
      description: 'Tax the Runner with cheap bioroid and neutral ice, bank credits off Adonis/PAD/Melange, and score 3-cost agendas behind layered servers (Biotic Labor closes games from hand).',
      cards: [
        // Agendas (9 cards, 20 points). Genesis: 1 Project Vitruvius -> Mandatory
        // Upgrades (both 2pts/HB) — a permanent +1 click each turn is excellent
        // tempo for a glacier deck that needs clicks to rez/advance behind its wall.
        { code: '20062', qty: 2 }, // Project Ares
        { code: '20063', qty: 2 }, // Project Vitruvius
        { code: '02011', qty: 1 }, // Mandatory Upgrades
        { code: '20125', qty: 2 }, // Priority Requisition
        { code: '20126', qty: 2 }, // Private Security Force
        // Ice (17: 4 barrier / 7 code gate / 6 sentry)
        { code: '20066', qty: 1 }, // Heimdall 1.0
        { code: '20067', qty: 1 }, // Hudson 1.0
        { code: '20068', qty: 2 }, // Ichi 1.0
        { code: '20069', qty: 2 }, // Rototurret
        { code: '20070', qty: 3 }, // Viktor 1.0
        { code: '20129', qty: 3 }, // Enigma
        { code: '20131', qty: 3 }, // Wall of Static
        { code: '20130', qty: 2 }, // Hunter
        // Operations (8)
        { code: '20132', qty: 3 }, // Hedge Fund
        { code: '20073', qty: 3 }, // Green Level Clearance
        { code: '20072', qty: 2 }, // Biotic Labor
        // Assets (9). Genesis: Melange Mining Corp. -> Eve Campaign (click-free
        // drip economy) and Aggressive Secretary -> Encryption Protocol (taxes
        // every trash cost, including its own — fits the layered-server plan).
        { code: '20064', qty: 3 }, // Adonis Campaign
        { code: '20128', qty: 3 }, // PAD Campaign
        { code: '02092', qty: 2 }, // Eve Campaign
        { code: '02029', qty: 1 }, // Encryption Protocol
        // Upgrades (2)
        { code: '20075', qty: 1 }, // Ash 2X3ZB9CY
        { code: '02111', qty: 1 }, // Ruhr Valley (extra click to run its server)
      ],
    },
    {
      key: 'weyland-core',
      name: 'Weyland: Big Walls, Big Money',
      identity: '20077', // Weyland Consortium: Building a Better World
      side: 'corp',
      description: 'Out-money the Runner with transaction economy, wall off centrals with cheap-to-huge barriers plus Archer, and score advanceable agendas from a heavily iced remote.',
      cards: [
        // Agendas (9 cards, 20 points)
        { code: '20078', qty: 1 }, // Hostile Takeover
        { code: '20079', qty: 3 }, // Project Atlas
        { code: '20080', qty: 1 }, // The Cleaners
        { code: '20125', qty: 2 }, // Priority Requisition
        { code: '20126', qty: 2 }, // Private Security Force
        // Ice (17: 8 barrier / 3 code gate / 6 sentry). Genesis: Hive -> Tyrant
        // (advanceable barrier, gains "end the run" per hosted advancement
        // counter) — a stronger, more literal "big wall" than Hive's bad-pub-
        // scaling strength.
        { code: '20088', qty: 2 }, // Ice Wall
        { code: '02078', qty: 2 }, // Tyrant
        { code: '20086', qty: 1 }, // Hadrian's Wall
        { code: '20131', qty: 3 }, // Wall of Static
        { code: '20084', qty: 1 }, // Archer
        { code: '20085', qty: 2 }, // Caduceus
        { code: '20089', qty: 2 }, // Shadow
        { code: '20130', qty: 1 }, // Hunter
        { code: '20129', qty: 3 }, // Enigma
        // Operations (9)
        { code: '20132', qty: 3 }, // Hedge Fund
        { code: '20090', qty: 3 }, // Beanstalk Royalties
        { code: '20092', qty: 2 }, // Shipment from Kaguya
        { code: '20091', qty: 1 }, // Punitive Counterstrike
        // Assets (8). Genesis: 1 GRNDL Refinery -> Amazon Industrial Zone,
        // moved below to Upgrades (free/discounted rez on newly-installed
        // ice in its server).
        { code: '20128', qty: 3 }, // PAD Campaign
        { code: '20127', qty: 2 }, // Melange Mining Corp.
        { code: '20083', qty: 2 }, // GRNDL Refinery
        { code: '20081', qty: 1 }, // Dedicated Response Team
        // Upgrades (2). Genesis: Elizabeth Mills -> Simone Diego, whose
        // recurring credits advance cards in/protecting this server — direct
        // synergy with the new Tyrant copies above.
        { code: '02099', qty: 1 }, // Simone Diego
        { code: '02038', qty: 1 }, // Amazon Industrial Zone
      ],
    },
    {
      key: 'jinteki-core',
      name: 'Jinteki: Nets and Needles',
      identity: '20093', // Jinteki: Personal Evolution
      side: 'corp',
      description: 'Punish every access with Personal Evolution net damage, ambush assets, and AP ice; grind the Runner down and score behind taxing barriers and Nisei counters.',
      cards: [
        // Agendas (10 cards, 21 points). Genesis: 1 Braintrust -> Fetal AI
        // (both 2pts/Jinteki) — a much sharper fit for a net-damage deck: 2
        // net damage on access unless from Archives, plus a 2cr steal tax.
        { code: '20094', qty: 2 }, // Braintrust
        { code: '02032', qty: 1 }, // Fetal AI
        { code: '20095', qty: 2 }, // Nisei MK II
        { code: '20125', qty: 2 }, // Priority Requisition
        { code: '20126', qty: 2 }, // Private Security Force
        { code: '20124', qty: 1 }, // False Lead
        // Ice (16: 6 barrier / 4 code gate / 5 sentry / 1 trap). Genesis: 1
        // Himitsu-Bako -> Sensei (grants every other approached ice a bonus
        // "end the run" sub for the run — strong support for this 16-piece
        // wall) and 1 Wall of Static -> Snowflake (a Jinteki-flavored psi ETR).
        { code: '20099', qty: 2 }, // Himitsu-Bako
        { code: '02034', qty: 1 }, // Sensei
        { code: '20102', qty: 1 }, // Wall of Thorns
        { code: '20131', qty: 1 }, // Wall of Static
        { code: '02015', qty: 1 }, // Snowflake
        { code: '20104', qty: 1 }, // Yagura
        { code: '20129', qty: 3 }, // Enigma
        { code: '20100', qty: 1 }, // Neural Katana
        { code: '20101', qty: 2 }, // Swordsman
        { code: '20130', qty: 2 }, // Hunter
        { code: '20103', qty: 1 }, // Whirlpool
        // Operations (8)
        { code: '20132', qty: 3 }, // Hedge Fund
        { code: '20105', qty: 3 }, // Celebrity Gift
        { code: '20106', qty: 2 }, // Neural EMP
        // Assets (10). Genesis: Ronin -> Edge of World — another ambush that
        // fits the net-damage plan (corp may pay 3cr per ice on the server
        // for 1 core damage each, no advancement setup needed).
        { code: '20098', qty: 2 }, // Snare!
        { code: '20096', qty: 2 }, // Project Junebug
        { code: '02053', qty: 1 }, // Edge of World
        { code: '20128', qty: 3 }, // PAD Campaign
        { code: '20127', qty: 2 }, // Melange Mining Corp.
        // Upgrades (1)
        { code: '20108', qty: 1 }, // Hokusai Grid
      ],
    },
    {
      key: 'nbn-core',
      name: 'NBN: Tag and Tax',
      identity: '20109', // NBN: Making News
      side: 'corp',
      description: 'Lean on cheap taxing ice and trace power to land tags, punish with Closed Accounts and Private Security Force, and score a dense agenda suite quickly.',
      cards: [
        // Agendas (11 cards, 20 points)
        { code: '20110', qty: 3 }, // Project Beale
        { code: '20111', qty: 3 }, // TGTBT
        { code: '20125', qty: 2 }, // Priority Requisition
        { code: '20126', qty: 2 }, // Private Security Force
        { code: '20124', qty: 1 }, // False Lead
        // Ice (17: 5 barrier / 8 code gate / 4 sentry). Genesis: 1 Hunter ->
        // Uroboros (sentry, double trace4: no more runs this turn + end the
        // run) — a stronger taxing trace piece matching the deck's plan.
        { code: '20117', qty: 2 }, // Wraparound
        { code: '20131', qty: 3 }, // Wall of Static
        { code: '20115', qty: 3 }, // Pop-up Window
        { code: '20116', qty: 2 }, // Tollbooth
        { code: '20129', qty: 3 }, // Enigma
        { code: '20113', qty: 2 }, // Data Raven
        { code: '20130', qty: 1 }, // Hunter
        { code: '02074', qty: 1 }, // Uroboros
        // Operations (10)
        { code: '20132', qty: 3 }, // Hedge Fund
        { code: '20090', qty: 3 }, // Beanstalk Royalties (Weyland, 1 inf each)
        { code: '20121', qty: 2 }, // SEA Source
        { code: '20119', qty: 2 }, // Closed Accounts
        // Assets (5). Genesis: Ghost Branch -> Net Police, whose recurring
        // credits (equal to the Runner's link) fund every trace above.
        { code: '20128', qty: 3 }, // PAD Campaign
        { code: '20127', qty: 1 }, // Melange Mining Corp.
        { code: '02075', qty: 1 }, // Net Police
        // Upgrades (2). Genesis: adds ChiLo City Grid alongside Bernice Mai —
        // a successful trace during a run on its server hands out a tag,
        // reinforcing the whole tag-and-trace plan.
        { code: '20123', qty: 1 }, // Bernice Mai
        { code: '02036', qty: 1 }, // ChiLo City Grid
      ],
    },
  ],
  runner: [
    {
      key: 'reina-core',
      name: 'Reina: Rig and Pressure',
      identity: '20001', // Reina Roja: Freedom Fighter
      side: 'runner',
      description: 'Make every rez expensive with Reina, Xanadu and Ice Carver, build the Morning Star / Force of Nature / Mimic rig on strong resource economy, and hammer weakened servers.',
      cards: [
        // Events (13)
        { code: '20056', qty: 3 }, // Sure Gamble
        { code: '20038', qty: 2 }, // Diesel (Shaper, 2 inf each)
        { code: '20020', qty: 3 }, // Easy Mark (Criminal, 1 inf each)
        { code: '20055', qty: 2 }, // Infiltration
        { code: '20005', qty: 1 }, // Stimhack
        { code: '20003', qty: 2 }, // Retrieval Run
        // Hardware (7)
        { code: '20007', qty: 2 }, // Spinal Modem
        { code: '20006', qty: 2 }, // Cyberfeeder
        { code: '20057', qty: 3 }, // Dyson Mem Chip
        // Programs (12). Genesis: Demolition Run -> Nerve Agent, a virus
        // program whose HQ pressure and bonus-access fit "hammer weakened
        // servers" better than Demolition Run's narrow combo case.
        { code: '20014', qty: 2 }, // Morning Star
        { code: '20010', qty: 3 }, // Force of Nature
        { code: '20013', qty: 3 }, // Mimic
        { code: '20009', qty: 2 }, // Datasucker (swapped in for Crypsis, Phase 9)
        { code: '20011', qty: 1 }, // Imp
        { code: '02041', qty: 1 }, // Nerve Agent
        // Resources (13). Genesis: both Scrubber copies -> Surge — directly
        // synergizes with Datasucker/Nerve Agent above (2 more virus counters
        // on any program that already gained one this turn).
        { code: '20016', qty: 3 }, // Liberated Account
        { code: '20059', qty: 3 }, // Armitage Codebusting
        { code: '20060', qty: 2 }, // Underworld Contact
        { code: '20015', qty: 1 }, // Ice Carver
        { code: '20018', qty: 1 }, // Xanadu
        { code: '02081', qty: 2 }, // Surge
        { code: '20036', qty: 1 }, // Mr. Li (Criminal, 2 inf)
      ],
    },
    {
      key: 'gabe-core',
      name: 'Gabe: Central Pressure',
      identity: '20019', // Gabriel Santiago: Consummate Professional
      side: 'runner',
      description: 'Run HQ early and often for Gabriel credits, using cheap criminal breakers, Sneakdoor Beta and Inside Job to slip through, backed by Bank Job and Easy Mark economy.',
      cards: [
        // Events (16). Genesis: Special Order (tutor a breaker) is dropped —
        // the breaker suite below is already deep and redundant; the credits
        // it would've spent tutoring go to e3 Feedback Implants instead.
        { code: '20056', qty: 3 }, // Sure Gamble
        { code: '20020', qty: 3 }, // Easy Mark
        { code: '20023', qty: 2 }, // Inside Job
        { code: '20021', qty: 2 }, // Emergency Shutdown
        { code: '20022', qty: 2 }, // Forged Activation Orders
        { code: '20055', qty: 2 }, // Infiltration
        { code: '20038', qty: 2 }, // Diesel (Shaper, 2 inf each)
        // Hardware (9). Genesis: e3 Feedback Implants pairs directly with
        // Aurora/Peacock/Faerie below — every one of them pays credits per
        // subroutine broken, so e3's "pay 1cr, break 1 more" chains cheaply.
        // Muresh Bodysuit is meat-damage tech (Dedicated Response Team,
        // Punitive Counterstrike, and Weyland's whole plan in this project).
        { code: '20025', qty: 2 }, // Doppelgänger
        { code: '20057', qty: 3 }, // Dyson Mem Chip
        { code: '20026', qty: 1 }, // HQ Interface
        { code: '02024', qty: 2 }, // e3 Feedback Implants
        { code: '02044', qty: 1 }, // Muresh Bodysuit
        // Programs (12)
        { code: '20027', qty: 3 }, // Aurora
        { code: '20030', qty: 3 }, // Peacock
        { code: '20028', qty: 3 }, // Faerie
        { code: '20029', qty: 1 }, // Femme Fatale
        { code: '20032', qty: 1 }, // Sneakdoor Beta
        { code: '20031', qty: 1 }, // Pheromones (swapped in for a Crypsis copy, Phase 9)
        // Resources (8)
        { code: '20033', qty: 2 }, // Bank Job
        { code: '20059', qty: 3 }, // Armitage Codebusting
        { code: '20036', qty: 1 }, // Mr. Li
        { code: '20034', qty: 2 }, // Crash Space
      ],
    },
    {
      key: 'ct-core',
      name: 'Chaos Theory: Big Rig Speed',
      identity: '20037', // Chaos Theory: Wünderkind
      side: 'runner',
      description: 'Use the 40-card deck and 5 MU to assemble Battering Ram / Gordian Blade / Pipeline fast (Modded and Diesel accelerate), fund runs with Magnum Opus, and dig with The Maker’s Eye.',
      cards: [
        // Events (16). Genesis: 1 Infiltration -> Quality Time (draw 5) — a
        // burst of cards to help assemble the rig even faster.
        { code: '20056', qty: 3 }, // Sure Gamble
        { code: '20038', qty: 2 }, // Diesel
        { code: '20040', qty: 3 }, // Modded
        { code: '20043', qty: 1 }, // The Maker's Eye
        { code: '20055', qty: 1 }, // Infiltration
        { code: '02087', qty: 1 }, // Quality Time
        { code: '20020', qty: 3 }, // Easy Mark (Criminal, 1 inf each)
        { code: '20042', qty: 2 }, // Test Run (swapped in for Crypsis + a Rabbit Hole copy, Phase 9)
        // Hardware (9). Genesis: R&D Interface directly amplifies the deck's
        // own stated Maker's Eye dig plan (now 3 cards/run on R&D); Replicator
        // fetches a second copy of any installed hardware from the stack,
        // improving consistency of this hardware-dense rig.
        { code: '20045', qty: 2 }, // Dinosaurus
        { code: '20057', qty: 3 }, // Dyson Mem Chip
        { code: '20047', qty: 1 }, // The Personal Touch
        { code: '20046', qty: 1 }, // Rabbit Hole
        { code: '02107', qty: 1 }, // R&D Interface
        { code: '02088', qty: 1 }, // Replicator
        // Programs (12)
        { code: '20048', qty: 3 }, // Battering Ram
        { code: '20049', qty: 3 }, // Gordian Blade
        { code: '20051', qty: 3 }, // Pipeline
        { code: '20029', qty: 1 }, // Femme Fatale (Criminal, 1 inf)
        { code: '20050', qty: 2 }, // Magnum Opus
        // Resources (3)
        { code: '20059', qty: 3 }, // Armitage Codebusting
      ],
    },
  ],
};

const ALL = [...DECKS.corp, ...DECKS.runner];

export function deckByKey(key) {
  const deck = ALL.find(d => d.key === key);
  if (!deck) throw new Error(`unknown deck key ${key}`);
  return deck;
}

// Build a Game config (engine/game.js) from a corp deck key and a runner deck key.
export function gameConfig(corpKey, runnerKey, seed = 1) {
  const corp = deckByKey(corpKey);
  const runner = deckByKey(runnerKey);
  if (corp.side !== 'corp') throw new Error(`${corpKey} is not a corp deck`);
  if (runner.side !== 'runner') throw new Error(`${runnerKey} is not a runner deck`);
  return {
    seed,
    corp: { identity: corp.identity, cards: corp.cards.map(c => ({ ...c })) },
    runner: { identity: runner.identity, cards: runner.cards.map(c => ({ ...c })) },
  };
}
