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
// The table now opens with the warm-up card already up (the pre-recorded opening); clear it like a player would.
await page.waitForSelector('#warm-offer:not([hidden])', { timeout: 3000 }).catch(() => {});
if (await page.isVisible('#warm-offer-no').catch(() => false)) { await page.click('#warm-offer-no'); await page.waitForTimeout(150); }

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

console.log('— Mira throws fireballs —');
await put('Mira', 7, 6);
await call('add_token', { name: 'Pack A', kind: 'monster', art: 'goblin', x: 15, y: 6, hp: 12 });
await call('add_token', { name: 'Pack B', kind: 'monster', art: 'rat',    x: 15, y: 7, hp: 12 });
await call('add_token', { name: 'Far one', kind: 'monster', art: 'wolf',  x: 15, y: 11, hp: 12 });
const hpOf = n => page.evaluate(n => window.__st.tokens.find(t => t.name === n)?.hp, n);
// Aim at the middle of a cluster from eight squares away.
let ball = await call('attack', { attackerId: 'Mira', targetId: 'Pack A', kind: 'spell', damage: 8 });
for (let i = 0; i < 12 && !ball.hit; i++) {              // she can miss; we are testing the burst
  await page.evaluate(() => { window.__st.tokens.find(t => t.name === 'Pack A').hp = 12;
                              window.__st.tokens.find(t => t.name === 'Pack B').hp = 12; });
  ball = await call('attack', { attackerId: 'Mira', targetId: 'Pack A', kind: 'spell', damage: 8 });
}
ck('a spell from range is a fireball', ball.fireball === true, JSON.stringify(ball).slice(0, 80));
ck('it splashes what stands beside the target', (ball.splash || []).some(x => x.name === 'Pack B'),
   JSON.stringify(ball.splash));
ck('the splash is half, not full', (ball.splash || []).every(x => x.damage === 4), JSON.stringify(ball.splash));
ck('something four squares away is untouched', await hpOf('Far one') === 12, `${await hpOf('Far one')} hp`);
ck('the board is told to paint the burst', await page.evaluate(() => !!window.__st.spellFx));
ck('the party is never caught in it', await page.evaluate(() =>
  window.__st.tokens.filter(t => t.kind === 'pc').every(t => t.hp === t.maxHp)));
const melee = await call('attack', { attackerId: 'Brannok', targetId: 'Pack A', kind: 'melee' });
ck('a sword swing is not a fireball', melee.fireball !== true, JSON.stringify(melee).slice(0, 70));

console.log('— a monster closes the distance and swings —');
// "Move it, then attack" is two calls for one obvious act, and the model kept
// skipping the first — so the creature lunged in the prose and stood still on
// the board. A monster that could reach you this turn now walks in itself.
await put('Brannok', 5, 6);
await call('add_token', { name: 'Charger', kind: 'monster', art: 'skeleton', x: 12, y: 6, hp: 14 });
const posOf = n => page.evaluate(n => {
  const t = window.__st.tokens.find(t => t.name === n); return t ? `${t.x},${t.y}` : null; }, n);
const wasAt = await posOf('Charger');
const rush = await call('attack', { attackerId: 'Charger', targetId: 'Brannok', kind: 'melee', damage: 3 });
ck('the attack is not refused for range', !rush.error && !rush.tooFar, JSON.stringify(rush).slice(0, 90));
ck('the monster actually moved on the board', await posOf('Charger') !== wasAt,
   `${wasAt} → ${await posOf('Charger')}`);
ck('it reports how far it closed', !!rush.closed, JSON.stringify(rush.closed));
ck('and it ends up adjacent', rush.distance <= 1, `distance ${rush.distance}`);
ck('the swing resolved, hit or miss', typeof rush.hit === 'boolean', `hit=${rush.hit}`);

// The player's own heroes are still the player's decision.
await put('Brannok', 3, 6);
await call('add_token', { name: 'Standoff', kind: 'monster', art: 'ogre', x: 16, y: 6, hp: 14 });
const heroWas = await posOf('Brannok');
const heroSwing = await call('attack', { attackerId: 'Brannok', targetId: 'Standoff', kind: 'melee' });
ck('a HERO out of reach is still refused, not auto-moved', heroSwing.tooFar === true,
   (heroSwing.error || '').slice(0, 60));
