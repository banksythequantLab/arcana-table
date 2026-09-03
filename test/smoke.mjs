// Arcana Table headless smoke test — drives the tool surface via window.arcana.
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.mjs': 'text/javascript' };

const server = createServer(async (req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  try {
    const data = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => {
  // ignore network noise (fonts CDN is unreachable in the sandbox)
  if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text());
});

// Mock the DM brain from the very first byte: the opening beat fires the moment
// the table opens, and a real network call would hang the sandbox.
// The "model" asks for a tool call, we assert the board actually changed, then it speaks.
let sawTools = null, hop = 0;
// Until the DM section swaps this out, the brain just talks — the tool-surface
// tests below own the board and must not have monsters wandering into them.
let brain = () => ({ content: 'You stand at the mouth of the crypt. What do you do?', tool_calls: [] });
await page.route(/arcana-dm.*workers\.dev\/speak/, r =>
  r.fulfill({ status: 200, contentType: 'audio/mpeg', body: '' }));
await page.route(/arcana-dm.*workers\.dev\/?$/, async route => {
  sawTools = route.request().postDataJSON().tools;
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(brain(++hop)) });
});

await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.arcana && typeof window.arcana.call === 'function');
await enterTable(page);

// The intro gate is the first thing a player meets — dismiss it as they would.
async function enterTable(page, { muted = true } = {}) {
  const gate = await page.$('#intro:not([hidden])');
  if (!gate) return;
  // Enter by typing, not hands-free: a headless run has no microphone.
  await page.click(muted ? '#intro-type' : '#intro-voice');
  await page.waitForSelector('#intro[hidden]', { timeout: 10000 }).catch(() => {});
  // The table opens with the warm-up card already up (pre-recorded opening); clear it like a player would.
  await page.waitForSelector('#warm-offer:not([hidden])', { timeout: 3000 }).catch(() => {});
  if (await page.isVisible('#warm-offer-no').catch(() => false)) { await page.click('#warm-offer-no'); await page.waitForTimeout(150); }
}

