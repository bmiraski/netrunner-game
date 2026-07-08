// Minimal test runner: every *.test.js default-exports [[name, fn], ...]
import { readdirSync } from 'node:fs';

let pass = 0, fail = 0;
const dir = new URL('.', import.meta.url);
for (const f of readdirSync(dir).filter(f => f.endsWith('.test.js')).sort()) {
  const tests = (await import(new URL(f, dir))).default;
  console.log(`\n${f}`);
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`  ok    ${name}`);
      pass++;
    } catch (e) {
      console.error(`  FAIL  ${name}\n        ${e.message.split('\n')[0]}`);
      if (process.env.VERBOSE) console.error(e.stack);
      fail++;
    }
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
