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
// The table now opens with the warm-up card already up (the pre-recorded opening); clear it like a player would.
await page.waitForSelector('#warm-offer:not([hidden])', { timeout: 3000 }).catch(() => {});
if (await page.isVisible('#warm-offer-no').catch(() => false)) { await page.click('#warm-offer-no'); await page.waitForTimeout(150); }
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

console.log('— in a fight, a click is one square —');
// "Clicking on the screen should not move people while the fight is going on,
// except for one step." Out of combat a click is travel; in combat it is one
// square toward where you pointed, for whoever's turn it is — and on a
// monster's turn, nobody.
await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  const b = window.__st.tokens.find(t => t.name === 'Brannok'), m = window.__st.tokens.find(t => t.name === 'Mira');
  b.x = 5; b.y = 6; m.x = 4; m.y = 6;
  window.__st.tokens = window.__st.tokens.filter(t => t.id !== 'mon-drowned-guard');   // (7,7) is on the diagonal we step along
  A.addToken({ name: 'Blocker', kind: 'monster', art: 'goblin', x: 14, y: 6, hp: 500 });
  A.startCombat({});
  // Force Brannok to the top of the order for a deterministic check.
  window.__st.combat.order = [b.id, m.id, ...window.__st.combat.order.filter(id => id !== b.id && id !== m.id)];
  window.__st.combat.turnIndex = 0;
});
const farClick = await page.evaluate(() => window.arcana.walkTo(12, 6));
const bAfter = await page.evaluate(() => { const b = window.__st.tokens.find(t => t.name === 'Brannok'); return { x: b.x, y: b.y }; });
ck('a click seven squares away moves the active hero ONE square', bAfter.x === 6 && bAfter.y === 6, `${JSON.stringify(bAfter)} · ${JSON.stringify(farClick).slice(0, 80)}`);
ck('and reports it as a step toward the click', farClick.step === true && farClick.toward?.x === 12);
const mAfter = await page.evaluate(() => { const m = window.__st.tokens.find(t => t.name === 'Mira'); return { x: m.x, y: m.y }; });
ck('the rest of the party did not come along', mAfter.x === 4 && mAfter.y === 6, JSON.stringify(mAfter));
// "While engaging in a fight there is a window where I click and the people
// move when they shouldn't." One step is one step A TURN, not one per click.
const again = await page.evaluate(() => window.arcana.walkTo(12, 6));
const bAgain = await page.evaluate(() => { const b = window.__st.tokens.find(t => t.name === 'Brannok'); return { x: b.x, y: b.y }; });
ck('a second click in the same turn moves nobody', !!again.error && bAgain.x === 6 && bAgain.y === 6, again.error || JSON.stringify(bAgain));
ck('and says the step is spent', /already stepped/i.test(again.error || ''), again.error || '');
ck('the cursor says so too', (await page.evaluate(() => window.arcana.stepRefusal()))?.spent === true);
// Next round: the step is back.
await page.evaluate(() => { window.__st.combat.round++; });
const diag = await page.evaluate(() => window.arcana.walkTo(9, 9));
const bDiag = await page.evaluate(() => { const b = window.__st.tokens.find(t => t.name === 'Brannok'); return { x: b.x, y: b.y }; });
ck('next round, a diagonal click steps diagonally', bDiag.x === 7 && bDiag.y === 7, JSON.stringify(bDiag));
// The windows: dice still in the air, and the DM mid-round.
await page.evaluate(async () => { window.__st.combat.round++; (await import('/js/actions.js')).rollDice({ formula: 'd20', reason: 'test' }); });
const inAir = await page.evaluate(() => window.arcana.walkTo(12, 6));
ck('while the dice are in the air a click moves nobody', !!inAir.error && /dice/i.test(inAir.error), inAir.error || 'moved');
await page.evaluate(() => { window.__st.dice.t -= 10000; });                 // the roll landed a while ago
await page.evaluate(() => window.arcana.setDmResolving(true));
const midRound = await page.evaluate(() => window.arcana.walkTo(12, 6));
ck('while the DM is resolving the round a click moves nobody', !!midRound.error && /resolving/i.test(midRound.error), midRound.error || 'moved');
await page.evaluate(() => window.arcana.setDmResolving(false));
// A swing spends the turn: no stepping away afterwards.
await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  const b = window.__st.tokens.find(t => t.name === 'Brannok');
  const g = A.addToken({ name: 'Nearby', kind: 'monster', art: 'goblin', x: b.x + 1, y: b.y, hp: 500 }).token;
  A.attack({ attackerId: b.id, targetId: g.id, kind: 'melee' });
  window.__st.dice.t -= 10000;
});
const afterSwing = await page.evaluate(() => window.arcana.walkTo(3, 3));
ck('after a swing the turn is spent — a click moves nobody', !!afterSwing.error && /swung/i.test(afterSwing.error), afterSwing.error || 'moved');
await page.evaluate(() => { window.__st.tokens = window.__st.tokens.filter(t => t.name !== 'Nearby'); window.__st.combat.order = window.__st.combat.order.filter(id => window.__st.tokens.some(t => t.id === id)); window.__st.combat.turnIndex = 0; });
// Dragging in a fight answers to the same rules: one step, on your turn.
await page.evaluate(() => { window.__st.combat.round++; });
// The earlier clicks nudged the (aborted) DM; let that settle so the only rule in play is the drag's.
await page.waitForTimeout(900);                                   // the 700ms nudge fires…
await page.waitForFunction(() => !window.arcana.stepRefusal(), null, { timeout: 5000 }).catch(() => {});   // …and the aborted call settles
const bNow = await page.evaluate(() => { const b = window.__st.tokens.find(t => t.name === 'Brannok'); return { x: b.x, y: b.y }; });
const dropCell = await page.evaluate(async (b) => {          // an open floor cell well to the right of him
  const S = await import('/js/state.js');
  for (let dx = 5; dx >= 3; dx--) for (const dy of [0, -1, 1]) if (S.isWalkable(b.x + dx, b.y + dy)) return { x: b.x + dx, y: b.y + dy };
  return null;
}, bNow);
const dFrom = await cellPoint(bNow.x, bNow.y), dTo = await cellPoint(dropCell.x, dropCell.y);
await page.mouse.move(dFrom.x, dFrom.y); await page.mouse.down();
await page.mouse.move(dTo.x, dTo.y, { steps: 8 }); await page.mouse.up();
await page.waitForTimeout(300);
const bDragged = await page.evaluate(() => { const b = window.__st.tokens.find(t => t.name === 'Brannok'); return { x: b.x, y: b.y }; });
const dragDist = Math.max(Math.abs(bDragged.x - bNow.x), Math.abs(bDragged.y - bNow.y));
ck('dragging a hero five squares mid-fight moves him ONE', dragDist === 1 && bDragged.x === bNow.x + 1, `${JSON.stringify(bNow)} → ${JSON.stringify(bDragged)} (dropped at ${JSON.stringify(dropCell)})`);
// A monster's turn: the click does nothing to anyone.
await page.evaluate(() => { const o = window.__st.combat.order; window.__st.combat.turnIndex = o.findIndex(id => window.__st.tokens.find(t => t.id === id)?.kind === 'monster'); });
const pcsBefore = await page.evaluate(() => window.__st.tokens.filter(t => t.kind === "pc").map(t => `${t.x},${t.y}`).join("|"));
const notYours = await page.evaluate(() => window.arcana.walkTo(3, 3));
const pcsAfter = await page.evaluate(() => window.__st.tokens.filter(t => t.kind === "pc").map(t => `${t.x},${t.y}`).join("|"));
ck("on a monster's turn a click moves nobody", !!notYours.error && pcsBefore === pcsAfter, notYours.error || '');
ck('and it says whose turn it is', /turn/i.test(notYours.error || ''));
await page.evaluate(async () => (await import('/js/actions.js')).endCombat());
const travel = await page.evaluate(() => window.arcana.walkTo(10, 6));
const bTravel = await page.evaluate(() => { const b = window.__st.tokens.find(t => t.name === 'Brannok'); return { x: b.x, y: b.y }; });
ck('out of the fight, a click is travel again', !travel.error && !travel.step && Math.abs(bTravel.x - 10) <= 1 && Math.abs(bTravel.y - 6) <= 1, JSON.stringify(bTravel));
await page.evaluate(() => { window.__st.tokens = window.__st.tokens.filter(t => t.name !== 'Blocker'); });

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