ck('and the hero did not move', await posOf('Brannok') === heroWas, `${heroWas} → ${await posOf('Brannok')}`);

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
// Snaggle caught the fireball splash earlier and is dead — and now that the
// dead actually leave the board, it is not there to inspect. Use something with
// hit points left.
// Monsters act when a fight starts now, and they can drop a hero — which
// freezes the board and refuses add_token. Stand everyone up first.
await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  window.__st.tokens.filter(t => t.kind === 'pc').forEach(t => { t.hp = t.maxHp; });
  window.__st.downed = null;
  A.addToken({ name: 'Reporter', kind: 'monster', art: 'goblin', x: 14, y: 9, hp: 9 });
});
const board = await call('get_board_state');
const snag = board.tokens.find(t => t.name === 'Reporter');
ck('every token reports reach and range', typeof snag.reach === 'number' && typeof snag.range === 'number',
   `reach ${snag.reach}, range ${snag.range}`);
ck('the board names who is acting', !!board.actor, board.actor);
// Initiative is rolled, so Snaggle is sometimes the one acting — and a token
// correctly reports no distance to itself. Measure from someone else, or this
// assertion fails on roughly one run in three for the wrong reason.
const other = board.tokens.find(t => t.name !== board.actor);
ck('tokens carry distance from the actor', typeof other.distanceFromActor === 'number',
   `${board.actor} → ${other.name}: ${other.distanceFromActor}`);
ck('the actor itself reports no distance to itself',
   board.tokens.find(t => t.name === board.actor)?.distanceFromActor === undefined);
ck('and whether it is reachable', typeof other.inMeleeReach === 'boolean' && typeof other.inRangedRange === 'boolean',
   `melee ${other.inMeleeReach} / ranged ${other.inRangedRange}`);
ck('tokens say whether they are visible', typeof snag.visible === 'boolean');

console.log('— steel you can see —');
// Combat was entirely legible and entirely invisible: a line in the log and two
// numbers changing. The swing is a real arc on the canvas, so this samples
// PIXELS — an effect nothing asserts is an effect that silently stops working.
// Read in one evaluate across animation frames, because the arc lives ~340ms
// and a Playwright screenshot takes longer than that to come back.
// On a page with reduced motion the torch does not flicker, so the canvas is
// still between frames and any change is the swing. (The slash itself is not
// gated on reduced motion — it is a 340ms cue, not a decoration.)
const calm = await b.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
await calm.route('**/arcana-dm*/**', r => r.abort());
await calm.goto('http://localhost:8080/');
await calm.waitForFunction(() => window.arcana);
await calm.click('#intro-type');
const sawSwing = await calm.evaluate(async () => {
  const A = await import('/js/actions.js');
  const fxm = await import('/js/fx.js');
  for (let x = 0; x < 22; x++) for (let y = 0; y < 14; y++) A.revealArea({ x, y, radius: 1 });
  const c = document.getElementById('board');
  const ctx = c.getContext('2d');
  const frame = () => new Promise(r => requestAnimationFrame(r));
  const grab = () => ctx.getImageData(0, 0, c.width, c.height).data.slice();
  const changed = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4)
    if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 60) n++; return n; };
  // Tokens slide into place when the page opens; wait until two consecutive
  // frames are identical before measuring anything.
  let noise = Infinity;
  for (let i = 0; i < 90 && noise > 0; i++) { const q0 = grab(); await frame(); await frame(); noise = changed(q0, grab()); }
  const before = grab();
  fxm.slash({ x: 3, y: 4 }, { x: 6, y: 6 }, { crit: true, hit: true });
  await frame(); await frame();
  const signal = changed(before, grab());
  await new Promise(r => setTimeout(r, 700));
  await frame(); await frame();
  const b2 = grab(); await frame(); await frame();
  const after = changed(b2, grab());
  return { noise, signal, after };
});
await calm.close();
ck('a swing actually paints pixels on the board', sawSwing.signal > 400 && sawSwing.signal > sawSwing.noise * 4,
   `still board ${sawSwing.noise} · swing ${sawSwing.signal}`);
ck('and clears itself afterwards', sawSwing.after < 100 || sawSwing.after < sawSwing.signal / 4,
   `${sawSwing.signal} → ${sawSwing.after}`);
