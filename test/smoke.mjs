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

await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.arcana && typeof window.arcana.call === 'function');

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
check(`WebMCP registry lists 14 tools (got ${listed.length})`, listed.length === 14, listed.join(','));
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
check(`14 base tools registered (got ${tools.length})`, tools.length === 14, tools.join(','));

console.log('— reads —');
const board = await call('get_board_state');
check('get_board_state has tokens + grid', board.tokens?.length >= 3 && board.grid?.rows?.length === 14);
const sheet = await call('get_character_sheet', { tokenId: 'Brannok' });
check('character sheet for Brannok', sheet.name === 'Brannok' && sheet.abilities?.str === 16);

console.log('— narration / scene —');
check('narrate ok', (await call('narrate', { text: 'A chill wind rises.' })).ok === true);
check('set_scene to crypt', (await call('set_scene', { mapId: 'crypt', mood: 'Embers drift upward.' })).ok === true);
check('set_scene rejects bad map', !!(await call('set_scene', { mapId: 'moonbase' })).error);

console.log('— board ops —');
const spawn = await call('add_token', { name: 'Snaggle', kind: 'monster', art: 'goblin', x: 11, y: 6, hp: 7 });
check('add_token spawns goblin', spawn.ok && spawn.token.name === 'Snaggle');
const mv = await call('move_token', { tokenId: 'Brannok', x: 5, y: 6 });
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
check(`combat tools live (got ${toolsInCombat.length})`, toolsInCombat.length === 17);
const mcInCombat = await mcNames();
check(`WebMCP registry grew to 17 during combat (got ${mcInCombat.length})`, mcInCombat.length === 17, mcInCombat.join(','));
check('advance_turn is in the live WebMCP registry', mcInCombat.includes('advance_turn'));
check('advance_turn works in combat', (await call('advance_turn')).ok === true);
const dmg = await call('update_hp', { tokenId: 'Snaggle', delta: -3 });
check('damage goblin (no approval needed)', dmg.ok && dmg.hp === 4, JSON.stringify(dmg));

// PC damage requires approval — approve via UI button
const pcDmgPromise = call('update_hp', { tokenId: 'Brannok', delta: -5 });
await page.waitForSelector('.approval', { timeout: 5000 });
await page.screenshot({ path: 'screens/approval.png' });
await page.click('.approval .ok');
const pcDmg = await pcDmgPromise;
check('PC damage approved via ✓', pcDmg.ok && pcDmg.hp === 19, JSON.stringify(pcDmg));

// deny path
const denyPromise = call('remove_token', { tokenId: 'Brannok' });
await page.waitForSelector('.approval', { timeout: 5000 });
await page.click('.approval .no');
const denied = await denyPromise;
check('remove PC denied via ✗', denied.denied === true, JSON.stringify(denied));

check('apply_condition ok', (await call('apply_condition', { tokenId: 'Snaggle', condition: 'poisoned' })).ok === true);
check('end_combat ok', (await call('end_combat')).ok === true);
const toolsAfter = await page.evaluate(() => window.arcana.tools());
check(`combat tools unregistered (got ${toolsAfter.length})`, toolsAfter.length === 14);
const mcAfter = await mcNames();
check(`WebMCP registry shrank back to 14 via AbortSignal (got ${mcAfter.length})`, mcAfter.length === 14, mcAfter.join(','));
check('advance_turn really left the WebMCP registry', !mcAfter.includes('advance_turn'), mcAfter.join(','));

console.log('— Heroic Effort —');
const chalPromise = call('propose_challenge', { exercise: 'burpees', reps: 3, reward: 'nat20', reason: 'The dragon rears back!' });
await page.waitForSelector('#challenge-modal:not([hidden])', { timeout: 5000 });
await page.screenshot({ path: 'screens/challenge-offer.png' });
await page.click('#chal-accept');
for (let i = 0; i < 3; i++) { await page.waitForTimeout(150); await page.click('#chal-tap'); }
const chal = await chalPromise;
check('challenge completed → nat20 reward', chal.status === 'completed' && /natural 20/i.test(chal.rewardGranted), JSON.stringify(chal));
const fit = await call('get_fitness_log');
check('fitness log recorded 3 burpees', fit.byExercise?.burpees === 3 && fit.unspentBoosts.setRoll === 20, JSON.stringify(fit));
const heroicRoll = await call('roll_dice', { formula: 'd20', reason: 'Strike the dragon!' });
check('boosted d20 is a natural 20', heroicRoll.rolls[0] === 20 && heroicRoll.nat20 === true, JSON.stringify(heroicRoll));
const fit2 = await call('get_fitness_log');
check('boost consumed after roll', fit2.unspentBoosts.setRoll === null);

check('loot awarded', (await call('award_loot', { items: ['Dragonfang Dagger'], gold: 50 })).gold === 50);

await page.waitForSelector('#dice-overlay', { state: 'hidden', timeout: 10000 });
await page.waitForTimeout(600);
await page.screenshot({ path: 'screens/board.png', fullPage: false });

console.log('— console/page errors —');
check('no page errors', errors.length === 0, '\n    ' + errors.join('\n    '));

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
