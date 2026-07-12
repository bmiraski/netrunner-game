// Headless smoke test of the BUNDLED UI (netrunner.html) via jsdom:
// loads the file, starts a game from the setup screen, then plays the human
// seat to completion by clicking rendered prompt buttons. Asserts the board
// renders, decisions flow, and the game reaches game-over without errors.
//
// Usage: node tools/ui-smoke.js [sidesCsv] [seed]
//   needs jsdom resolvable (npm install jsdom, or NODE_PATH to an install)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

// jsdom from local node_modules, or JSDOM_DIR=/path/to/dir-containing-node_modules
const require_ = createRequire(process.env.JSDOM_DIR
  ? join(process.env.JSDOM_DIR, 'x.js') : import.meta.url);
const { JSDOM } = require_('jsdom');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'netrunner.html'), 'utf8');
const sides = (process.argv[2] ?? 'runner,corp,watch').split(',');
const seed = Number(process.argv[3] ?? 21);

// deterministic option picker: mostly first option, sometimes second —
// biased toward progress (keep/continue are listed first)
function makePick(s) {
  let x = s;
  return (n) => {
    x = (x * 1103515245 + 12345) % 2 ** 31;
    return n > 1 && x % 5 === 0 ? 1 : 0;
  };
}

async function runSide(side) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  const errors = [];
  window.addEventListener('error', e => errors.push(e.error ?? e.message));
  await new Promise(r => setTimeout(r, 50));           // let init() settle
  const $ = sel => window.document.querySelector(sel);
  const $$ = sel => [...window.document.querySelectorAll(sel)];

  if (!$('#btn-start')) throw new Error(`${side}: setup screen missing`);
  const radio = $$(`input[name=side]`).find(r => r.value === side);
  radio.checked = true;
  $('#inp-seed').value = String(seed);
  $('#btn-start').click();

  if ($('#table').style.display === 'none') throw new Error(`${side}: table not shown`);
  if (!$$('.server').length) throw new Error(`${side}: no servers rendered`);

  const pick = makePick(seed * 17 + 3);
  let clicks = 0;
  const CAP = 8000;
  while (clicks < CAP) {
    if ($$('.log-over').length) break;                 // game over reached
    if (side === 'watch') {
      $('#btn-step25').click();
      clicks++;
      continue;
    }
    const numOk = $('.num-row button');
    if (numOk) { numOk.click(); clicks++; continue; }
    const opts = $$('#prompt .opt-btn');
    if (!opts.length) throw new Error(`${side}: no options rendered and game not over (click ${clicks})`);
    opts[Math.min(pick(opts.length), opts.length - 1)].click();
    clicks++;
  }
  if (errors.length) throw new Error(`${side}: ${errors.length} page errors, first: ${errors[0]?.stack ?? errors[0]}`);
  if (!$$('.log-over').length) throw new Error(`${side}: game did not finish in ${CAP} interactions`);
  if (!$('#inspector .card-full')) throw new Error(`${side}: auto-inspect never populated the card details panel`);
  const logLines = $$('.log-line').length;
  const over = $$('.log-over')[0].textContent;
  console.log(`  ok  ${side.padEnd(6)} — finished after ${clicks} interactions, ${logLines} log lines: ${over.slice(0, 70)}`);
  window.close();
}

for (const side of sides) await runSide(side);
console.log('ui-smoke: all sides passed');
