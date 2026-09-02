// The two things a player reported: the warm-up circling the neck, and the
// party standing still while the DM narrated them walking off. Both are the
// kind of bug that passes every existing assertion, so they get their own.
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
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
await page.route('**/arcana-dm*/**', r => r.abort());     // no DM needed; we drive the actions
await page.goto('http://localhost:8080/');
await page.waitForFunction(() => window.arcana);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.arcana);
await page.click('#intro-type');

let pass = 0, fail = 0;
const ck = (label, ok, extra = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? '✓' : '✗ FAIL'} ${label}${extra ? '  ' + extra : ''}`); };

console.log('— the warm-up spans the body —');
for (const [plan, want] of [['90s', 6], ['3min', 12]]) {
  const r = await page.evaluate(async p => {
    const out = await window.arcana.call('start_warmup', { plan: p });
    window.arcana.finishWarmup({ early: true });
    return out;
  }, plan);
  const names = r.order || [];
  ck(`${plan}: ${want} stretches`, names.length === want, names.length + '');
  const necks = names.filter(n => /^Neck/.test(n)).length;
  ck(`${plan}: not a neck routine`, necks <= 1, `${necks} neck stretches`);
  ck(`${plan}: reaches the legs`, names.some(n => /Quad|Hamstring|Calf|Ankle/.test(n)), names.join(' · '));
  const split = names.filter(n => n.includes(' · ')).filter(n => {
    const base = n.split(' · ')[0];
    return names.filter(m => m.startsWith(base + ' · ')).length !== 2;
  });
  ck(`${plan}: no side left cold`, split.length === 0, split.join(','));
}

// Walking the whole plan must never show the same stretch twice.
const walked = await page.evaluate(async () => {
  await window.arcana.call('start_warmup', { plan: '90s' });
  const seen = [];
  for (let i = 0; i < 6; i++) { seen.push(window.arcana.currentStretch().name); window.arcana.skipStretch(); }
  window.arcana.finishWarmup({ early: true });
  return seen;
});
ck('walking the plan never repeats a stretch', new Set(walked).size === walked.length, walked.join(' · '));

console.log('— the party actually moves —');
const before = await page.evaluate(async () => (await window.arcana.call('get_board_state')).tokens
  .filter(t => t.kind === 'pc').map(t => `${t.name}@${t.x},${t.y}`));
const moved = await page.evaluate(() => window.arcana.call('move_party', { x: 16, y: 10 }));
const after = await page.evaluate(async () => (await window.arcana.call('get_board_state')).tokens
  .filter(t => t.kind === 'pc').map(t => ({ name: t.name, x: t.x, y: t.y })));
ck('move_party is a registered tool', !moved.error, JSON.stringify(moved).slice(0, 90));
ck('every hero moved', after.every((t, i) => `${t.name}@${t.x},${t.y}` !== before[i]), JSON.stringify(after));
ck('the leader is on the requested cell', after.some(t => t.x === 16 && t.y === 10));
ck('the party stays together', after.every(t =>
  Math.max(Math.abs(t.x - 16), Math.abs(t.y - 10)) <= 2), JSON.stringify(after));
ck('nobody is stacked on anyone', new Set(after.map(t => `${t.x},${t.y}`)).size === after.length);
const fog = await page.evaluate(() => window.__st.revealed.length);
ck('the fog lifted at the destination', await page.evaluate(() =>
  window.__st.revealed.includes('16,10')), `${fog} cells revealed`);

// Walking lights the corridor, not just the two ends of it. A gap in the
// middle of a walked path reads as a rendering bug.
const gaps = await page.evaluate(() => {
  window.__st.revealed = [];
  window.arcana.call('move_party', { x: 2, y: 2 });
  const before = window.__st.tokens.find(t => t.kind === 'pc');
  const from = { x: before.x, y: before.y };
  window.__st.revealed = [];
  return window.arcana.call('move_party', { x: 18, y: 12 }).then(() => {
    const to = { x: 18, y: 12 };
    const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
    const dark = [];
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(from.x + ((to.x - from.x) * i) / steps);
      const y = Math.round(from.y + ((to.y - from.y) * i) / steps);
      if (!window.__st.revealed.includes(`${x},${y}`)) dark.push(`${x},${y}`);
    }
    return { dark, from, to, lit: window.__st.revealed.length };
  });
});
ck('every cell along a walk is lit, with no dark middle', gaps.dark.length === 0,
   gaps.dark.length ? `dark: ${gaps.dark.join(' ')}` : `${gaps.lit} cells lit from (${gaps.from.x},${gaps.from.y}) to (${gaps.to.x},${gaps.to.y})`);
const wall = await page.evaluate(() => window.arcana.call('move_party', { x: 0, y: 0 }));
ck('a wall is refused, with a usable message', !!wall.error, wall.error || '');

console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); srv.close();
process.exit(fail ? 1 : 0);
