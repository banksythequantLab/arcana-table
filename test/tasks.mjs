// One offer, take it or leave it, is a yes/no question — and a player who does
// not fancy ten push-ups right now just says no, and the table gets nothing at
// all. A list asks a better question: three small things, each priced on its
// own, tick off whatever you actually did. Two rows out of three is +4 that
// would otherwise have been a decline.
//
// This suite holds the part that matters: the list is priced off the SAME
// ladder as a single challenge, so it is not a cheaper door to the same
// rewards — and it never pays advantage or a natural 20, because those do not
// add and a list that pretended they did would be the best deal at the table.
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const srv = createServer(async (q, s) => {
  const p = q.url === '/' ? '/index.html' : q.url.split('?')[0];
  try { s.writeHead(200, { 'content-type': MIME[extname(p)] || 'text/plain' });
        s.end(await readFile(join(root, p))); } catch { s.writeHead(404); s.end(); }
});
await new Promise(r => srv.listen(8085, r));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.route('**/arcana-dm*/**', r => r.abort());
await page.goto('http://localhost:8085/');
await page.waitForFunction(() => window.arcana);
await page.evaluate(() => localStorage.clear());
await page.reload(); await page.waitForFunction(() => window.arcana);
await page.click('#intro-type');
// The table now opens with the warm-up card already up (the pre-recorded opening); clear it like a player would.
await page.waitForSelector('#warm-offer:not([hidden])', { timeout: 3000 }).catch(() => {});
if (await page.isVisible('#warm-offer-no').catch(() => false)) { await page.click('#warm-offer-no'); await page.waitForTimeout(150); }
await page.waitForTimeout(300);

