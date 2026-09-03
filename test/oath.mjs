// The table takes three currencies — reps, holds, and Oaths — and a player who
// cannot pay in push-ups had no way to say so except out loud, to a language
// model, and hope it kept remembering across forty exchanges. It did not.
//
// So the preference is a setting the PLAYER owns and the TOOLS enforce: an ask
// outside it comes back refused, with the call the DM should have made instead.
// That is the only version of an accessibility preference a model cannot drift
// away from, and this suite is what proves the refusal is real rather than
// advisory. It also checks the thing that made the whole mechanic invisible:
// Oaths had one clause in one bullet on the intro card.
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
await new Promise(r => srv.listen(8083, r));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.route('**/arcana-dm*/**', r => r.abort());
await page.goto('http://localhost:8083/');
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
const call = (n, a = {}) => page.evaluate(([n, a]) => window.arcana.call(n, a), [n, a]);
const setPref = p => page.evaluate(p => window.arcana.setEffortPref(p), p);
const clear = () => page.evaluate(() => { window.__st.challenge = null; window.__st.oath = null; });

// A challenge/oath call parks on a promise until the player answers, so never
// await one to completion — race it against a tick and read the state instead.
const offer = async (n, a) => {
  const r = await page.evaluate(([n, a]) => Promise.race([
    window.arcana.call(n, a), new Promise(r => setTimeout(() => r({ parked: true }), 250)),
  ]), [n, a]);
  return r;
};

console.log('— the default takes everything —');
ck('a fresh table is set to "any"', await page.evaluate(() => window.arcana.effortPref()) === 'any');
let r = await offer('propose_challenge', { exercise: 'push-ups', reps: 10, reward: 'bonus+5' });
ck('reps are accepted by default', !r.error, r.error || '');
ck('and the challenge is really on the table', await page.evaluate(() => !!window.__st.challenge));
await clear();
r = await offer('propose_challenge', { exercise: 'plank', mode: 'hold', seconds: 30, reward: 'bonus+5' });
ck('holds are accepted by default', !r.error, r.error || '');
await clear();
r = await offer('propose_oath', { label: 'clear the sink', minutes: 10, reward: 'bonus+5' });
ck('Oaths are accepted by default', !r.error, r.error || '');
await clear();

console.log('\n— "Oaths only": nothing physical gets through —');
ck('the setting sticks', (await setPref('oaths')).effortPreference === 'oaths');
r = await offer('propose_challenge', { exercise: 'push-ups', reps: 10, reward: 'bonus+5' });
ck('push-ups are REFUSED, not merely discouraged', !!r.error, r.error?.slice(0, 60) || 'no error');
ck('the refusal names the preference', /oaths only/i.test(r.error || ''));
ck('and hands back the call to make instead', r.useInstead === 'propose_oath', r.useInstead || '');
ck('nothing was put on the table', await page.evaluate(() => !window.__st.challenge));
r = await offer('propose_challenge', { exercise: 'plank', mode: 'hold', seconds: 30, reward: 'bonus+5' });
ck('a timed hold is refused too', !!r.error && /oaths only/i.test(r.error));
r = await offer('propose_oath', { label: 'twenty minutes of study', kind: 'study', minutes: 20, reward: 'set10' });
ck('but the Oath still lands', !r.error, r.error || '');
ck('and it is really running', await page.evaluate(() => window.__st.oath?.label) === 'twenty minutes of study');
ck('an Oath pays a full-price reward, not a consolation one',
   await page.evaluate(() => window.__st.oath?.reward) === 'set10');
await clear();

console.log('\n— the gate runs BEFORE the exercise list —');
// The refusal a player must never see: "push-ups is not enabled" when the real
// answer is that this table takes no reps at all.
r = await offer('propose_challenge', { exercise: 'burpees', reps: 10, reward: 'bonus+5' });
ck('an off-pool exercise still reports the preference, not the pool',
   /oaths only/i.test(r.error || ''), r.error?.slice(0, 70) || '');

console.log('\n— "Reps" and "Holds" cut the other way —');
await setPref('reps');
r = await offer('propose_oath', { label: 'the dishes', minutes: 10, reward: 'bonus+5' });
ck('reps-only refuses an Oath', !!r.error && r.useInstead === 'propose_challenge', r.error?.slice(0, 60) || '');
r = await offer('propose_challenge', { exercise: 'plank', mode: 'hold', seconds: 30, reward: 'bonus+5' });
ck('reps-only refuses a hold', !!r.error, r.error?.slice(0, 60) || '');
r = await offer('propose_challenge', { exercise: 'squats', reps: 12, reward: 'advantage' });
ck('reps-only takes reps', !r.error, r.error || '');
await clear();
await setPref('holds');
r = await offer('propose_challenge', { exercise: 'push-ups', reps: 10, reward: 'bonus+5' });
ck('holds-only refuses reps', !!r.error, r.error?.slice(0, 60) || '');
r = await offer('propose_challenge', { exercise: 'wall sit', mode: 'hold', seconds: 45, reward: 'bonus+8' });
ck('holds-only takes a hold', !r.error, r.error || '');
await clear();

