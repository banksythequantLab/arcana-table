// The two things a player reported: the warm-up circling the neck, and the
// party standing still while the DM narrated them walking off. Both are the
// kind of bug that passes every existing assertion, so they get their own.
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.mp3':'audio/mpeg' };
const srv = createServer(async (q, s) => {
  const p = q.url === '/' ? '/index.html' : q.url.split('?')[0];
  try { s.writeHead(200, { 'content-type': MIME[extname(p)] || 'text/plain' });
        s.end(await readFile(join(root, p))); } catch { s.writeHead(404); s.end(); }
});
await new Promise(r => srv.listen(8080, r));

const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
await page.route('**/arcana-dm*/**', r => r.abort());     // no DM needed; we drive the actions
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
const ck = (label, ok, extra = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? '✓' : '✗ FAIL'} ${label}${extra ? '  ' + extra : ''}`); };

console.log('— the warm-up spans the body —');
for (const [plan, want] of [['90s', 6], ['3min', 12]]) {
  const r = await page.evaluate(async p => {
    const out = await window.arcana.call('start_warmup', { plan: p });
    window.arcana.finishWarmup({ early: true });
    return out;
  }, plan);
  const names = r.order || [];
  ck(`${plan}: ${want} stretches`, names.length === want, names.length + '');
  const necks = names.filter(n => /^Neck/.test(n)).length;
  ck(`${plan}: not a neck routine`, necks <= 1, `${necks} neck stretches`);
  ck(`${plan}: reaches the legs`, names.some(n => /Quad|Hamstring|Calf|Ankle/.test(n)), names.join(' · '));
  const split = names.filter(n => n.includes(' · ')).filter(n => {
    const base = n.split(' · ')[0];
    return names.filter(m => m.startsWith(base + ' · ')).length !== 2;
  });
  ck(`${plan}: no side left cold`, split.length === 0, split.join(','));
}

// Walking the whole plan must never show the same stretch twice.
const walked = await page.evaluate(async () => {
  await window.arcana.call('start_warmup', { plan: '90s' });
  const seen = [];
  for (let i = 0; i < 6; i++) { seen.push(window.arcana.currentStretch().name); window.arcana.skipStretch(); }
  window.arcana.finishWarmup({ early: true });
  return seen;
});
ck('walking the plan never repeats a stretch', new Set(walked).size === walked.length, walked.join(' · '));

console.log('— a hold is a hold, not a rep exercise —');
// mode "hold" used to be validated against the REPS list, so every plank and
// wall sit the DM offered came back "Unknown exercise" and the mechanic the
// intro card advertises never once worked.
for (const hold of ['plank', 'wall sit', 'squat hold']) {
  const r = await page.evaluate(async h => {
    const A = await import('/js/actions.js');
    const out = A.proposeChallenge({ mode: 'hold', exercise: h, seconds: 30, reward: 'bonus+2', reason: 'test' });
    const st = window.__st.challenge ? { ...window.__st.challenge } : null;
    A.declineChallenge();
    return { st, err: out?.error };
  }, hold);
  ck(`"${hold}" can actually be offered`, !!r.st && !r.err, r.err || `${r.st?.seconds}s ${r.st?.exercise}`);
}
const crossed = await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  const bad = A.proposeChallenge({ mode: 'hold', exercise: 'push-ups', seconds: 30, reward: 'bonus+2' });
  A.declineChallenge?.();
  return bad?.error;
});
ck('a rep exercise passed as a hold is refused clearly', /not a hold/.test(crossed || ''), crossed);
const log = await page.evaluate(async () => (await import('/js/actions.js')).getFitnessLog());
ck('the DM is given both lists', Array.isArray(log.availableHolds) && log.availableHolds.length > 0,
   `holds: ${log.availableHolds?.join(', ')}`);
ck('the two lists do not overlap', !log.availableHolds.some(h => log.availableExercises.includes(h)));

console.log('— the party actually moves —');
const before = await page.evaluate(async () => (await window.arcana.call('get_board_state')).tokens
  .filter(t => t.kind === 'pc').map(t => `${t.name}@${t.x},${t.y}`));
const moved = await page.evaluate(() => window.arcana.call('move_party', { x: 16, y: 10 }));
const after = await page.evaluate(async () => (await window.arcana.call('get_board_state')).tokens
  .filter(t => t.kind === 'pc').map(t => ({ name: t.name, x: t.x, y: t.y })));
ck('move_party is a registered tool', !moved.error, JSON.stringify(moved).slice(0, 90));
ck('every hero moved', after.every((t, i) => `${t.name}@${t.x},${t.y}` !== before[i]), JSON.stringify(after));
ck('the leader is on the requested cell', after.some(t => t.x === 16 && t.y === 10));
ck('the party stays together', after.every(t =>
  Math.max(Math.abs(t.x - 16), Math.abs(t.y - 10)) <= 2), JSON.stringify(after));
ck('nobody is stacked on anyone', new Set(after.map(t => `${t.x},${t.y}`)).size === after.length);
const fog = await page.evaluate(() => window.__st.revealed.length);
ck('the fog lifted at the destination', await page.evaluate(() =>
  window.__st.revealed.includes('16,10')), `${fog} cells revealed`);

// Walking lights the corridor, not just the two ends of it. A gap in the
// middle of a walked path reads as a rendering bug.
const gaps = await page.evaluate(() => {
  window.__st.revealed = [];
  window.arcana.call('move_party', { x: 2, y: 2 });
  const before = window.__st.tokens.find(t => t.kind === 'pc');
  const from = { x: before.x, y: before.y };
  window.__st.revealed = [];
  return window.arcana.call('move_party', { x: 18, y: 12 }).then(() => {
    const to = { x: 18, y: 12 };
    const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
    const dark = [];
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(from.x + ((to.x - from.x) * i) / steps);
      const y = Math.round(from.y + ((to.y - from.y) * i) / steps);
      if (!window.__st.revealed.includes(`${x},${y}`)) dark.push(`${x},${y}`);
    }
    return { dark, from, to, lit: window.__st.revealed.length };
  });
});
ck('every cell along a walk is lit, with no dark middle', gaps.dark.length === 0,
   gaps.dark.length ? `dark: ${gaps.dark.join(' ')}` : `${gaps.lit} cells lit from (${gaps.from.x},${gaps.from.y}) to (${gaps.to.x},${gaps.to.y})`);
const wall = await page.evaluate(() => window.arcana.call('move_party', { x: 0, y: 0 }));
// Travel is not a precision act. A wall used to be an error the DM had to
// notice and retry, and a live run burned three calls on exactly that.
ck('a wall no longer fails the move', !wall.error, JSON.stringify(wall).slice(0, 80));
ck('the party lands on open floor instead', await page.evaluate(async () => {
  const { isWalkable } = await import('/js/state.js');
  return window.__st.tokens.filter(t => t.kind === 'pc').every(t => isWalkable(t.x, t.y));
}));
ck('and it says where they actually stopped', /is wall/.test(wall.note || ''), wall.note || '');

console.log('— an offer is a tool call, never a sentence —');
// The player saw this exact line, and no card ever appeared. The detector that
// sends such a reply back is held to it, and to the near-misses it must NOT
// catch, because bouncing ordinary narration would be worse than the bug.
const prose = await page.evaluate(async () => {
  const { looksLikeProseOffer } = await import('/js/dm.js');
  const yes = [
    'Five push-ups would put a +2 edge on your next roll, if you want to stake effort before the clash; otherwise, choose your move and we\u2019ll resolve it normally.',
    'Ten push-ups and I\u2019ll let the fates hand you a natural twenty.',
    'Hold a plank for thirty seconds and take advantage on the swing.',
    'Swear an oath \u2014 the dishes, ten minutes \u2014 and the same +5 waits for you.',
    'Give me five squats for a +2 bonus.',
  ];
  const no = [
    'The drowned guard rises from the water, rusted blade dripping. What do you do?',
    'Brannok\u2019s sword bites deep and the creature reels. Mira, you\u2019re up.',
    'You push open the iron door. Beyond it, stairs descend into the dark.',
    'The push-ups are done \u2014 your arms burn, and the die is yours. Roll when ready.',
    'You wade in up to your knees; the water is cold and the sink of mud pulls at your boots.',
  ];
  return { caught: yes.map(looksLikeProseOffer), spared: no.map(looksLikeProseOffer) };
});
ck('the exact line the player saw is caught', prose.caught[0] === true);
ck('so are four other ways of saying it', prose.caught.every(Boolean), JSON.stringify(prose.caught));
ck('plain narration is never mistaken for an offer', prose.spared.every(v => v === false), JSON.stringify(prose.spared));
ck('finished push-ups being narrated is not an offer either', prose.spared[3] === false);

console.log('— and the loop sends a prose offer back until the call is made —');
// A DM that answers Derek\'s exact sentence with no tool call, and only makes the
// call when told to. The player must never see the first version.
let asks = 0;
await page.unroute('**/arcana-dm*/**').catch(() => {});
await page.route(/arcana-dm.*workers\.dev\/speak/, r => r.fulfill({ status: 200, contentType: 'audio/mpeg', body: '' }));
await page.route(/arcana-dm.*workers\.dev\/?$/, async r => {
  asks++;
  const body = JSON.parse(r.request().postData() || '{}');
  const bounced = (body.messages || []).some(m => m.role === 'system' && /DESCRIBED an offer/.test(m.content || ''));
  if (!bounced) {
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      content: 'Five push-ups would put a +2 edge on your next roll, if you want to stake effort before the clash; otherwise, choose your move and we\u2019ll resolve it normally.',
      tool_calls: [] }) });
  }
  if (!(body.messages || []).some(m => m.role === 'tool')) {
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      content: null,
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'propose_challenge',
        arguments: JSON.stringify({ exercise: 'push-ups', reps: 5, reward: 'bonus+2', reason: 'Before the clash.' }) } }] }) });
  }
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    content: 'The guard braces. Five push-ups, and the edge is yours.', tool_calls: [] }) });
});
await page.evaluate(() => { window.__st.challenge = null; window.__st.tasks = null; window.__st.oath = null; });
const dmBefore = await page.evaluate(async () => (await import('/js/dm.js')).chat.messages.filter(m => m.role === 'dm').length);
await page.evaluate(async () => (await import('/js/dm.js')).sendToDM('I face the guard.'));
await page.waitForFunction(() => !!window.__st.challenge, null, { timeout: 15000 }).catch(() => {});
const bounce = await page.evaluate(async () => {
  const dm = await import('/js/dm.js');
  return {
    dmLines: dm.chat.messages.filter(m => m.role === 'dm').map(m => m.text),
    challenge: window.__st.challenge ? { exercise: window.__st.challenge.exercise, reps: window.__st.challenge.reps } : null,
    logged: window.__st.log.some(l => /described a bargain in words/i.test(l.text)),
  };
});
const newLines = bounce.dmLines.slice(dmBefore);
ck('the DM was asked more than once', asks >= 2, `${asks} asks`);
ck('a challenge card is on the table', bounce.challenge?.exercise === 'push-ups' && bounce.challenge?.reps === 5, JSON.stringify(bounce.challenge));
ck('the prose version was never spoken to the player', !newLines.some(l => /would put a \+2 edge/.test(l)), JSON.stringify(newLines).slice(0, 120));
ck('the corrected line was', newLines.some(l => /edge is yours/.test(l)));
ck('and the story log says what happened', bounce.logged);

console.log('— the drowned guard is in the hall from the start, and walking up to it starts the fight —');
// "No skeleton on start." The first beat's guard is on the board before the DM
// says a word, and the party reaching it is what begins combat — not the DM
// remembering to call start_combat.
await page.evaluate(() => localStorage.clear());
await page.reload(); await page.waitForFunction(() => window.arcana);
await page.click('#intro-type');
await page.waitForSelector('#warm-offer:not([hidden])', { timeout: 3000 }).catch(() => {});
if (await page.isVisible('#warm-offer-no').catch(() => false)) { await page.click('#warm-offer-no'); await page.waitForTimeout(150); }
const guard = await page.evaluate(() => window.__st.tokens.find(t => t.name === 'Drowned Guard'));
ck('a fresh table has the Drowned Guard on the board', !!guard && guard.kind === 'monster' && guard.art === 'skeleton', JSON.stringify(guard || {}).slice(0, 80));
ck('it is the first beat\'s own monster', await page.evaluate(async () => (await import('/js/state.js')).QUEST.beats[0].spawn?.name === 'Drowned Guard'));
ck('and the party starts out of its reach, so the warm-up is not an ambush', await page.evaluate(() => !window.__st.combat.active));
const call = (n, a = {}) => page.evaluate(([n, a]) => window.arcana.call(n, a), [n, a]);
const stillNo = await call('advance_quest', { summary: 'we tiptoe past' });
ck('the first beat will not clear while it stands', !!stillNo.error && stillNo.mustDefeat === 'Drowned Guard', (stillNo.error || '').slice(0, 60));
const walk = await call('move_party', { x: 6, y: 6 });
ck('walking the party up to it starts the fight by itself', walk.combatStarted === true && (walk.ambush || []).includes('Drowned Guard'), JSON.stringify(walk).slice(0, 120));
ck('with the party first in the order, so the player gets the opening move', await page.evaluate(() => {
  const o = window.__st.combat.order.map(id => window.__st.tokens.find(t => t.id === id)?.kind); return window.__st.combat.active && o[0] === 'pc'; }));
ck('and the guard is in that order', await page.evaluate(() => window.__st.combat.order.includes(window.__st.tokens.find(t => t.name === 'Drowned Guard').id)));

console.log('— the opening is pre-recorded: the DM is talking before the model is even asked —');
// Reload to a fresh table with the DM endpoint BLOCKED. The opening line, the
// warm-up card and the audio request must all happen anyway, from the file.
await page.unroute(/arcana-dm.*workers\.dev\/?$/).catch(() => {});
await page.unroute(/arcana-dm.*workers\.dev\/speak/).catch(() => {});
let dmCalls = 0, ttsCalls = 0, openingFetched = false;
await page.route('**/arcana-dm*/**', r => { if (/\/speak$/.test(r.request().url())) ttsCalls++; else dmCalls++; r.abort(); });
await page.route('**/assets/voice/opening.mp3', r => { openingFetched = true; r.continue(); });
await page.evaluate(() => localStorage.clear());
await page.reload(); await page.waitForFunction(() => window.arcana);
await page.click('#intro-type');
await page.waitForSelector('#warm-offer:not([hidden])', { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(600);
const opening = await page.evaluate(async () => {
  const dm = await import('/js/dm.js');
  return { first: dm.chat.messages[0]?.text || '', line: dm.OPENING_LINE, card: !document.getElementById('warm-offer').hidden,
           logged: window.__st.agentLog.some(e => e.tool === 'start_warmup') };
});
ck('the first thing the DM says is the scripted opening', opening.first === opening.line, opening.first.slice(0, 60));
ck('it says so without a single call to the model', dmCalls === 0, `${dmCalls} DM calls`);
ck('and without a TTS round trip', ttsCalls === 0, `${ttsCalls} TTS calls`);
ck('the pre-recorded file was requested instead', openingFetched);
ck('the warm-up card is already on the table', opening.card);
ck('and it went through the tool path, so it is in the Agent Log', opening.logged);
ck('the opening audio ships with the site', (await page.evaluate(async () => (await fetch('/assets/voice/opening.mp3')).ok)));

console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); srv.close();
process.exit(fail ? 1 : 0);
