// Clicking the map is the first thing every player tries; until now the only
// way to move anything was to drag a token, which nobody guesses. This also
// carries the board's first PIXEL check — a scope bug once made every monster
// vanish from the canvas and all 196 assertions still passed, because nothing
// asserted that the board actually drew anything.
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
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.route('**/arcana-dm*/**', r => r.abort());
await page.goto('http://localhost:8080/');
await page.waitForFunction(() => window.arcana);
await page.evaluate(() => localStorage.clear());
await page.reload(); await page.waitForFunction(() => window.arcana);
await page.click('#intro-type');
await page.waitForTimeout(400);

let pass = 0, fail = 0;
const ck = (l, ok, x = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? '✓' : '✗ FAIL'} ${l}${x ? '  ' + x : ''}`); };
const pcs = () => page.evaluate(() => window.__st.tokens.filter(t => t.kind === 'pc').map(t => `${t.name}@${t.x},${t.y}`));

// Where a grid cell actually is on screen, so we click the map like a player.
const cellPoint = (x, y) => page.evaluate(([x, y]) => {
  const c = document.getElementById('board').getBoundingClientRect();
  const cell = Math.min(c.width / 22, c.height / 14);
  const offX = (c.width - cell * 22) / 2, offY = (c.height - cell * 14) / 2;
  return { x: c.left + offX + (x + 0.5) * cell, y: c.top + offY + (y + 0.5) * cell };
}, [x, y]);

console.log('— clicking the floor walks the party there —');
const before = await pcs();
const p1 = await cellPoint(9, 5);
await page.mouse.click(p1.x, p1.y);
await page.waitForTimeout(500);
const after = await pcs();
ck('the party moved', JSON.stringify(after) !== JSON.stringify(before), after.join(' | '));
ck('the leader landed on the clicked cell', after.some(p => p.endsWith('@9,5')), after.join(' | '));
ck('the companion came too, beside them', after.length === 2 && !after[1].endsWith('@9,5'));
ck('the walk lit its path', await page.evaluate(() => window.__st.revealed.includes('9,5')));

console.log('— but not into a wall, and not while the table is waiting —');
const wall = await cellPoint(0, 0);
const held = await pcs();
await page.mouse.click(wall.x, wall.y);
await page.waitForTimeout(300);
ck('a wall is refused', JSON.stringify(await pcs()) === JSON.stringify(held));
await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  A.proposeChallenge({ mode: 'reps', exercise: 'push-ups', reps: 5, reason: 'x' });
});
const mid = await pcs();
const p2 = await cellPoint(14, 8);
await page.mouse.click(p2.x, p2.y);
await page.waitForTimeout(300);
ck('mid-challenge the board does not move under you', JSON.stringify(await pcs()) === JSON.stringify(mid));
await page.evaluate(async () => (await import('/js/actions.js')).declineChallenge());

console.log('— dragging a token still works —');
const from = await cellPoint(9, 5), to = await cellPoint(11, 6);
await page.mouse.move(from.x, from.y); await page.mouse.down();
await page.mouse.move(to.x, to.y, { steps: 8 }); await page.mouse.up();
await page.waitForTimeout(400);
ck('a dragged hero lands where dropped', (await pcs()).some(p => p.endsWith('@11,6')), (await pcs()).join(' | '));

console.log('— the board is actually drawing (pixels, not state) —');
const ink = async () => page.evaluate(() => {
  const cv = document.getElementById('board');
  const c = cv.getContext('2d');
  const d = c.getImageData(0, 0, cv.width, cv.height).data;
  const seen = new Set();
  for (let i = 0; i < d.length; i += 4 * 97) seen.add(`${d[i]>>4},${d[i+1]>>4},${d[i+2]>>4}`);
  return seen.size;
});
const base = await ink();
ck('the canvas has real content, not one flat colour', base > 12, `${base} distinct colours sampled`);
await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  ['goblin','ogre','wraith','ooze'].forEach((a, i) =>
    A.addToken({ name: `M${i}`, kind: 'monster', art: a, x: 6 + i * 2, y: 9, hp: 8 }));
  for (let x = 0; x < 22; x++) for (let y = 0; y < 14; y++) A.revealArea({ x, y, radius: 1 });
});
await page.waitForTimeout(600);
const withMobs = await ink();
ck('spawning monsters changes what is on screen', withMobs > base, `${base} → ${withMobs}`);

ck('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); srv.close();
process.exit(fail ? 1 : 0);