let pass = 0, fail = 0;
const ck = (l, ok, x = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? '✓' : '✗ FAIL'} ${l}${x ? '  ' + x : ''}`); };
const call = (n, a = {}) => page.evaluate(([n, a]) => window.arcana.call(n, a), [n, a]);
// The tool parks on a promise until the player answers it, so race a tick.
const offer = (items, reason = 'The lock is stubborn.') => page.evaluate(([items, reason]) => Promise.race([
  window.arcana.call('propose_task_list', { items, reason }),
  new Promise(r => setTimeout(() => r({ parked: true }), 300)),
]), [items, reason]);
const st = () => page.evaluate(() => window.__st.tasks);

const THREE = [
  { exercise: 'push-ups', mode: 'reps', amount: 5 },
  { exercise: 'plank', mode: 'hold', amount: 20 },
  { exercise: 'squats', mode: 'reps', amount: 5 },
];

console.log('— three small things, each with its own price —');
let r = await offer(THREE);
ck('the tool takes a list', !r.error, r.error || '');
let t = await st();
ck('all three land on the card', t?.items.length === 3, JSON.stringify(t?.items.map(i => i.label)));
ck('each is priced on its own', t.items.every(i => i.bonus > 0), t.items.map(i => `${i.label}=+${i.bonus}`).join(' · '));
ck('five push-ups is worth +2, same as it is alone', t.items[0].bonus === 2, `+${t.items[0].bonus}`);
ck('a twenty-second hold is worth +2 too', t.items[1].bonus === 2, `+${t.items[1].bonus}`);
ck('so the whole card is +6 — the number Derek asked for',
   t.items.reduce((s, i) => s + i.bonus, 0) === 6, `${t.items.reduce((s, i) => s + i.bonus, 0)}`);
ck('nothing is ticked to begin with', t.items.every(i => !i.done));

console.log('— the card is on screen and readable —');
ck('the card is showing', await page.isVisible('#tasks'));
const rows = await page.$$eval('#tasks-list [data-task]', ds => ds.map(d => d.textContent.replace(/\s+/g, ' ').trim()));
ck('one row per item', rows.length === 3, JSON.stringify(rows));
ck('each row shows what it pays', rows.every(x => /\+\d/.test(x)), JSON.stringify(rows));
ck('with nothing ticked the button does not promise anything',
   /roll fate/i.test(await page.innerText('#tasks-claim')), await page.innerText('#tasks-claim'));
ck('rows are checkboxes for a screen reader',
   await page.getAttribute('#tasks-list [data-task="0"]', 'role') === 'checkbox');
ck('and report their state', await page.getAttribute('#tasks-list [data-task="0"]', 'aria-checked') === 'false');

console.log('— ticking is cumulative, and partial credit is real —');
await page.click('#tasks-list [data-task="0"]');
await page.waitForTimeout(120);
ck('one tick reads +2', /\+2/.test(await page.innerText('#tasks-claim')), await page.innerText('#tasks-claim'));
ck('the row marks itself checked',
   await page.getAttribute('#tasks-list [data-task="0"]', 'aria-checked') === 'true');
await page.click('#tasks-list [data-task="1"]');
await page.waitForTimeout(120);
ck('two ticks read +4 — partial credit is the whole point',
   /\+4/.test(await page.innerText('#tasks-claim')), await page.innerText('#tasks-claim'));
await page.click('#tasks-list [data-task="2"]');
await page.waitForTimeout(120);
ck('all three read +6', /\+6/.test(await page.innerText('#tasks-claim')), await page.innerText('#tasks-claim'));
await page.click('#tasks-list [data-task="2"]');
await page.waitForTimeout(120);
ck('and unticking takes it back off', /\+4/.test(await page.innerText('#tasks-claim')), await page.innerText('#tasks-claim'));

console.log('— claiming pays exactly what was ticked —');
const before = await page.evaluate(() => ({ bonus: window.__st.boosts.bonus, reps: window.__st.fitness.totalReps,
                                            held: window.__st.fitness.holdSeconds }));
await page.click('#tasks-claim');
await page.waitForTimeout(250);
const after = await page.evaluate(() => ({ bonus: window.__st.boosts.bonus, reps: window.__st.fitness.totalReps,
                                           held: window.__st.fitness.holdSeconds }));
ck('the bonus banked is +4, not +6', after.bonus - before.bonus === 4, `${before.bonus} → ${after.bonus}`);
ck('the reps actually done are logged', after.reps - before.reps === 5, `+${after.reps - before.reps} reps`);
ck('and the seconds held are logged', after.held - before.held === 20, `+${after.held - before.held}s`);
ck('the card closes', await page.evaluate(() => window.__st.tasks === null));
ck('and the log says what was done', await page.evaluate(() =>
  window.__st.log.slice(-4).some(l => /2 of 3 done/.test(l.text))));

console.log('— the bonus is real on the very next roll —');
const rolled = await call('roll_dice', { formula: 'd20', reason: 'the stubborn lock' });
ck('the roll spends it', (rolled.boostsUsed || []).some(x => /\+4/.test(x)), JSON.stringify(rolled.boostsUsed));
ck('and it is gone afterwards', await page.evaluate(() => window.__st.boosts.bonus === 0));

console.log('— walking away costs nothing, which keeps it optional —');
await offer(THREE);
await page.click('#tasks-skip');
await page.waitForTimeout(200);
ck('skipping an untouched list closes it', await page.evaluate(() => window.__st.tasks === null));
ck('and pays nothing', await page.evaluate(() => window.__st.boosts.bonus === 0));
ck('and the log does not scold', await page.evaluate(() =>
  window.__st.log.slice(-2).some(l => /left the task list untouched/.test(l.text))));

console.log('— it is the same ladder, not a cheaper door —');
const sameRate = await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  return [5, 8, 10, 15].map(n => ({ n, list: A.taskBonus(n, 'reps'), solo: A.rewardFor(n, 'reps') }));
});
ck('a list item is priced exactly like the single challenge of that size',
   sameRate.every(x => `bonus+${x.list}` === x.solo), JSON.stringify(sameRate));
ck('and it tops out at +8 — no advantage, no natural 20 from a list',
   await page.evaluate(async () => (await import('/js/actions.js')).taskBonus(90, 'reps')) === 8);

console.log('— the standing effort preference still decides —');
await page.evaluate(() => window.arcana.setEffortPref('oaths'));
r = await offer(THREE);
ck('a physical list is refused under "Oaths only"', !!r.error, (r.error || '').slice(0, 55));
ck('and it still points at the right tool', r.useInstead === 'propose_oath');
r = await offer([
  { exercise: 'clear the sink', mode: 'oath', amount: 10 },
  { exercise: 'ten pages', mode: 'oath', amount: 10 },
]);
ck('a list of real-world tasks is fine there', !r.error, r.error || '');
t = await st();
ck('and each says how long it takes', /10 min/.test(t.items[0].label), t.items[0].label);
ck('priced in minutes on the same ladder', t.items[0].bonus === 5, `+${t.items[0].bonus}`);
await page.click('#tasks-list [data-task="0"]');
await page.click('#tasks-claim');
await page.waitForTimeout(200);
ck('keeping one is counted as an Oath kept', await page.evaluate(() => window.__st.fitness.oathsKept > 0));
await page.evaluate(() => window.arcana.setEffortPref('any'));

console.log('— it does not stack with the other ways to stake effort —');
await offer(THREE);
const clash = await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  return {
    chal: A.proposeChallenge({ exercise: 'push-ups', reps: 10, reward: 'bonus+5' }),
    oath: A.proposeOath({ label: 'the sink', minutes: 10, reward: 'bonus+5' }),
    again: A.proposeTaskList({ items: [{ exercise: 'squats', mode: 'reps', amount: 5 },
                                       { exercise: 'crunches', mode: 'reps', amount: 5 }] }),
  };
});
ck('a challenge cannot land on top of it', !!clash.chal.error, (clash.chal.error || '').slice(0, 45));
ck('nor an Oath', !!clash.oath.error);
ck('nor a second list', !!clash.again.error);

console.log('— and it counts as staking something, so the dice keep rolling —');
await page.evaluate(() => { window.__st.fitness.rollsSinceOffer = 9; window.__st.fitness.rollGateWaived = false; });
ck('a live task list holds the roll gate open',
   await page.evaluate(async () => !(await import('/js/actions.js')).rollGateRefusal()));
await page.click('#tasks-claim');
await page.waitForTimeout(200);
ck('and offering one reset the pacing clock in the first place',
   await page.evaluate(async () => {
     const A = await import('/js/actions.js');
     window.__st.fitness.rollsSinceOffer = 9;
     A.proposeTaskList({ items: [{ exercise: 'squats', mode: 'reps', amount: 5 },
                                 { exercise: 'crunches', mode: 'reps', amount: 5 }] });
     return window.__st.fitness.rollsSinceOffer === 0;
   }));
await page.evaluate(async () => (await import('/js/actions.js')).claimTasks());

console.log('— bad input is refused with something useful —');
const bad = await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  return {
    none: A.proposeTaskList({ items: [] }),
    many: A.proposeTaskList({ items: Array(5).fill({ exercise: 'squats', mode: 'reps', amount: 5 }) }),
    junk: A.proposeTaskList({ items: [{ exercise: 'moonwalking', mode: 'reps', amount: 5 },
                                      { exercise: 'squats', mode: 'reps', amount: 5 }] }),
    wrongMode: A.proposeTaskList({ items: [{ exercise: 'plank', mode: 'reps', amount: 5 },
                                           { exercise: 'squats', mode: 'reps', amount: 5 }] }),
  };
});
ck('an empty list is refused', !!bad.none.error);
ck('five items is refused — a card has to be readable', /two or three|2 or 3/i.test(bad.many.error || ''), bad.many.error || '');
ck('an invented exercise is refused', /moonwalking/.test(bad.junk.error || ''), (bad.junk.error || '').slice(0, 50));
ck('a hold passed as a rep exercise is refused', !!bad.wrongMode.error, (bad.wrongMode.error || '').slice(0, 50));
ck('nothing broken got onto the table', await page.evaluate(() => window.__st.tasks === null));

console.log('— the agent can see it in the surface it already reads —');
const names = await page.evaluate(async () =>
  (await (document.modelContext || navigator.modelContext).getTools()).map(x => x.name));
ck('propose_task_list is a real registered tool', names.includes('propose_task_list'), `${names.length} tools`);
await offer(THREE);
const log = await call('get_fitness_log');
ck('get_fitness_log reports the live list', !!log.activeTaskList, JSON.stringify(log.activeTaskList || {}).slice(0, 70));
ck('with the running total', log.activeTaskList.runningTotal === 0);
ck('and the coach note explains when to reach for it', /task list/i.test(log.coachNote || ''));
await page.evaluate(async () => (await import('/js/actions.js')).claimTasks());

ck('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); srv.close();
process.exit(fail ? 1 : 0);
