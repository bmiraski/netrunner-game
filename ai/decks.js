// Preconstructed decks for AI play (Phase 4).
//
// Seven single-core decks — one per faction — built for competent heuristic-AI
// play: straightforward economy, full breaker coverage, ice spreads across
// barrier/code gate/sentry, and agenda suites drawn only from the identity's
// faction plus neutrals. Copy counts respect a single Revised Core box
// (min(quantity, deckLimit)) and every deck stays within 15 influence.
//
// Banned (incompletely implemented in this engine, never included here):
// 20009 Datasucker, 20031 Pheromones, 20042 Test Run.

export const DECKS = {
  corp: [
    {
      key: 'hb-core',
      name: 'HB: Bioroid Glacier',
      identity: '20061', // Haas-Bioroid: Stronger Together
      side: 'corp',
      description: 'Tax the Runner with cheap bioroid and neutral ice, bank credits off Adonis/PAD/Melange, and score 3-cost agendas behind layered servers (Biotic Labor closes games from hand).',
      cards: [
        // Agendas (9 cards, 20 points)
        { code: '20062', qty: 2 }, // Project Ares
        { code: '20063', qty: 3 }, // Project Vitruvius
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
        // Operations (9)
        { code: '20132', qty: 3 }, // Hedge Fund
        { code: '20073', qty: 3 }, // Green Level Clearance
        { code: '20072', qty: 2 }, // Biotic Labor
        { code: '20071', qty: 1 }, // Archived Memories
        // Assets (9)
        { code: '20064', qty: 3 }, // Adonis Campaign
        { code: '20128', qty: 3 }, // PAD Campaign
        { code: '20127', qty: 2 }, // Melange Mining Corp.
        { code: '20065', qty: 1 }, // Aggressive Secretary
        // Upgrades (1)
        { code: '20075', qty: 1 }, // Ash 2X3ZB9CY
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
        // Ice (17: 8 barrier / 3 code gate / 6 sentry)
        { code: '20088', qty: 2 }, // Ice Wall
        { code: '20087', qty: 2 }, // Hive
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
        // Assets (10)
        { code: '20128', qty: 3 }, // PAD Campaign
        { code: '20127', qty: 2 }, // Melange Mining Corp.
        { code: '20083', qty: 3 }, // GRNDL Refinery
        { code: '20081', qty: 1 }, // Dedicated Response Team
        { code: '20082', qty: 1 }, // Elizabeth Mills
      ],
    },
    {
      key: 'jinteki-core',
      name: 'Jinteki: Nets and Needles',
      identity: '20093', // Jinteki: Personal Evolution
      side: 'corp',
      description: 'Punish every access with Personal Evolution net damage, ambush assets, and AP ice; grind the Runner down and score behind taxing barriers and Nisei counters.',
      cards: [
        // Agendas (10 cards, 21 points)
        { code: '20094', qty: 3 }, // Braintrust
        { code: '20095', qty: 2 }, // Nisei MK II
        { code: '20125', qty: 2 }, // Priority Requisition
        { code: '20126', qty: 2 }, // Private Security Force
        { code: '20124', qty: 1 }, // False Lead
        // Ice (16: 6 barrier / 4 code gate / 5 sentry / 1 trap)
        { code: '20099', qty: 3 }, // Himitsu-Bako
        { code: '20102', qty: 1 }, // Wall of Thorns
        { code: '20131', qty: 2 }, // Wall of Static
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
        // Assets (10)
        { code: '20098', qty: 2 }, // Snare!
        { code: '20096', qty: 2 }, // Project Junebug
        { code: '20097', qty: 1 }, // Ronin
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
        // Ice (17: 5 barrier / 8 code gate / 4 sentry)
        { code: '20117', qty: 2 }, // Wraparound
        { code: '20131', qty: 3 }, // Wall of Static
        { code: '20115', qty: 3 }, // Pop-up Window
        { code: '20116', qty: 2 }, // Tollbooth
        { code: '20129', qty: 3 }, // Enigma
        { code: '20113', qty: 2 }, // Data Raven
        { code: '20130', qty: 2 }, // Hunter
        // Operations (10)
        { code: '20132', qty: 3 }, // Hedge Fund
        { code: '20090', qty: 3 }, // Beanstalk Royalties (Weyland, 1 inf each)
        { code: '20121', qty: 2 }, // SEA Source
        { code: '20119', qty: 2 }, // Closed Accounts
        // Assets (6)
        { code: '20128', qty: 3 }, // PAD Campaign
        { code: '20127', qty: 2 }, // Melange Mining Corp.
        { code: '20112', qty: 1 }, // Ghost Branch
        // Upgrades (1)
        { code: '20123', qty: 1 }, // Bernice Mai
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
        // Events (14)
        { code: '20056', qty: 3 }, // Sure Gamble
        { code: '20038', qty: 2 }, // Diesel (Shaper, 2 inf each)
        { code: '20020', qty: 3 }, // Easy Mark (Criminal, 1 inf each)
        { code: '20055', qty: 2 }, // Infiltration
        { code: '20005', qty: 1 }, // Stimhack
        { code: '20003', qty: 2 }, // Retrieval Run
        { code: '20002', qty: 1 }, // Demolition Run
        // Hardware (7)
        { code: '20007', qty: 2 }, // Spinal Modem
        { code: '20006', qty: 2 }, // Cyberfeeder
        { code: '20057', qty: 3 }, // Dyson Mem Chip
        // Programs (11)
        { code: '20014', qty: 2 }, // Morning Star
        { code: '20010', qty: 3 }, // Force of Nature
        { code: '20013', qty: 3 }, // Mimic
        { code: '20058', qty: 2 }, // Crypsis
        { code: '20011', qty: 1 }, // Imp
        // Resources (13)
        { code: '20016', qty: 3 }, // Liberated Account
        { code: '20059', qty: 3 }, // Armitage Codebusting
        { code: '20060', qty: 2 }, // Underworld Contact
        { code: '20015', qty: 1 }, // Ice Carver
        { code: '20018', qty: 1 }, // Xanadu
        { code: '20017', qty: 2 }, // Scrubber
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
        // Events (17)
        { code: '20056', qty: 3 }, // Sure Gamble
        { code: '20020', qty: 3 }, // Easy Mark
        { code: '20023', qty: 2 }, // Inside Job
        { code: '20024', qty: 1 }, // Special Order
        { code: '20021', qty: 2 }, // Emergency Shutdown
        { code: '20022', qty: 2 }, // Forged Activation Orders
        { code: '20055', qty: 2 }, // Infiltration
        { code: '20038', qty: 2 }, // Diesel (Shaper, 2 inf each)
        // Hardware (6)
        { code: '20025', qty: 2 }, // Doppelgänger
        { code: '20057', qty: 3 }, // Dyson Mem Chip
        { code: '20026', qty: 1 }, // HQ Interface
        // Programs (13)
        { code: '20027', qty: 3 }, // Aurora
        { code: '20030', qty: 3 }, // Peacock
        { code: '20028', qty: 3 }, // Faerie
        { code: '20029', qty: 1 }, // Femme Fatale
        { code: '20032', qty: 1 }, // Sneakdoor Beta
        { code: '20058', qty: 2 }, // Crypsis
        // Resources (9)
        { code: '20033', qty: 2 }, // Bank Job
        { code: '20059', qty: 3 }, // Armitage Codebusting
        { code: '20036', qty: 1 }, // Mr. Li
        { code: '20034', qty: 2 }, // Crash Space
        { code: '20035', qty: 1 }, // Fall Guy
      ],
    },
    {
      key: 'ct-core',
      name: 'Chaos Theory: Big Rig Speed',
      identity: '20037', // Chaos Theory: Wünderkind
      side: 'runner',
      description: 'Use the 40-card deck and 5 MU to assemble Battering Ram / Gordian Blade / Pipeline fast (Modded and Diesel accelerate), fund runs with Magnum Opus, and dig with The Maker’s Eye.',
      cards: [
        // Events (14)
        { code: '20056', qty: 3 }, // Sure Gamble
        { code: '20038', qty: 2 }, // Diesel
        { code: '20040', qty: 3 }, // Modded
        { code: '20043', qty: 1 }, // The Maker's Eye
        { code: '20055', qty: 2 }, // Infiltration
        { code: '20020', qty: 3 }, // Easy Mark (Criminal, 1 inf each)
        // Hardware (8)
        { code: '20045', qty: 2 }, // Dinosaurus
        { code: '20057', qty: 3 }, // Dyson Mem Chip
        { code: '20047', qty: 1 }, // The Personal Touch
        { code: '20046', qty: 2 }, // Rabbit Hole
        // Programs (13)
        { code: '20048', qty: 3 }, // Battering Ram
        { code: '20049', qty: 3 }, // Gordian Blade
        { code: '20051', qty: 3 }, // Pipeline
        { code: '20029', qty: 1 }, // Femme Fatale (Criminal, 1 inf)
        { code: '20050', qty: 2 }, // Magnum Opus
        { code: '20058', qty: 1 }, // Crypsis
        // Resources (5)
        { code: '20059', qty: 3 }, // Armitage Codebusting
        { code: '20054', qty: 1 }, // Sacrificial Construct
        { code: '20053', qty: 1 }, // All-nighter
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