ck('a melee attack records the arc for the renderer', await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  const pc = window.__st.tokens.find(t => t.kind === 'pc');
  const m = A.addToken({ name: 'Swingee', kind: 'monster', art: 'rat', x: pc.x + 1, y: pc.y, hp: 30 }).token;
  window.__st.swingFx = null;
  A.attack({ attackerId: pc.id, targetId: m.id, kind: 'melee' });
  const s = window.__st.swingFx;
  return !!s && s.from.x === pc.x && s.to.x === m.x;
}));
ck('a miss still swings — you should see the steel go by', await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  const pc = window.__st.tokens.find(t => t.kind === 'pc');
  const m = window.__st.tokens.find(t => t.name === 'Swingee');
  m.ac = 99;                                  // nothing lands on this
  window.__st.boosts.setRoll = 1;             // and the die is pinned, so no lucky 20
  window.__st.swingFx = null;
  const r = A.attack({ attackerId: pc.id, targetId: m.id, kind: 'melee' });
  return r.hit === false && window.__st.swingFx?.hit === false;
}));
ck('a spell at range does NOT draw a sword arc', await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  const mira = window.__st.tokens.find(t => t.name === 'Mira');
  const m = window.__st.tokens.find(t => t.name === 'Swingee');
  m.x = mira.x + 4; m.y = mira.y; m.ac = 5;
  window.__st.swingFx = null;
  A.attack({ attackerId: mira.id, targetId: m.id, kind: 'spell' });
  return window.__st.swingFx === null;
}));

console.log('— monsters take their own turns —');
// "Having to say one line to engage the monster was silly." It was: the goblin
// waited to be introduced, and then waited for the DM to remember to swing it.
const own = await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  if (window.__st.combat.active) A.endCombat();
  window.__st.tokens = window.__st.tokens.filter(t => t.kind !== 'monster');
  const pc = window.__st.tokens.find(t => t.name === 'Brannok');
  const mira = window.__st.tokens.find(t => t.name === 'Mira');
  pc.x = 3; pc.y = 6; mira.x = 2; mira.y = 6;          // both heroes together, left side
  pc.hp = pc.maxHp; mira.hp = mira.maxHp;
  const m = A.addToken({ name: 'Eager', kind: 'monster', art: 'skeleton', x: 9, y: 6, hp: 20 }).token;
  // Force the monster to win initiative so we test the start_combat path.
  const r = A.startCombat({ order: [m.id, pc.id] });
  return { r, monsterAt: { x: m.x, y: m.y }, pcAt: { x: pc.x, y: pc.y },
           current: window.__st.combat.order[window.__st.combat.turnIndex] === pc.id ? 'hero' : 'monster',
           log: window.__st.log.slice(-6).map(l => l.text) };
});
ck('a monster that wins initiative acts at once, unprompted', Array.isArray(own.r.monstersActed) && own.r.monstersActed.length === 1,
   JSON.stringify(own.r.monstersActed));
ck('it closed the distance to do it', own.r.monstersActed?.[0]?.closed > 0, `closed ${own.r.monstersActed?.[0]?.closed}`);
ck('and swung, hit or miss', typeof own.r.monstersActed?.[0]?.hit === 'boolean');
ck('the turn then rests with the HERO, not the monster', own.current === 'hero');
ck('the DM is told to narrate, not to act', /narrate/i.test(own.r.note || ''));

const adv = await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  // Hero's turn now. Advance once — the monster should go by itself.
  const r = A.advanceTurn();
  return { r, current: window.__st.combat.order[window.__st.combat.turnIndex] };
});
ck('advance_turn runs the monster\'s turn without a second call', (adv.r.monstersActed || []).length === 1,
   JSON.stringify(adv.r.monstersActed));
ck('and comes back round to the hero', await page.evaluate(id => window.__st.tokens.find(t => t.id === id)?.kind, adv.current) === 'pc');

const pack = await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  A.endCombat();
  const pc = window.__st.tokens.find(t => t.name === 'Brannok');
  const a = A.addToken({ name: 'Pack 1', kind: 'monster', art: 'rat', x: pc.x + 2, y: pc.y + 1, hp: 9 }).token;
  const b = A.addToken({ name: 'Pack 2', kind: 'monster', art: 'rat', x: pc.x + 2, y: pc.y - 1, hp: 9 }).token;
  const e = window.__st.tokens.find(t => t.name === 'Eager');
  A.startCombat({ order: [pc.id, a.id, b.id, e.id] });    // hero first this time
  const r = A.advanceTurn();                              // then all three should go
  return r.monstersActed?.map(x => x.monster) || [];
});
ck('several monsters in a row ALL act on one advance_turn', pack.length === 3, pack.join(', '));

