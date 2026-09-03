// Clearing a beat was one line in the log — no reward at all for the hardest
// thing in the run. It should pay, visibly, and it should pay more each time.
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
const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
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

let pass = 0, fail = 0;
const ck = (l, ok, x = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? '✓' : '✗ FAIL'} ${l}${x ? '  ' + x : ''}`); };
const call = (n, a = {}) => page.evaluate(([n, a]) => window.arcana.call(n, a), [n, a]);

console.log('— clearing a beat pays, and pays visibly —');
// Bloody the party first, so the short rest is something you can see.
await page.evaluate(() => window.__st.tokens.filter(t => t.kind === 'pc').forEach(t => { t.hp = 3; }));
const r1 = await call('advance_quest', { summary: 'Cut the drowned guard down.' });
ck('the beat advanced', !r1.error && r1.beatNumber === 2, JSON.stringify(r1).slice(0, 70));
ck('it names what was cleared and what it paid', !!r1.cleared && !!r1.paid, JSON.stringify(r1.paid));
ck('a boon is banked for the next beat', !!r1.paid.boon, r1.paid.boon || '(none)');
ck('THE PARTY LEVELS UP', r1.paid.partyLevel === 2, `level ${r1.paid.partyLevel}`);
ck('and the level is permanent, not a one-roll boost', await page.evaluate(() =>
  window.__st.party.level === 2));
ck('every hero gained max health', r1.paid.maxHpGained >= 10 && await page.evaluate(() =>
  window.__st.tokens.find(t => t.name === 'Brannok').maxHp > 24), `+${r1.paid.maxHpGained} max hp`);
ck('the beat carries an honorific of its own', r1.paid.honorific === 'Keep-Breakers', r1.paid.honorific || '(none)');
ck('the boon is real, not just a label', await page.evaluate(() =>
  window.__st.boosts.bonus > 0 || window.__st.boosts.advantage || window.__st.boosts.setRoll != null),
  JSON.stringify(await page.evaluate(() => window.__st.boosts)));
ck('the party is back to full at the NEW maximum', await page.evaluate(() =>
  window.__st.tokens.filter(t => t.kind === 'pc').every(t => t.hp === t.maxHp)));
ck('loot and gold landed', (r1.paid.items || []).length > 0 && r1.paid.gold >= 40,
   `${r1.paid.items} · ${r1.paid.gold}g`);

console.log('— and the banner says so —');
await page.waitForSelector('#milestone:not([hidden])', { timeout: 4000 });
const banner = await page.evaluate(() => ({
  step: document.getElementById('ms-step').textContent,
  title: document.getElementById('ms-title').textContent,
  chips: [...document.querySelectorAll('#ms-rewards .ms-chip')].map(c => c.textContent),
}));
ck('the banner names the beat', /BEAT 1 OF 5/.test(banner.step) && banner.title.length > 4, JSON.stringify(banner.step));
ck('the LEVEL is the headline', /LEVEL 2/.test(await page.innerText('#ms-level')), await page.innerText('#ms-level'));
ck('it lists the loot, the boon and the heal', banner.chips.length >= 3 &&
   banner.chips.some(c => /⚡/.test(c)) && banner.chips.some(c => /full/.test(c)), JSON.stringify(banner.chips));
await page.screenshot({ path: 'screens/milestone.png' });
ck('it is not a modal — you can still type', await page.isEnabled('#say'));

console.log('— the rewards escalate across the run —');
const paid = [{ gold: r1.paid.gold, boon: r1.paid.boon }];
for (let i = 0; i < 3; i++) {
  // beats are cleared over the body: put down whatever the last beat spawned,
  // and end the fight it started
  await page.evaluate(async () => { window.__st.tokens.filter(t => t.kind === 'monster').forEach(t => { t.hp = 0; }); (await import('/js/actions.js')).endCombat(); });
  const r = await call('advance_quest', { summary: 'Onward.' });
  if (r.paid) paid.push({ gold: r.paid.gold, boon: r.paid.boon });
}
ck('gold rises every beat', paid.every((p, i) => i === 0 || p.gold > paid[i - 1].gold),
   paid.map(p => p.gold).join(' → '));
ck('the party keeps levelling', await page.evaluate(() => window.__st.party.level) === 5,
   `level ${await page.evaluate(() => window.__st.party.level)}`);
ck('max health compounds across the run', await page.evaluate(() =>
  window.__st.tokens.find(t => t.name === 'Brannok').maxHp >= 24 + 10 + 12 + 14 + 16),
  `${await page.evaluate(() => window.__st.tokens.find(t => t.name === 'Brannok').maxHp)} max hp`);
ck('later beats pay a second boon on top', paid.slice(2).some(p => / and \+5 on top/.test(p.boon || '')),
   paid.map(p => p.boon).join(' | '));
ck('a levelled hero hits harder', await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  A.addToken({ name: 'Dummy', kind: 'monster', art: 'ooze', x: 4, y: 6, hp: 90 });
  const t = window.__st.tokens.find(x => x.name === 'Dummy');
  const b = window.__st.tokens.find(x => x.name === 'Brannok');
  b.x = t.x + 1; b.y = t.y;
  window.__st.boosts.setRoll = 20;                 // guarantee a hit to read the damage
  const r = A.attack({ attackerId: 'Brannok', targetId: 'Dummy', kind: 'melee', damage: 6 });
  return r.damage > 6;
}), 'level adds to every swing');
ck('every beat banks a boon', paid.every(p => !!p.boon), paid.map(p => p.boon).join(' · '));

console.log('— a beat is cleared over the body, not around it —');
// "The guard got hit and advanced a level — the guard still isn't dead."
await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  A.resetQuest();
  window.__st.tokens = window.__st.tokens.filter(t => t.kind !== 'monster');
  const pc = window.__st.tokens.find(t => t.kind === 'pc');
  A.addToken({ name: 'Drowned Guard', kind: 'monster', art: 'skeleton', x: pc.x + 1, y: pc.y, hp: 14 });
  A.startCombat({});
});
const midFight = await call('advance_quest', { summary: 'One hit and we move on.' });
ck('advance_quest is REFUSED while a fight is on', !!midFight.error && midFight.combatActive === true, (midFight.error || '').slice(0, 80));
ck('and it names who is still standing', (midFight.standing || []).includes('Drowned Guard'));
ck('the beat did not move', await page.evaluate(() => window.__st.quest.beatIndex) === 0);
await page.evaluate(async () => {
  window.__st.tokens.find(t => t.name === 'Drowned Guard').hp = 0;
  (await import('/js/actions.js')).endCombat();
});
ck('once the guard is down and the fight is over, it advances', (await call('advance_quest', { summary: 'The guard goes under.' })).ok === true);
// The Warden beat owns its monster: reaching beat 4 spawns it, and beat 4 is
// not cleared while it lives — even with no initiative running.
const slayAndRest = () => page.evaluate(async () => { window.__st.tokens.filter(t => t.kind === 'monster').forEach(t => { t.hp = 0; }); (await import('/js/actions.js')).endCombat(); });
await slayAndRest();
const toGlade = await call('advance_quest', { summary: 'vault opened' });   // beat 2 → 3: dungeon → forest
ck('changing maps leaves the old furniture behind — no chest in the glade', await page.evaluate(() =>
  !window.__st.tokens.some(t => t.kind !== 'pc')), JSON.stringify(await page.evaluate(() => window.__st.tokens.filter(t => t.kind !== 'pc').map(t => t.name))));
ck('and the mood line changes with the place', await page.evaluate(() => !/wet stone/.test(window.__st.scene.mood)),
   await page.evaluate(() => window.__st.scene.mood));
ck('the party arrives at the entrance, not wherever it stood in the dungeon', await page.evaluate(() =>
  window.__st.tokens.filter(t => t.kind === 'pc').every(t => t.x <= 4 && t.y <= 4)));
await slayAndRest();
const toWarden = await call('advance_quest', { summary: 'across' });        // → beat 4, Warden spawns
ck('the Warden arrives AND the fight starts by itself', toWarden.bossSpawned === 'The Waking Warden' && !!toWarden.combatStarted,
   JSON.stringify(toWarden.combatStarted));
ck('the Warden is in the initiative order', await page.evaluate(() => {
  const w = window.__st.tokens.find(t => t.name === 'The Waking Warden'); return window.__st.combat.active && window.__st.combat.order.includes(w?.id); }));
// And it swings: run the round to its turn.
const wardenSwung = await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  const b = window.__st.tokens.find(t => t.name === 'Brannok'); b.hp = 999; b.maxHp = 999;
  let acted = [];
  for (let i = 0; i < 4 && !acted.length; i++) { const r = A.advanceTurn(); acted = acted.concat(r.monstersActed || []); }
  return acted.map(a => a.name || a.actor || JSON.stringify(a).slice(0, 40));
});
ck('and it takes a swing when its turn comes', wardenSwung.length > 0, JSON.stringify(wardenSwung).slice(0, 80));
const wardenUp = await call('advance_quest', { summary: 'we sneak past' });
ck('the Warden beat refuses to clear while the Warden stands', !!wardenUp.error, (wardenUp.error || '').slice(0, 70));
await slayAndRest();
ck('and clears over its body', (await call('advance_quest', { summary: 'The Warden breaks.' })).ok === true);

console.log('— and the Warden is not Brannok —');
// The Warden's body stayed in the glade when the party went down to the crypt
// (a new map is a new place), so read the beat definition, not the board.
const warden = await page.evaluate(async () => (await import('/js/state.js')).QUEST.beats.find(b => b.id === 'warden').spawn);
ck('the Warden beat spawns a stone warden', warden?.art === 'warden',
   warden ? `${warden.name} · art=${warden.art}` : '(not defined)');
ck('it is not drawn with the knight art', warden?.art !== 'knight');
ck('and no other beat mentions a warden, so the DM cannot be led to invent one early', await page.evaluate(async () =>
  (await import('/js/state.js')).QUEST.beats.filter(b => b.id !== 'warden').every(b => !/warden/i.test(b.objective + (b.reward?.items || []).join(' ')))));
ck('a warden drawing exists', await page.evaluate(async () =>
  !!(await import('/js/art.js')).TOKEN_ART.warden));

console.log('— no timer is a trap —');
// A judge trying the table for five minutes must always be able to leave. Every
// screen that can hold someone gets checked here, and "visible" is not enough —
// a disabled button is a wall with a picture of a door on it.
const escapable = async (sel, label) => {
  ck(`${label} — the way out is on screen`, await page.isVisible(sel));
  ck(`${label} — and it is actually clickable`, await page.isEnabled(sel));
};

// Every state that can appear, not just the two that used to be checked.
// proposeChallenge parks on a promise until the player answers — never await it
// to completion from a test; race it against a tick and read the DOM.
const offered = await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  window.__st.challenge = null; window.__st.tasks = null; window.__st.oath = null; window.__st.warmup = null;
  return Promise.race([
    A.proposeChallenge({ mode: 'reps', exercise: 'push-ups', reps: 10, reward: 'nat20', reason: 'x' }),
    new Promise(r => setTimeout(() => r({ parked: true }), 300)),
  ]);
});
ck('a challenge can be offered', !offered?.error, JSON.stringify(offered).slice(0, 80));
await page.waitForSelector('#challenge-modal:not([hidden])', { timeout: 5000 });
await escapable('#chal-decline', 'a challenge being offered');
await page.evaluate(async () => (await import('/js/actions.js')).declineChallenge());
await page.waitForTimeout(200);

await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  A.proposeChallenge({ mode: 'reps', exercise: 'push-ups', reps: 10, reward: 'nat20', reason: 'x' });
  A.acceptChallenge();
});
await page.waitForTimeout(200);
await escapable('#chal-skip', 'a rep challenge underway');
await page.click('#chal-skip');
await page.waitForTimeout(250);
ck('skipping reps ends it and pays nothing', await page.evaluate(() =>
  window.__st.challenge === null && window.__st.boosts.setRoll === null));

await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  A.proposeChallenge({ mode: 'hold', exercise: 'plank', seconds: 120, reward: 'set10', reason: 'x' });
  A.acceptChallenge();
});
await page.waitForSelector('#challenge-modal:not([hidden])');
await escapable('#chal-skip', 'a 120-second hold');
ck('a running hold offers a way out', await page.isVisible('#chal-skip'));
await page.click('#chal-skip');
await page.waitForTimeout(250);
ck('clicking it ends the hold', await page.evaluate(() => window.__st.challenge === null));
ck('and pays nothing, because nothing was done', await page.evaluate(() =>
  window.__st.boosts.setRoll === null), JSON.stringify(await page.evaluate(() => window.__st.boosts)));

await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  A.proposeOath({ label: 'the sink', kind: 'chores', minutes: 25, reward: 'nat20', reason: 'x' });
  A.acceptOath();
});
await page.waitForSelector('#oath:not([hidden])');
await escapable('#oath-quit', 'a 25-minute Oath');
ck('a 25-minute Oath can still be abandoned', await page.isVisible('#oath-quit'));
// The Oath locks the whole board, so the exit must announce itself rather than
// be found at minute twenty — and must say what it costs, which is the reward
// and nothing more.
// textContent keeps the source line wrapping, so flatten it before matching —
// otherwise the assertion fails on where the HTML happens to break a line.
const oathCopy = (await page.evaluate(() => document.getElementById('oath-active')?.textContent || ''))
  .replace(/\s+/g, ' ');
ck('and the card says the exit is live immediately', /from the first second/i.test(oathCopy));
ck('and that it costs only the reward', /lose the reward, nothing else/i.test(oathCopy));
ck('the claim button is still gated on the clock, which is the actual mechanic',
   !(await page.isEnabled('#oath-keep')));
await page.click('#oath-quit');
await page.waitForTimeout(250);
ck('and that releases the table', await page.evaluate(() => window.__st.oath === null));

const warm = await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  A.startWarmup({ plan: '3min' });
  return true;
});
await page.waitForSelector('#warmup:not([hidden])');
await escapable('#warm-done', 'a warm-up');
await escapable('#warm-skip', 'a single stretch');
ck('a ten-minute warm-up can be ended at any point', await page.isVisible('#warm-done'));
await page.click('#warm-done');
await page.waitForTimeout(250);
ck('and it ends', await page.evaluate(() => window.__st.warmup === null));

console.log('— the warm-up is offered as a card, and only once —');
// "It asked me to stretch several times." The prompt said never to raise it
// again after a no; the model raised it three times. The tool keeps the answer.
await page.evaluate(() => { window.__st.fitness.warmupAnswered = null; });
const w1 = await call('start_warmup', {});
ck('start_warmup with no plan OFFERS rather than starts', w1.offered === true && await page.isVisible('#warm-offer'), JSON.stringify(w1).slice(0, 60));
ck('the card has the plan buttons on it', await page.$$eval('#warm-offer [data-plan]', b => b.length) >= 2);
ck('and a way to skip it', await page.isEnabled('#warm-offer-no'));
await page.click('#warm-offer-no');
await page.waitForTimeout(150);
ck('declining closes the card', await page.isHidden('#warm-offer'));
const w2 = await call('start_warmup', {});
ck('a SECOND offer is refused by the tool', !!w2.error && /already answered/i.test(w2.error), (w2.error || '').slice(0, 60));
ck('and no card came back', await page.isHidden('#warm-offer'));
ck('but a plan the player named out loud still starts', (await call('start_warmup', { plan: '90s' })).ok === true);
await page.evaluate(async () => (await import('/js/actions.js')).finishWarmup({ early: true }));
ck('a new run is asked once more', await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  A.resetQuest();
  return window.__st.fitness.warmupAnswered === null;
}));

console.log('— the boss looks like a boss —');
const boss = await page.evaluate(async () => {
  const { QUEST } = await import('/js/state.js');
  return QUEST.beats[QUEST.beats.length - 1].boss;
});
ck('the Cinder Wight has its own art', boss.art === 'wight', `art=${boss.art}`);
ck('and draws at twice the size', boss.scale === 2, `scale=${boss.scale}`);
ck('a wight drawing exists', await page.evaluate(async () =>
  !!(await import('/js/art.js')).TOKEN_ART.wight));
ck('scale survives a spawn', await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  return A.addToken({ name: 'Big', kind: 'monster', art: 'wight', x: 8, y: 3, hp: 40, scale: 2 }).token.scale === 2;
}));

ck('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); srv.close();
process.exit(fail ? 1 : 0);
