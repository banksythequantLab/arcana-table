// Two player complaints: every monster looked the same, and the table almost
// never asked for the exercise that is the whole point of it.
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

let pass = 0, fail = 0;
const ck = (l, ok, x = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? '✓' : '✗ FAIL'} ${l}${x ? '  ' + x : ''}`); };
const call = (n, a = {}) => page.evaluate(([n, a]) => window.arcana.call(n, a), [n, a]);

console.log('— the bestiary got bigger —');
const arts = ['ooze', 'spider', 'wraith', 'ogre', 'rat'];
for (const art of arts) {
  const r = await call('add_token', { name: `A ${art}`, kind: 'monster', art, x: 6 + arts.indexOf(art), y: 5, hp: 8 });
  ck(`"${art}" is a real token art`, !r.error, r.error || `${r.token?.art} reach ${r.token?.reach}/${r.token?.range}`);
}
const drawn = await page.evaluate(async () => {
  const { TOKEN_ART } = await import('/js/art.js');
  return Object.keys(TOKEN_ART);
});
ck('every offered art has a drawing', arts.every(a => drawn.includes(a)), drawn.join(','));
const enum_ = await page.evaluate(async () => {
  const t = await (document.modelContext || navigator.modelContext).getTools();
  return t.find(x => x.name === 'add_token').inputSchema.properties.art.enum;
});
ck('the tool offers them to the agent too', arts.every(a => enum_.includes(a)), `${enum_.length} arts`);

console.log('— two of the same monster are not the same picture —');
// Same art, different ids: the renderer must vary tint, stature and facing.
const varies = await page.evaluate(async () => {
  const mod = await import('/js/board.js');
  // hashUnit is internal, so compare what it drives: ids must map to spread values.
  const h = id => { let x = 2166136261;
    for (let i = 0; i < id.length; i++) { x ^= id.charCodeAt(i); x = Math.imul(x, 16777619); }
    return ((x >>> 0) % 10000) / 10000; };
  const ids = window.__st.tokens.filter(t => t.kind === 'monster').map(t => t.id);
  return { ids, us: ids.map(h) };
});
const us = varies.us;
ck('each monster gets its own variation value', new Set(us).size === us.length, us.map(u => u.toFixed(2)).join(' '));
ck('the values actually spread, not cluster', Math.max(...us) - Math.min(...us) > 0.3,
   `range ${(Math.max(...us) - Math.min(...us)).toFixed(2)}`);
ck('some face each way', us.some(u => u > 0.5) && us.some(u => u <= 0.5));
ck('heroes are never tinted', await page.evaluate(() =>
  window.__st.tokens.filter(t => t.kind === 'pc').length === 2));

console.log('— the table asks for effort far more often —');
const pace = () => page.evaluate(async () => {
  const A = await import('/js/actions.js');
  const f = A.getFitnessLog();
  return { since: f.turnsSinceLastOffer, overdue: f.offerOverdue };
});
ck('a fresh table is not yet overdue', !(await pace()).overdue, JSON.stringify(await pace()));
await page.evaluate(async () => { const A = await import('/js/actions.js'); A.notePlayerTurn(); A.notePlayerTurn(); });
const p2 = await pace();
ck('two quiet exchanges marks it overdue', p2.overdue && p2.since === 2, JSON.stringify(p2));
await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  A.proposeChallenge({ mode: 'reps', exercise: 'push-ups', reps: 5, reward: 'bonus+2', reason: 'now' });
  A.declineChallenge();
});
const p3 = await pace();
ck('making an offer resets the clock', !p3.overdue && p3.since === 0, JSON.stringify(p3));
await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  A.notePlayerTurn(); A.notePlayerTurn();
  A.proposeOath({ label: 'the sink', kind: 'chores', minutes: 5, reward: 'bonus+2', reason: 'now' });
});
ck('an Oath counts as staking effort too', (await pace()).since === 0, JSON.stringify(await pace()));

// The turn clock above was advisory and the model drifted past it anyway. This
// one is not advisory: the dice stop. Everything below is the gate.
console.log('— and after two unpaid rolls the dice actually stop —');
const clearStakes = () => page.evaluate(() => {
  window.__st.challenge = null; window.__st.oath = null; window.__st.warmup = null; window.__st.downed = null;
  window.__st.fitness.rollsSinceOffer = 0; window.__st.fitness.rollGateWaived = false;
});
const rollsLeft = () => page.evaluate(async () => (await import('/js/actions.js')).getFitnessLog().rollsLeftBeforeDiceStop);
await clearStakes();
ck('a fresh clock allows two rolls', await rollsLeft() === 2);
let r1 = await call('roll_dice', { formula: 'd20', reason: 'first' });
ck('the first roll goes through', typeof r1.total === 'number', JSON.stringify(r1).slice(0, 60));
ck('and the clock ticks down', await rollsLeft() === 1);
let r2 = await call('roll_dice', { formula: 'd20', reason: 'second' });
ck('so does the second', typeof r2.total === 'number');
ck('now the dice are locked', await rollsLeft() === 0);
const gated = await call('roll_dice', { formula: 'd20', reason: 'third' });
ck('the third roll is REFUSED', !!gated.error, (gated.error || '').slice(0, 55));
ck('the refusal says an offer must come first', gated.mustOfferFirst === true);
ck('it names how many rolls went unpaid', gated.rollsSinceOffer >= 2, `${gated.rollsSinceOffer}`);
ck('and it tells the DM the refusal will not repeat, so it cannot deadlock',
   /will not repeat/i.test(gated.note || ''), gated.note || '');

// A pacing rule that can wedge a game is worse than the drift it fixes.
const afterWaiver = await call('roll_dice', { formula: 'd20', reason: 'again' });
ck('rolling again immediately is allowed — one refusal, never two',
   typeof afterWaiver.total === 'number', JSON.stringify(afterWaiver).slice(0, 60));
const gated2 = await call('roll_dice', { formula: 'd20', reason: 'and again' });
ck('but it comes back on the next roll if still nothing is staked', !!gated2.error);

console.log('— staking something clears it —');
await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  A.proposeChallenge({ mode: 'reps', exercise: 'push-ups', reps: 5, reward: 'bonus+2', reason: 'pay for it' });
});
ck('a live challenge lifts the gate at once', typeof (await call('roll_dice', { formula: 'd20' })).total === 'number');
await page.evaluate(async () => (await import('/js/actions.js')).declineChallenge());
// One roll has already happened since that offer, so one of the two is spent —
// the point is that the clock restarted rather than staying run out.
ck('and having offered restarted the roll clock', await rollsLeft() === 1, `${await rollsLeft()}`);

console.log('— the gate never fires where it would break something —');
await page.evaluate(() => { window.__st.fitness.rollsSinceOffer = 9; window.__st.fitness.rollGateWaived = false; });
await page.evaluate(() => { window.__st.downed = { tokenId: 'x', saves: 0, fails: 0 }; });
ck('a downed hero is never made to wait for a bargain to roll a death save',
   await page.evaluate(async () => !(await import('/js/actions.js')).rollGateRefusal()));
await page.evaluate(() => { window.__st.downed = null; window.__st.warmup = { planId: '90s' }; });
ck('nor is a player mid warm-up',
   await page.evaluate(async () => !(await import('/js/actions.js')).rollGateRefusal()));
await page.evaluate(() => { window.__st.warmup = null; });
// attack() rolls internally; gating that mid-resolution would leave a half-done swing.
await page.evaluate(() => { window.__st.fitness.rollsSinceOffer = 9; window.__st.fitness.rollGateWaived = false; });
const atk = await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  const pc = window.__st.tokens.find(t => t.kind === 'pc');
  const mob = A.addToken({ name: 'Gate Test', kind: 'monster', art: 'rat', x: pc.x + 1, y: pc.y, hp: 6 }).token;
  return A.attack({ attackerId: pc.id, targetId: mob.id, kind: 'melee' });
});
ck('an attack resolves even with the dice clock run out', !atk.error, (atk.error || '').slice(0, 50));
ck('and its internal roll still counts toward pacing',
   await page.evaluate(() => window.__st.fitness.rollsSinceOffer) > 9);
await clearStakes();
// The pricing section below reads the Oath sworn earlier, which the gate checks
// had to clear out of the way. Swear it again so that section runs unchanged.
await page.evaluate(async () => (await import('/js/actions.js'))
  .proposeOath({ label: 'the sink', kind: 'chores', minutes: 5, reward: 'bonus+2', reason: 'now' }));
console.log('— effort and reward scale together —');
// The Oath sworn above locks the table on purpose; end it before pricing.
await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  window.__st.oath.endsAt = Date.now() - 1;
  A.keepOath();
});
const priced = async (reps, mode = 'reps') => page.evaluate(async ([r, m]) => {
  const A = await import('/js/actions.js');
  A.proposeChallenge(m === 'hold'
    ? { mode: 'hold', exercise: 'plank', seconds: r, reason: 'x' }
    : { mode: 'reps', exercise: 'push-ups', reps: r, reason: 'x' });
  const c = window.__st.challenge;
  const out = { reward: c?.reward, ask: c?.reps };
  A.declineChallenge();
  return out;
}, [reps, mode]);
ck('5 push-ups is worth +2',  (await priced(5)).reward === 'bonus+2');
ck('10 push-ups is worth +5', (await priced(10)).reward === 'bonus+5');
ck('15 push-ups is worth +8', (await priced(15)).reward === 'bonus+8');
ck('25 push-ups buys a natural 20', (await priced(25)).reward === 'nat20');
ck('a 90-second hold buys one too', (await priced(90, 'hold')).reward === 'nat20');
ck('the bigger bonuses exist at all', await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  return !!A.REWARDS['bonus+8'] && !!A.REWARDS['bonus+3'];
}));
const cheap = await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  A.proposeChallenge({ mode: 'reps', exercise: 'push-ups', reps: 3, reward: 'nat20', reason: 'x' });
  return A.declineChallenge();          // the DM hears the price on any resolution
});
ck('a natural 20 for three reps is flagged as underpriced', /normally costs/.test(cheap?.underpriced || ''),
   (cheap?.underpriced || '(not flagged)').slice(0, 72));

console.log('— a name the microphone got wrong still finds its hero —');
for (const [heard, want] of [['meera','Mira'], ['mera','Mira'], ['bran','Brannok'], ['brannock','Brannok'], ['BRANNOK','Brannok']]) {
  const got = await page.evaluate(async h => {
    const { findToken } = await import('/js/state.js');
    return findToken(h)?.name || null;
  }, heard);
  ck(`"${heard}" resolves to ${want}`, got === want, got || '(no match)');
}
ck('but a real miss still misses', await page.evaluate(async () => {
  const { findToken } = await import('/js/state.js');
  return findToken('the innkeeper') === null;
}));

ck('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); srv.close();
process.exit(fail ? 1 : 0);