const BASE_N = 21, COMBAT_N = 24, DOWNED_N = 22;   // base · +combat · +death_save
const call = (name, args) => page.evaluate(([n, a]) => window.arcana.call(n, a), [name, args]);
let pass = 0, fail = 0;
const check = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${extra}`); }
};

console.log('— WebMCP surface (the real document.modelContext, via polyfill) —');
const mcInfo = await page.evaluate(() => {
  const ctx = document.modelContext || navigator.modelContext;
  return {
    present: !!ctx,
    hasRegister: typeof ctx?.registerTool === 'function',
    hasUnregister: typeof ctx?.unregisterTool === 'function',
    hasGetTools: typeof ctx?.getTools === 'function',
    hasExecute: typeof ctx?.executeTool === 'function',
    mode: window.__arcanaNativeWebMCP ? 'native' : 'polyfill',
  };
});
check('document.modelContext exists', mcInfo.present, JSON.stringify(mcInfo));
check('registerTool + getTools + executeTool available', mcInfo.hasRegister && mcInfo.hasGetTools && mcInfo.hasExecute, JSON.stringify(mcInfo));

// Enumerate + execute through the real WebMCP API, not our console shim.
const mcNames = () => page.evaluate(async () =>
  (await (document.modelContext || navigator.modelContext).getTools()).map(t => t.name));
const listed = await mcNames();
check(`WebMCP registry lists ${BASE_N} tools (got ${listed.length})`, listed.length === BASE_N, listed.join(','));
check('readOnlyHint set on the read tools', await page.evaluate(async () => {
  const tools = await (document.modelContext || navigator.modelContext).getTools();
  const reads = ['get_board_state', 'get_character_sheet', 'get_fitness_log'];
  return reads.every(n => tools.find(t => t.name === n)?.annotations?.readOnlyHint === true);
}));
// NOTE: this polyfill takes executeTool input as a JSON string (the spec says
// object); agents drive this themselves, our execute() sees a parsed object.
const execViaMc = (name, args = {}) => page.evaluate(async ([n, a]) => {
  const ctx = document.modelContext || navigator.modelContext;
  const tool = (await ctx.getTools()).find(t => t.name === n);
  const out = await ctx.executeTool(tool, JSON.stringify(a));
  return typeof out === 'string' ? JSON.parse(out) : out;
}, [name, args]);

const viaMc = await execViaMc('get_board_state');
check('executeTool("get_board_state") via WebMCP returns the board', !!viaMc?.tokens?.length, JSON.stringify(viaMc).slice(0, 140));
const rollViaMc = await execViaMc('roll_dice', { formula: '3d6', reason: 'via WebMCP' });
check('executeTool("roll_dice") via WebMCP rolls 3d6', rollViaMc?.rolls?.length === 3 && rollViaMc.total >= 3 && rollViaMc.total <= 18, JSON.stringify(rollViaMc));

console.log('— tool surface (shim) —');
const tools = await page.evaluate(() => window.arcana.tools());
check(`${BASE_N} base tools registered (got ${tools.length})`, tools.length === BASE_N, tools.join(','));

console.log('— reads —');
const board = await call('get_board_state');
check('get_board_state has tokens + grid', board.tokens?.length >= 3 && board.grid?.rows?.length === 14);
const sheet = await call('get_character_sheet', { tokenId: 'Brannok' });
check('character sheet for Brannok', sheet.name === 'Brannok' && sheet.abilities?.str === 16);

console.log('— narration / scene —');
check('narrate ok', (await call('narrate', { text: 'A chill wind rises.' })).ok === true);
// Maps belong to beats now: only advance_quest travels. set_scene keeps title and mood.
const crypt = await call('set_scene', { mapId: 'crypt', mood: 'Embers drift upward.' });
check('set_scene REFUSES to switch the map', !!crypt.error && crypt.useInstead === 'advance_quest', crypt.error);
check('set_scene still sets the mood', (await call('set_scene', { mood: 'Embers drift upward.' })).ok === true);
check('set_scene rejects bad map', !!(await call('set_scene', { mapId: 'moonbase' })).error);

console.log('— board ops —');
const spawn = await call('add_token', { name: 'Snaggle', kind: 'monster', art: 'goblin', x: 11, y: 6, hp: 7 });
check('add_token spawns goblin', spawn.ok && spawn.token.name === 'Snaggle');
const mv = await call('move_token', { tokenId: 'Brannok', x: 6, y: 6 });   // open floor on the keep map
check('move_token ok', mv.ok === true, JSON.stringify(mv));
check('move into wall rejected', !!(await call('move_token', { tokenId: 'Brannok', x: 0, y: 0 })).error);
check('reveal_area ok', (await call('reveal_area', { x: 10, y: 6, radius: 4 })).ok === true);

console.log('— dice —');
const roll = await call('roll_dice', { formula: '2d6+3', reason: 'test' });
check('2d6+3 in range', roll.total >= 5 && roll.total <= 15, JSON.stringify(roll));
check('bad formula rejected', !!(await call('roll_dice', { formula: 'banana' })).error);

console.log('— combat lifecycle (dynamic tools) —');
check('advance_turn gated before combat', !!(await call('advance_turn')).error);
const combat = await call('start_combat');
check('start_combat ok', combat.ok === true, JSON.stringify(combat));
const toolsInCombat = await page.evaluate(() => window.arcana.tools());
check(`combat tools live (got ${toolsInCombat.length})`, toolsInCombat.length === COMBAT_N);
const mcInCombat = await mcNames();
check(`WebMCP registry grew to ${COMBAT_N} during combat (got ${mcInCombat.length})`, mcInCombat.length === COMBAT_N, mcInCombat.join(','));
check('advance_turn is in the live WebMCP registry', mcInCombat.includes('advance_turn'));
check('advance_turn works in combat', (await call('advance_turn')).ok === true);
const dmg = await call('update_hp', { tokenId: 'Snaggle', delta: -3 });
check('damage goblin (no approval needed)', dmg.ok && dmg.hp === 4, JSON.stringify(dmg));

// PC damage requires approval — approve via UI button
// Monsters take their own turns now, so the goblin may already have hit him
// when it won initiative — measure from wherever he actually is.
const hpBefore = await page.evaluate(() => window.__st.tokens.find(t => t.name === 'Brannok').hp);
const pcDmgPromise = call('update_hp', { tokenId: 'Brannok', delta: -5 });
await page.waitForSelector('.approval', { timeout: 5000 });
await page.screenshot({ path: 'screens/approval.png' });
await page.click('.approval .ok');
const pcDmg = await pcDmgPromise;
check('PC damage approved via ✓', pcDmg.ok && pcDmg.hp === hpBefore - 5, `${hpBefore} → ${JSON.stringify(pcDmg)}`);

// deny path
const denyPromise = call('remove_token', { tokenId: 'Brannok' });
await page.waitForSelector('.approval', { timeout: 5000 });
await page.click('.approval .no');
const denied = await denyPromise;
check('remove PC denied via ✗', denied.denied === true, JSON.stringify(denied));

// Sweeping a defeated monster is bookkeeping, not consent — it must not stall.
await call('add_token', { name: 'Husk', kind: 'monster', art: 'skeleton', x: 3, y: 9, hp: 1 });
const swept = await Promise.race([
  call('remove_token', { tokenId: 'Husk' }),
  new Promise(r => setTimeout(() => r({ stalled: true }), 4000)),
]);
check('removing a monster needs no approval', swept.ok === true, JSON.stringify(swept));
check('no approval prompt was raised for the monster',
  (await page.$$('.approval')).length === 0);

check('apply_condition ok', (await call('apply_condition', { tokenId: 'Snaggle', condition: 'poisoned' })).ok === true);
check('end_combat ok', (await call('end_combat')).ok === true);
const toolsAfter = await page.evaluate(() => window.arcana.tools());
check(`combat tools unregistered (got ${toolsAfter.length})`, toolsAfter.length === BASE_N);
const mcAfter = await mcNames();
check(`WebMCP registry shrank back to ${BASE_N} via AbortSignal (got ${mcAfter.length})`, mcAfter.length === BASE_N, mcAfter.join(','));
check('advance_turn really left the WebMCP registry', !mcAfter.includes('advance_turn'), mcAfter.join(','));

console.log('— Heroic Effort —');
const chalPromise = call('propose_challenge', { exercise: 'push-ups', reps: 3, reward: 'nat20', reason: 'The dragon rears back!' });
await page.waitForSelector('#challenge-modal:not([hidden])', { timeout: 5000 });
await page.screenshot({ path: 'screens/challenge-offer.png' });
await page.click('#chal-accept');
for (let i = 0; i < 3; i++) { await page.waitForTimeout(150); await page.click('#chal-tap'); }
const chal = await chalPromise;
check('challenge completed → nat20 reward', chal.status === 'completed' && /natural 20/i.test(chal.rewardGranted), JSON.stringify(chal));
const fit = await call('get_fitness_log');
check('fitness log recorded 3 push-ups', fit.byExercise?.['push-ups'] === 3 && fit.unspentBoosts.setRoll === 20, JSON.stringify(fit));
const heroicRoll = await call('roll_dice', { formula: 'd20', reason: 'Strike the dragon!' });
check('boosted d20 is a natural 20', heroicRoll.rolls[0] === 20 && heroicRoll.nat20 === true, JSON.stringify(heroicRoll));
const fit2 = await call('get_fitness_log');
check('boost consumed after roll', fit2.unspentBoosts.setRoll === null);

check('loot awarded', (await call('award_loot', { items: ['Dragonfang Dagger'], gold: 50 })).gold === 50);

// ── timed holds ──────────────────────────────────────────────────────────────
console.log('— a timed hold —');
// 'squat hold' is a HOLD; 'squats' is a rep exercise. The two lists are
// separate now, and passing one for the other is refused on purpose.
const holdP = call('propose_challenge', { mode: 'hold', exercise: 'squat hold', seconds: 5, reward: 'bonus+2', reason: 'Sink into it while the door groans.' });
await page.waitForSelector('#challenge-modal:not([hidden])', { timeout: 5000 });
check('a hold shows seconds, not reps', /5S SQUAT HOLD/i.test(await page.innerText('#chal-title')), await page.innerText('#chal-title'));
await page.click('#chal-accept');
check('a hold counts itself down — tapping does nothing', await (async () => {
  const before = await page.evaluate(() => window.__st?.challenge?.progress ?? 0);
  await page.click('#chal-tap'); await page.click('#chal-tap');
  const after = await page.evaluate(() => window.__st?.challenge?.progress ?? 0);
  return after - before <= 1;                       // the 1s tick may land mid-check
})());
const held = await holdP;                            // resolves when the clock runs out
check('the hold completes on its own clock', held.status === 'completed' && held.mode === 'hold', JSON.stringify(held).slice(0, 120));
check('held seconds are logged separately from reps', (await call('get_fitness_log')).holdSeconds >= 5);

// ── an Oath: real-world effort the app cannot see ────────────────────────────
console.log('— an Oath —');
const declined = call('propose_oath', { label: 'clear the sink', kind: 'chores', minutes: 10, reward: 'nat20', reason: 'Swear it.' });
await page.waitForSelector('#oath:not([hidden])', { timeout: 5000 });
check('the Oath names the real task', /clear the sink/i.test(await page.innerText('#oath-label')));
await page.click('#oath-decline');
check('declining an Oath returns cleanly, no reward', (await declined).status === 'declined');
check('a declined Oath is not counted as broken', (await call('get_fitness_log')).oathsBroken === 0);

// a short one we can actually wait out
const oathP = call('propose_oath', { label: 'read one page', kind: 'reading', minutes: 1, reward: 'bonus+2', reason: 'One page. Then we ride.' });
await page.waitForSelector('#oath:not([kidden])', { timeout: 5000 }).catch(() => {});
await page.waitForSelector('#oath-accept', { timeout: 5000 });
await page.click('#oath-accept');
check('an Oath locks the table', (await call('move_token', { tokenId: 'Brannok', x: 7, y: 6 })).oathActive === true);
check('reads still work while the player is away', !!(await call('get_board_state')).tokens);
check('the Oath cannot be claimed before the clock runs out', await page.isDisabled('#oath-keep'));
check('the DM is told how long it has to wait', (await call('get_fitness_log')).activeOath?.secondsLeft > 0);
// fast-forward rather than actually waiting a minute
await page.evaluate(() => { window.__st.oath.endsAt = Date.now() - 1; });
await page.waitForTimeout(1100);
check('the claim button unlocks when the time is served', !(await page.isDisabled('#oath-keep')));
await page.click('#oath-keep');
const kept = await oathP;
check('keeping an Oath pays the same dice reward', kept.status === 'kept' && /\+2/.test(kept.rewardGranted), JSON.stringify(kept).slice(0, 120));
check('kept Oaths and their minutes are logged', (await call('get_fitness_log')).oathsKept === 1);
check('the table unlocks once they are back', (await call('move_token', { tokenId: 'Brannok', x: 7, y: 6 })).ok === true);

// ── the warm-up ──────────────────────────────────────────────────────────────
console.log('— the warm-up —');
const warm = await call('start_warmup', { plan: '90s' });
check('90s plan is 6 stretches at 15s', warm.stretches === 6 && warm.holdSeconds === 15 && warm.totalSeconds === 90, JSON.stringify(warm));
check('the warm-up overlay is up', await page.isVisible('#warmup'));
check('it names the stretch and coaches it', (await page.innerText('#warm-name')).length > 2 && (await page.innerText('#warm-cue')).length > 10);
check('a breath pacer is running', /breathe|hold|settle/i.test(await page.innerText('#warm-breath')));
const firstName = await page.innerText('#warm-name');
await page.click('#warm-skip');
check('skip advances to the next stretch', (await page.innerText('#warm-name')) !== firstName);
await page.click('#warm-pause');
check('pause holds the clock', (await page.innerText('#warm-eyebrow')).includes('PAUSED'));
await page.click('#warm-pause');
check('start_warmup refuses to run two at once', !!(await call('start_warmup', { plan: '5min' })).error);
check('bad plan rejected', !!(await call('start_warmup', { plan: 'forever' })).error);
const warmDone = await page.evaluate(() => window.arcana.finishWarmup());
check('finishing early still counts the time', warmDone.ok === true && warmDone.early === true);
check('the overlay closes', await page.isHidden('#warmup'));

// ── the quest: five beats, a boss, an ending ─────────────────────────────────
console.log('— quest arc —');
const q0 = await call('get_quest');
check('quest starts on beat 1 of 5', q0.beatNumber === 1 && q0.of === 5 && q0.status === 'active', JSON.stringify(q0).slice(0, 120));
check('current beat carries an objective for the DM', typeof q0.current?.objective === 'string' && q0.current.objective.length > 20);
check('quest rides along in get_board_state', (await call('get_board_state')).quest?.current?.id === q0.current.id);

const goldBefore = (await call('get_board_state')).party.gold;
const adv1 = await call('advance_quest', { summary: 'Cut the drowned thing down in the shallows.' });
check('advance_quest moves to beat 2', adv1.ok && adv1.beatNumber === 2, JSON.stringify(adv1).slice(0, 120));
check('clearing a beat pays a milestone', (await call('get_board_state')).party.gold > goldBefore);
check('completed beat is recorded', (await call('get_quest')).completed.length === 1);

// walk to the final beat and confirm the boss actually spawns
// A beat is cleared over its monster's body now, so each step first finishes
// whatever the beat spawned (the Warden on beat 4) before advancing.
const slayAll = () => page.evaluate(() => { window.__st.tokens.filter(t => t.kind === 'monster').forEach(t => { t.hp = 0; }); });
let last = null;
for (let i = 0; i < 3; i++) { await call('end_combat'); await slayAll(); last = await call('advance_quest', { summary: 'onward' }); }
check('final beat spawns the boss', last.bossSpawned === 'The Cinder Wight', JSON.stringify(last).slice(0, 140));
check('final beat is flagged as final', (await call('get_quest')).current.isFinalBeat === true);
// Not a hardcoded HP total — that drifts every time the boss is tuned. What
// matters is that it is on the board, is a genuine threat, and reads as a boss.
const wight = (await call('get_board_state')).tokens.find(t => t.name === 'The Cinder Wight');
check('boss is really on the board', !!wight, JSON.stringify(wight || {}).slice(0, 90));
check('boss has boss-sized hit points', (wight?.maxHp || 0) >= 40, `${wight?.maxHp} hp`);
check('boss has its own art, not the plain skeleton', wight?.art === 'wight', wight?.art);

// ── going down: time stops, and reps are the way out ────────────────────────
console.log('— a hero goes down —');
await call('start_combat');
// Mira is a PC, so the killing blow needs the player's ✓ like any other.
const dropP = call('update_hp', { tokenId: 'Mira', delta: -99 });
await page.waitForSelector('.approval', { timeout: 5000 });
await page.click('.approval .ok');
await dropP;
const dq = await call('get_quest');
check('a downed PC stops time', dq.timeStopped === true && dq.downed?.name === 'Mira', JSON.stringify(dq.downed));
check('death_save registers as a live WebMCP tool while down', (await mcNames()).includes('death_save'));
check(`registry grows to ${DOWNED_N + 3} with combat + death_save (got ${(await mcNames()).length})`,
  (await mcNames()).length === COMBAT_N + 1, (await mcNames()).join(','));

const frozen = await call('move_token', { tokenId: 'Brannok', x: 6, y: 6 });
check('the board refuses to move while a hero is down', frozen.timeStopped === true && !!frozen.error, JSON.stringify(frozen).slice(0, 100));
check('reads still work while frozen', !!(await call('get_board_state')).tokens);

// the point of the whole table: effort revives, no roll required
const chalP = call('propose_challenge', { exercise: 'push-ups', reps: 3, reward: 'bonus+2', reason: 'Get up.' });
await page.waitForSelector('#challenge-modal:not([hidden])', { timeout: 5000 });
await page.click('#chal-accept');
for (let i = 0; i < 3; i++) { await page.waitForTimeout(60); await page.click('#chal-tap'); }
const revived = await chalP;
check('completed reps revive the downed hero', revived.revived === 'Mira', JSON.stringify(revived).slice(0, 140));
check('time is moving again', (await call('get_quest')).timeStopped === false);
check('death_save left the registry on the way back up', !(await mcNames()).includes('death_save'));
check('the revived hero is actually standing', (await call('get_board_state')).tokens.find(t => t.name === 'Mira').hp > 0);
await call('end_combat');

// ── winning ─────────────────────────────────────────────────────────────────
const early = await call('advance_quest', { summary: 'We just leave.' });
check('the run cannot be won while the Cinder Wight stands', !!early.error && early.mustDefeat === 'The Cinder Wight', early.error);
await slayAll();
const win = await call('advance_quest', { summary: 'The Wight falls. The Crown is taken.' });
check('clearing the last beat wins the run', win.questComplete === true && win.status === 'won', JSON.stringify(win).slice(0, 120));
check('victory screen is shown', await page.isVisible('#ending'));
check('victory screen names the run', /Crown/i.test(await page.innerText('#ending-title')));
check('advance_quest refuses after the run is over', !!(await call('advance_quest')).error);
await page.screenshot({ path: 'screens/victory.png' });

// back to an active run so the DM section below has a live table
await page.evaluate(() => window.arcana.resetQuest());

// ── the built-in AI DM ───────────────────────────────────────────────────────
// Mock the brain so the loop is tested without spending a token: the "model"
// asks for a tool call, we assert the board actually changed, then it speaks.
console.log('— built-in DM (mocked brain, real tools) —');
brain = n => n === 1
  ? { content: 'The wyrm uncoils from the dark.', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'add_token', arguments: JSON.stringify({ name: 'Ember Wyrm', kind: 'monster', art: 'dragon', x: 9, y: 7, hp: 40 }) } }] }
  : { content: 'It fixes one molten eye on you. What do you do?', tool_calls: [] };

// The opening beat has already spoken — measure from here.
const dmBase = await page.evaluate(() => document.querySelectorAll('.say.dm').length);
hop = 0; sawTools = null;
await page.fill('#say', 'I push open the iron door and step through.');
await page.click('#say-btn');
await page.waitForFunction(n => document.querySelectorAll('.say.dm').length >= n + 2, dmBase, { timeout: 20000 });

check('DM was offered the live WebMCP tool list', Array.isArray(sawTools) && sawTools.length >= BASE_N, `got ${sawTools?.length}`);
check('tool specs carry name + JSON-schema parameters',
  sawTools.every(t => t.type === 'function' && t.function.name && t.function.parameters?.type === 'object'));
const spawned = await call('get_board_state');
check('DM\'s tool call actually changed the board', spawned.tokens.some(t => t.name === 'Ember Wyrm'),
  spawned.tokens.map(t => t.name).join(','));
const said = await page.evaluate(() => [...document.querySelectorAll('.say.dm')].map(e => e.innerText));
check('DM spoke in the transcript', said.some(s => /wyrm/i.test(s)), said.join(' | ').slice(0, 120));
check('player turn is shown in the transcript',
  await page.evaluate(() => [...document.querySelectorAll('.say.you')].some(e => /iron door/i.test(e.innerText))));
check('DM tool call appears in the Agent Log',
  await page.evaluate(() => [...document.querySelectorAll('#agent-log code')].some(e => e.textContent === 'add_token')));
await page.unroute(/arcana-dm.*workers\.dev/);

await page.waitForSelector('#dice-overlay', { state: 'hidden', timeout: 10000 });
await page.waitForTimeout(600);
await page.screenshot({ path: 'screens/board.png', fullPage: false });

console.log('— console/page errors —');
check('no page errors', errors.length === 0, '\n    ' + errors.join('\n    '));

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