const bow = await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  A.endCombat();
  window.__st.downed = null;
  window.__st.tokens = window.__st.tokens.filter(t => t.kind !== 'monster');
  const pc = window.__st.tokens.find(t => t.name === 'Brannok');
  const mira = window.__st.tokens.find(t => t.name === 'Mira');
  // The fights above may have left a hero at 0 — heal both, or the bowman's
  // "nearest living hero" is not who this test thinks it is.
  pc.x = 3; pc.y = 6; pc.hp = pc.maxHp; mira.x = 2; mira.y = 6; mira.hp = mira.maxHp;
  const g = A.addToken({ name: 'Archer', kind: 'monster', art: 'goblin', x: 6, y: 6, hp: 9 }).token;
  const r = A.startCombat({ order: [g.id, pc.id] });
  return r.monstersActed?.[0] || r;
});
ck('a monster with a bow shoots rather than walking in', bow.kind === 'ranged' && bow.closed === 0, JSON.stringify(bow).slice(0, 90));

ck('nothing moves while a hero is down', await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  window.__st.downed = { tokenId: 'x', saves: 0, fails: 0 };
  const before = window.__st.log.length;
  const acted = A.runMonsterTurns();
  window.__st.downed = null;
  return acted.length === 0 && window.__st.log.length === before;
}));
await page.evaluate(async () => (await import('/js/actions.js')).endCombat());

console.log('— the map only changes when a beat is cleared —');
// The DM walked the party into the glade with set_scene and never called
// advance_quest — so the beat never cleared and crossing the glade paid nothing.
const sc = await call('set_scene', { mapId: 'forest', title: 'The Whispering Glade' });
ck('set_scene refuses to switch the map', !!sc.error, (sc.error || '').slice(0, 60));
ck('and points at advance_quest, which is the call that pays', sc.useInstead === 'advance_quest');
ck('the board did not move', await page.evaluate(() => window.__st.scene.mapId) === 'dungeon');
const mood = await call('set_scene', { title: 'Still the keep', mood: 'Dripping.' });
ck('title and mood still work', !mood.error && mood.scene.title === 'Still the keep', JSON.stringify(mood).slice(0, 60));
const aq = await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  window.__st.downed = null;
  const r1 = A.advanceQuest({ summary: 'x' });      // beat 1 → 2, both in the keep
  const r2 = A.advanceQuest({ summary: 'y' });      // beat 2 → 3, into the glade
  return window.__st.scene.mapId === 'forest' && !!r2.paid
    ? true : JSON.stringify({ map: window.__st.scene.mapId, r1: r1.error || r1.beatNumber, r2: r2.error || r2.beatNumber });
});
ck('advance_quest is what actually moves the party on', aq === true, aq === true ? '' : aq);

console.log('— monsters can actually hurt you —');
// "Went through the entire game and no damage to heroes." To-hit was a bare
// d20 against AC; nothing could reliably touch a knight in plate. Now the die
// carries an attack bonus, so a hundred goblin swings at Brannok land plenty.
const swings = await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  const b = window.__st.tokens.find(t => t.name === 'Brannok');
  b.hp = 999; b.maxHp = 999;                       // survive the barrage
  const g = A.addToken({ name: 'Swarm', kind: 'monster', art: 'goblin', x: b.x + 1, y: b.y, hp: 5000 }).token;
  let hits = 0, seenBonus = null;
  for (let i = 0; i < 100; i++) {
    const r = A.attack({ attackerId: g.id, targetId: b.id, kind: 'melee' });
    if (r.hit) hits++;
    seenBonus = r.attackBonus;
  }
  return { hits, seenBonus, hp: b.hp };
});
ck('a goblin swings with an attack bonus', swings.seenBonus === 3, `+${swings.seenBonus}`);
ck('and lands a real share of a hundred swings at AC 17', swings.hits >= 20, `${swings.hits}/100 hit`);
ck('and the knight actually lost hit points', swings.hp < 999, `${swings.hp} left`);
ck('a hero swings with a bigger bonus than a goblin', await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  const b = window.__st.tokens.find(t => t.name === 'Brannok');
  const g = window.__st.tokens.find(t => t.name === 'Swarm');
  return A.attack({ attackerId: b.id, targetId: g.id, kind: 'melee' }).attackBonus === 5;
}));

