// Bundle the modular source into a single double-clickable netrunner.html.
// Usage: node tools/bundle.js  (esbuild via node_modules, or set ESBUILD=/path/to/esbuild)
// Output: netrunner.html at the repo root — cards.json, CSS, and all JS inlined.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function bundleJs() {
  const entry = join(root, 'ui', 'main.js');
  const args = [entry, '--bundle', '--format=iife', '--target=es2020', '--minify-syntax'];
  // Prefer local esbuild install; else ESBUILD env var
  let bin;
  try {
    readFileSync(join(root, 'node_modules', 'esbuild', 'package.json'));
    bin = join(root, 'node_modules', '.bin', 'esbuild');
  } catch {
    bin = process.env.ESBUILD;
    if (!bin) {
      console.error('esbuild not found: npm install, or set ESBUILD=/path/to/esbuild');
      process.exit(1);
    }
  }
  const r = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    console.error(r.stderr || r.error);
    process.exit(1);
  }
  return r.stdout;
}

const js = bundleJs();
const css = readFileSync(join(root, 'ui', 'style.css'), 'utf8');
const cards = readFileSync(join(root, 'data', 'cards.json'), 'utf8');
let html = readFileSync(join(root, 'ui', 'index.html'), 'utf8');

// </script> inside inlined JSON/JS would terminate the script tag early
const esc = s => s.replace(/<\/script/gi, '<\\/script');

html = html
  .replace('<link rel="stylesheet" href="./style.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="./main.js"></script>', () =>
    `<script>window.__CARDS__ = ${esc(cards)};</script>\n<script>\n${esc(js)}\n</script>`);

const out = join(root, 'netrunner.html');
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
