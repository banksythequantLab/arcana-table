// The DM Panel claims to be the live WebMCP registry rather than a rack of
// hand-wired buttons. That claim is only worth making if it is checked: the
// list must come from document.modelContext, grow and shrink with it, and its
// forms must run through executeTool and land in the same Agent Log.
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' };
const srv = createServer(async (q, s) => {
  const p = q.url === '/' ? '/index.html' : q.url.split('?')[0];
  try { s.writeHead(200, { 'content-type': MIME[extname(p)] || 'text/plain' });
        s.end(await readFile(join(root, p))); } catch { s.writeHead(404); s.end(); }
});
await new Promise(r => srv.listen(8080, r));

const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.route('**/arcana-dm*/**', r => r.abort());
await page.goto('http://localhost:8080/');
await page.waitForFunction(() => window.arcana);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.arcana);
await page.click('#intro-type');
// The table now opens with the warm-up card already up (the pre-recorded opening); clear it like a player would.
await page.waitForSelector('#warm-offer:not([hidden])', { timeout: 3000 }).catch(() => {});
if (await page.isVisible('#warm-offer-no').catch(() => false)) { await page.click('#warm-offer-no'); await page.waitForTimeout(150); }
await page.click('.tab[data-pane="pane-dm"]');
await page.waitForSelector('.mcp-tool');

let pass = 0, fail = 0;
const ck = (l, ok, x = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? '✓' : '✗ FAIL'} ${l}${x ? '  ' + x : ''}`); };

const rows = () => page.$$eval('.mcp-tool', ds => ds.map(d => d.dataset.tool));
const registry = () => page.evaluate(async () =>
  (await (document.modelContext || navigator.modelContext).getTools()).map(t => t.name));

const shown = await rows(), live = await registry();
ck('the panel lists exactly the live registry', JSON.stringify(shown) === JSON.stringify(live),
   `${shown.length} shown / ${live.length} live`);
ck('read-only tools are marked as such', await page.$$eval('.mcp-tool.ro', d => d.length) >= 3,
   await page.$$eval('.mcp-tool.ro', ds => ds.map(d => d.dataset.tool).join(',')));
// textContent, not innerText: a collapsed <details> renders nothing.
ck('every tool carries its description', await page.$$eval('.mcp-tool .mcp-desc',
  ds => ds.length > 0 && ds.every(d => d.textContent.trim().length > 30)));

// A tool with no arguments should say so, not show an empty form.
await page.click('.mcp-tool[data-tool="get_board_state"] > summary');
ck('a no-argument tool says so', await page.isVisible('.mcp-tool[data-tool="get_board_state"] .mcp-none'));

// Run it, and check the result is the real board.
await page.click('.mcp-tool[data-tool="get_board_state"] .mcp-run');
await page.waitForFunction(() =>
  !/^running/.test(document.querySelector('.mcp-tool[data-tool="get_board_state"] .mcp-out').textContent));
const out = await page.innerText('.mcp-tool[data-tool="get_board_state"] .mcp-out');
ck('running it returns the real board', out.includes('Brannok'), out.slice(0, 60).replace(/\s+/g, ' '));
ck('a successful run is marked good', await page.isVisible('.mcp-tool[data-tool="get_board_state"] .mcp-out.good'));

// A schema-built form: roll_dice takes a formula string.
await page.click('.mcp-tool[data-tool="roll_dice"] > summary');
const fields = await page.$$eval('.mcp-tool[data-tool="roll_dice"] .mcp-field .mcp-fk', ks => ks.map(k => k.textContent));
ck('the form is built from the schema', fields.some(f => f.startsWith('formula')), fields.join(','));
await page.fill('.mcp-tool[data-tool="roll_dice"] [data-k="formula"]', '3d6');
await page.click('.mcp-tool[data-tool="roll_dice"] .mcp-run');
await page.waitForFunction(() =>
  /total/.test(document.querySelector('.mcp-tool[data-tool="roll_dice"] .mcp-out').textContent));
const roll = JSON.parse(await page.innerText('.mcp-tool[data-tool="roll_dice"] .mcp-out'));
ck('the argument reached the tool', roll.rolls?.length === 3, JSON.stringify(roll.rolls));

// It must go through the SAME door the DM uses — so it must be logged.
const logged = await page.$$eval('#agent-log .acall code', cs => cs.map(c => c.textContent));
ck('the call landed in the Agent Log', logged.includes('roll_dice'), logged.join(','));

// An error must be shown, not swallowed.
await page.fill('.mcp-tool[data-tool="roll_dice"] [data-k="formula"]', 'not-dice');
await page.click('.mcp-tool[data-tool="roll_dice"] .mcp-run');
await page.waitForSelector('.mcp-tool[data-tool="roll_dice"] .mcp-out.bad');
ck('a tool error is shown, not swallowed',
   (await page.innerText('.mcp-tool[data-tool="roll_dice"] .mcp-out')).toLowerCase().includes('parse'));

// The registry is dynamic — the panel must follow it.
const before = (await rows()).length;
await page.evaluate(() => window.arcana.call('start_combat', {}));
// The three combat tools register one at a time and BOTH sides grow as they
// land — so "the panel has more rows than before" is true after the first of
// three, and reading the panel and the registry in two separate calls compares
// two different instants. Wait for all three to be there, then read both in one
// evaluate so the comparison is of a single moment.
await page.waitForFunction(() => {
  const shown = [...document.querySelectorAll('.mcp-tool')].map(d => d.dataset.tool);
  return ['advance_turn', 'update_hp', 'apply_condition'].every(n => shown.includes(n));
}, null, { timeout: 5000 });
const snap = await page.evaluate(async () => ({
  panel: [...document.querySelectorAll('.mcp-tool')].map(d => d.dataset.tool),
  live: (await (document.modelContext || navigator.modelContext).getTools()).map(t => t.name),
}));
const during = snap.panel;
ck('combat tools appear in the panel', during.includes('advance_turn'), `${before} → ${during.length}`);
ck('the panel still matches the registry', JSON.stringify(snap.panel) === JSON.stringify(snap.live),
   `panel ${snap.panel.length} | registry ${snap.live.length}`);
await page.evaluate(() => window.arcana.call('end_combat', {}));
await page.waitForFunction(n => document.querySelectorAll('.mcp-tool').length === n, before);
ck('and they leave again when the fight ends', !(await rows()).includes('advance_turn'));

ck('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
// Settle the table first: a dice overlay dims the whole page, and the panel is
// scrolled to wherever the last assertion left it.
// Let the dice overlay finish before the screenshot; waiting on the element
// beats guessing at an animation length on a loaded machine.
await page.waitForFunction(() => {
  const o = document.getElementById('dice-overlay');
  return !o || o.hidden || !o.offsetParent;
}, null, { timeout: 8000 }).catch(() => {});
await page.evaluate(() => {
  document.getElementById('dice-overlay').hidden = true;
  document.querySelectorAll('.mcp-tool[open]').forEach(d => d.open = false);
  document.getElementById('pane-dm').scrollTop = 0;
});
await page.click('.mcp-tool[data-tool="propose_challenge"] > summary');
await page.waitForTimeout(150);
await page.screenshot({ path: 'screens/inspector.png' });
console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); srv.close();
process.exit(fail ? 1 : 0);