console.log('\n— the DM is told, in the tool it already calls —');
await setPref('oaths');
const log = await call('get_fitness_log');
ck('get_fitness_log reports the setting', log.effortPreference?.setting === 'oaths');
ck('with a mayAsk list', Array.isArray(log.effortPreference?.mayAsk));
ck('naming propose_oath', (log.effortPreference?.mayAsk || []).includes('propose_oath'));
ck('and nothing physical', !(log.effortPreference?.mayAsk || []).some(m => /propose_challenge/.test(m)),
   JSON.stringify(log.effortPreference?.mayAsk));
ck('the note says the tool refuses rather than frowns', /REFUSED/.test(log.effortPreference?.note || ''));
ck('the coach note points at it first', /effortPreference/.test(log.coachNote || ''));
ck('the Oath kinds are still advertised', (log.oathKinds || []).includes('chores'));
ck('an Oath is priced in minutes on the same ladder',
   (log.effortScale || []).find(t => t.reward === 'nat20')?.oathMinutes === 25);

console.log('\n— no agent may widen what it is allowed to ask of a body —');
const toolNames = await page.evaluate(() => window.arcana.tools());
ck('there is no set_effort_preference tool', !toolNames.some(n => /effort_pref|preference/i.test(n)),
   toolNames.filter(n => /pref/i.test(n)).join(','));
ck('the player-side setter exists instead', await page.evaluate(() => typeof window.arcana.setEffortPref) === 'function');
ck('a nonsense preference is rejected', !!(await setPref('whatever')).error);
ck('and leaves the old one standing', await page.evaluate(() => window.arcana.effortPref()) === 'oaths');

console.log('\n— the player can actually find it —');
const introText = await page.evaluate(() => document.querySelector('.intro-points')?.textContent || '');
ck('the intro card gives the Oath its own line', /swear an oath/i.test(introText));
ck('and says out loud that you need not exercise', /can.?t exercise|won.?t today|nothing physical/i.test(introText));
const railText = await page.evaluate(() => document.getElementById('fitness-panel')?.textContent || '');
ck('the party rail asks what the table may ask for', /may ask me for/i.test(railText));
const btns = await page.evaluate(() => [...document.querySelectorAll('#fitness-panel [data-pref]')].map(b => b.textContent.trim()));
ck('all four choices are on screen', btns.length === 4, btns.join(' · '));
ck('including Oaths only', btns.some(t => /oaths only/i.test(t)));
ck('the live one is marked for a screen reader',
   await page.evaluate(() => document.querySelector('#fitness-panel [data-pref="oaths"]')?.getAttribute('aria-checked')) === 'true');
ck('the group is a radiogroup, not a row of loose buttons',
   await page.evaluate(() => !!document.querySelector('#fitness-panel [role="radiogroup"]')));

console.log('\n— clicking it is enough —');
// It lives in the Party rail, one tab from the default view. That is where a
// player looks when they are thinking about what the table is charging them.
await page.click('[data-pane="pane-party"]');
ck('the control is one click from the default view',
   await page.evaluate(() => !document.getElementById('pane-party').hidden));
await page.click('#fitness-panel [data-pref="reps"]');
await page.waitForTimeout(120);
ck('a click sets the preference', await page.evaluate(() => window.arcana.effortPref()) === 'reps');
ck('the button redraws as the live one',
   await page.evaluate(() => document.querySelector('#fitness-panel [data-pref="reps"]')?.classList.contains('on')));
ck('and the story log says so, so it is not a silent change',
   await page.evaluate(() => window.__st.log.slice(-3).some(l => /may now ask/i.test(l.text))));
r = await offer('propose_oath', { label: 'the dishes', minutes: 10, reward: 'bonus+5' });
ck('and the refusal follows the click immediately', !!r.error);

console.log('\n— it survives a reload, which is the whole point of a standing preference —');
await setPref('oaths');
await page.reload();
await page.waitForFunction(() => window.arcana);
await page.waitForTimeout(300);
ck('still Oaths only after a reload', await page.evaluate(() => window.arcana.effortPref()) === 'oaths');
r = await offer('propose_challenge', { exercise: 'push-ups', reps: 10, reward: 'bonus+5' });
ck('and still refusing push-ups', !!r.error, r.error?.slice(0, 50) || '');

ck('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); srv.close();
process.exit(fail ? 1 : 0);