console.log('— your Heroic boost is yours, not the goblin\'s —');
const stolen = await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  const b = window.__st.tokens.find(t => t.name === 'Brannok');
  const g = window.__st.tokens.find(t => t.name === 'Swarm');
  window.__st.boosts.setRoll = 20;                 // the player did the push-ups
  const r = A.attack({ attackerId: g.id, targetId: b.id, kind: 'melee' });   // the goblin swings first
  return { goblinGotNat20: r.critical === true && r.roll === 20, stillBanked: window.__st.boosts.setRoll === 20 };
});
ck('a monster\'s swing does not spend the player\'s natural 20', !stolen.goblinGotNat20 && stolen.stillBanked, JSON.stringify(stolen));
ck('the hero\'s next swing does', await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  const b = window.__st.tokens.find(t => t.name === 'Brannok');
  const g = window.__st.tokens.find(t => t.name === 'Swarm');
  const r = A.attack({ attackerId: b.id, targetId: g.id, kind: 'melee' });
  return r.critical === true && window.__st.boosts.setRoll === null;
}));
await page.evaluate(() => { const b = window.__st.tokens.find(t => t.name === 'Brannok'); b.maxHp = 24; b.hp = 24;
  window.__st.tokens = window.__st.tokens.filter(t => t.name !== 'Swarm'); });

console.log('— what you kill leaves the board —');
// It used to only get a line in the log. The corpse stayed drawn, kept its
// square, stayed targetable, and kept taking turns.
const kill = await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  const pc = window.__st.tokens.find(t => t.kind === 'pc');
  const mob = A.addToken({ name: 'Doomed', kind: 'monster', art: 'rat', x: pc.x + 1, y: pc.y, hp: 4 }).token;
  const orderBefore = [...window.__st.combat.order];
  const r = A.updateHp({ tokenId: mob.id, delta: -99 });
  return {
    r, id: mob.id, at: { x: mob.x, y: mob.y },
    stillThere: window.__st.tokens.some(t => t.id === mob.id),
    inOrder: window.__st.combat.order.includes(mob.id),
    orderBefore,
    fx: window.__st.deathFx,
  };
});
ck('a monster at 0 HP is reported down', kill.r.down === true, JSON.stringify(kill.r).slice(0, 60));
ck('and it is GONE from the board', !kill.stillThere);
ck('and out of the initiative order', !kill.inOrder);
ck('and it leaves a mark where it fell', kill.fx && kill.fx.x === kill.at.x && kill.fx.y === kill.at.y,
   JSON.stringify(kill.fx));
ck('its square is walkable again', await page.evaluate(async ([x, y]) => {
  const { isWalkable } = await import('/js/state.js');
  return isWalkable(x, y) && !window.__st.tokens.some(t => t.x === x && t.y === y && t.kind === 'monster');
}, [kill.at.x, kill.at.y]));
ck('and nothing can attack a token that no longer exists', await page.evaluate(async id => {
  const A = await import('/js/actions.js');
  const pc = window.__st.tokens.find(t => t.kind === 'pc');
  return !!A.attack({ attackerId: pc.id, targetId: id, kind: 'melee' }).error;
}, kill.id));

// Removing whoever is EARLIER in the order shifts everyone after it down one;
// without adjusting turnIndex the same removal silently skips a combatant.
const turn = await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  if (!window.__st.combat.active) A.startCombat();
  const c = window.__st.combat;
  const spawn = n => A.addToken({ name: n, kind: 'monster', art: 'rat', x: 2, y: 2 + c.order.length, hp: 5 }).token;
  const a = spawn('Order A'), b2 = spawn('Order B');
  c.order = [a.id, b2.id, ...c.order.filter(id => id !== a.id && id !== b2.id)];
  c.turnIndex = 2;                                   // someone after both is up
  const upBefore = c.order[c.turnIndex];
  A.updateHp({ tokenId: a.id, delta: -99 });         // kill the one at index 0
  return { upBefore, upAfter: c.order[c.turnIndex], len: c.order.length };
});
ck('killing an earlier combatant does not skip whoever is up',
   turn.upBefore === turn.upAfter, `${turn.upBefore} → ${turn.upAfter}`);

ck('the last monster dying ends the fight on its own', await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  if (!window.__st.combat.active) A.startCombat();
  window.__st.tokens.filter(t => t.kind === 'monster').forEach(m => A.updateHp({ tokenId: m.id, delta: -999 }));
  return window.__st.combat.active === false;
}));

ck('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); srv.close();
process.exit(fail ? 1 : 0);
