// "They should be next to each other if they are swinging swords but far away
// can cast spells and use ranged weapons." Reach has to be a RULE the tool
// enforces, not a note in the prompt the model may skip — and you must be able
// to see what you are being asked to fight.
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

let pass = 0, fail = 0;
const ck = (l, ok, x = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? '✓' : '✗ FAIL'} ${l}${x ? '  ' + x : ''}`); };
const call = (n, a = {}) => page.evaluate(([n, a]) => window.arcana.call(n, a), [n, a]);
const put = (id, x, y) => page.evaluate(([id, x, y]) => {
  const t = window.__st.tokens.find(t => t.id === id || t.name === id); t.x = x; t.y = y;
}, [id, x, y]);

// A goblin far across the open floor.
await call('add_token', { name: 'Snaggle', kind: 'monster', art: 'goblin', x: 15, y: 6, hp: 7 });
await put('Brannok', 5, 6);
await put('Mira', 4, 6);

console.log('— a sword does not reach across the room —');
const far = await call('attack', { attackerId: 'Brannok', targetId: 'Snaggle', kind: 'melee' });
ck('a melee attack at range is refused', !!far.error && far.tooFar === true, far.error?.slice(0, 80));
ck('the refusal says how far and how far is allowed', far.distance === 10 && far.maxDistance === 1,
   `distance ${far.distance}, max ${far.maxDistance}`);
ck('and it hands back the cell to move to', !!far.moveTo, JSON.stringify(far.moveTo));
const hpAfterMiss = await page.evaluate(() => window.__st.tokens.find(t => t.name === 'Snaggle').hp);
ck('nothing was damaged by the refused attack', hpAfterMiss === 7, `hp ${hpAfterMiss}`);

console.log('— but a spell does —');
// Mira at (7,6) is 8 squares out: past the goblin's bow, inside her own range.
await put('Mira', 7, 6);
const spell = await call('attack', { attackerId: 'Mira', targetId: 'Snaggle', kind: 'spell', damage: 3 });
ck('Mira can cast from 8 squares away', !spell.error && spell.distance === 8, JSON.stringify(spell).slice(0, 90));
ck('she outranges the goblin that is shooting at her', 8 > (await call('get_board_state'))
  .tokens.find(t => t.name === 'Snaggle').range);
await put('Mira', 3, 6);
const tooFar = await call('attack', { attackerId: 'Mira', targetId: 'Snaggle', kind: 'spell' });
ck('but range binds the caster too — 12 squares is refused', !!tooFar.error && tooFar.tooFar === true,
   tooFar.error?.slice(0, 70));
await put('Mira', 7, 6);
const knight = await call('attack', { attackerId: 'Brannok', targetId: 'Snaggle', kind: 'ranged' });
ck('a knight has no ranged attack, and is told so', !!knight.error && /no ranged attack/.test(knight.error));

console.log('— close the distance, then swing —');
await page.evaluate(m => window.arcana.call('move_token', { tokenId: 'Brannok', x: m.x, y: m.y }), far.moveTo);
const near = await call('attack', { attackerId: 'Brannok', targetId: 'Snaggle', kind: 'melee', damage: 4 });
ck('adjacent, the swing lands or misses honestly', !near.error && typeof near.hit === 'boolean',
   JSON.stringify(near).slice(0, 100));
ck('the cell it suggested really was in reach', near.distance <= 1, `distance ${near.distance}`);

console.log('— you can see what you are fighting —');
await page.evaluate(() => { window.__st.revealed = []; });
await call('add_token', { name: 'Lurker', kind: 'monster', art: 'skeleton', x: 8, y: 10, hp: 9 });
const hidden = await page.evaluate(() => (window.arcana.call('get_board_state')));
await call('attack', { attackerId: 'Mira', targetId: 'Lurker', kind: 'spell', damage: 2 });
ck('attacking lifts the fog around the target', await page.evaluate(() =>
  window.__st.revealed.includes('8,10')));
await page.evaluate(() => { window.__st.revealed = []; });
await call('start_combat', {});
ck('starting a fight reveals every combatant', await page.evaluate(() =>
  window.__st.tokens.filter(t => t.kind !== 'object')
    .every(t => window.__st.revealed.includes(`${t.x},${t.y}`))));

console.log('— the DM is told what it can reach —');
const board = await call('get_board_state');
const snag = board.tokens.find(t => t.name === 'Snaggle');
ck('every token reports reach and range', typeof snag.reach === 'number' && typeof snag.range === 'number',
   `reach ${snag.reach}, range ${snag.range}`);
ck('the board names who is acting', !!board.actor, board.actor);
ck('tokens carry distance from the actor', typeof snag.distanceFromActor === 'number',
   `${snag.distanceFromActor}`);
ck('and whether it is reachable', typeof snag.inMeleeReach === 'boolean' && typeof snag.inRangedRange === 'boolean',
   `melee ${snag.inMeleeReach} / ranged ${snag.inRangedRange}`);
ck('tokens say whether they are visible', typeof snag.visible === 'boolean');

ck('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); srv.close();
process.exit(fail ? 1 : 0);
