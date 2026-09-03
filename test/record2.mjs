// Records the demo bed against the LIVE DM — and this time keeps two things the
// first recorder threw away: the Dungeon Master's own voice, and the clock.
//
//  * Every /speak call the page makes is relayed through Node anyway (the
//    sandbox blocks browser HTTPS), so the MP3 that comes back is saved with
//    the moment it started playing. The DM's voice can then be laid under the
//    footage at exactly the second its words appeared on screen.
//  * Every beat the cut needs — warm-up, first fight, the push-up offer, the
//    natural 20, the Oath, the task list — is stamped as it happens, so
//    assemble2.py derives its footage offsets from marks.json instead of
//    someone eyeballing a scrub bar. "The words do not always match the
//    screen" was that eyeballing.
//
// The DM is live and improvises. The beats the video depends on are forced
// through the same tool surface the DM uses if it has not reached for them
// itself by the time the script needs them — the same call, same card, same
// log line; only the timing is ours.
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { extname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const OUT = join(fileURLToPath(import.meta.url), '..', 'screens', 'video2');
await mkdir(join(OUT, 'dm'), { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const p = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  try { res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
        res.end(await readFile(join(root, p))); } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(8120, r));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
});
const T0 = Date.now();                       // the video starts with the context
const now = () => (Date.now() - T0) / 1000;
const marks = {};
const mark = (k) => { if (marks[k] == null) { marks[k] = +now().toFixed(2); console.log(`  ⏱ ${k} @ ${marks[k]}s`); } };
const dmClips = [];

const page = await ctx.newPage();
let clipN = 0;
await page.route('https://arcana-dm.dj-b02.workers.dev/**', async route => {
  const isSpeak = route.request().url().endsWith('/speak');
  try {
    const r = await fetch(route.request().url(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://arcana-table.pages.dev' },
      body: route.request().postData(),
    });
    if (isSpeak) {
      const buf = Buffer.from(await r.arrayBuffer());
      const text = JSON.parse(route.request().postData() || '{}').text || '';
      const file = `dm/${String(clipN++).padStart(2, '0')}.mp3`;
      await writeFile(join(OUT, file), buf);
      // Stamp when playback BEGINS — the response is what the page plays next.
      dmClips.push({ t: +now().toFixed(2), file, text });
      console.log(`  🔊 DM @ ${now().toFixed(1)}s: ${text.slice(0, 70)}`);
      await route.fulfill({ status: r.status, contentType: 'audio/mpeg', body: buf });
    } else {
      await route.fulfill({ status: r.status, contentType: 'application/json', body: await r.text() });
    }
  } catch (e) {
    await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: String(e) }) });
  }
});

await page.goto('http://localhost:8120/');
await page.waitForFunction(() => window.arcana);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.arcana);
await page.waitForTimeout(4500);                                  // let the intro card read
mark('intro');
await page.click('#intro-type');
mark('table');

const dmCount = () => page.evaluate(() => document.querySelectorAll('.say.dm:not(.thinking)').length);
const waitDM = async (n, ms = 60000) => {
  try { await page.waitForFunction(k => document.querySelectorAll('.say.dm:not(.thinking)').length >= k, n, { timeout: ms }); }
  catch { console.log('  (DM slow — rolling on)'); }
};
// The DM now offers effort on its own (the roll gate at work), so a card can be
// up at any moment. Clear it the way a player would, then wait for the input.
const clearCards = async () => {
  for (const sel of ['#chal-skip', '#chal-decline', '#tasks-skip', '#tasks-claim', '#oath-quit', '#oath-decline', '#warm-offer-no']) {
    if (await visible(sel)) { await page.waitForTimeout(1200); await page.click(sel).catch(() => {}); await page.waitForTimeout(400); }
  }
};
const say = async (line) => {
  await clearCards();
  await page.waitForFunction(() => !document.getElementById('say').disabled, null, { timeout: 60000 }).catch(() => {});
  await clearCards();
  const before = await dmCount();
  await page.click('#say');
  await page.type('#say', line, { delay: 34 });
  await page.waitForTimeout(350);
  await page.click('#say-btn');
  return before;
};
const visible = (sel) => page.isVisible(sel).catch(() => false);
const call = (n, a = {}) => page.evaluate(([n, a]) => window.arcana.call(n, a), [n, a]);

// Approvals answered on camera, after a beat.
let stop = false;
(async () => { while (!stop) { try {
  await page.waitForSelector('.approval', { timeout: 1500 });
  await page.waitForTimeout(1800); await page.click('.approval .ok').catch(() => {});
} catch {} } })();

// Stamp the gold die the moment it is actually on screen — never by assumption.
(async () => { while (!stop) { try {
  await page.waitForSelector('#dice-overlay.nat20', { timeout: 1000, state: 'visible' });
  mark('nat20');
} catch {} await page.waitForTimeout(250); } })();

console.log('recording…');
try {

// ── 1. opening + the warm-up card ───────────────────────────────────────────
await waitDM(1, 45000);
mark('opening');
await page.waitForTimeout(1500);
if (!(await visible('#warm-offer'))) { await call('start_warmup', {}); }
await page.waitForSelector('#warm-offer:not([hidden])', { timeout: 8000 }).catch(() => {});
mark('warm_offer');
await page.waitForTimeout(2600);                                  // the card reads
await page.click('#warm-offer [data-plan="90s"]').catch(() => {});
await page.waitForSelector('#warmup:not([hidden])', { timeout: 5000 }).catch(() => {});
mark('warmup');
// Two stretches, fast-forwarded: 15s holds are not video.
for (let i = 0; i < 2; i++) {
  await page.waitForTimeout(2600);
  await page.evaluate(() => { if (window.__st.warmup) window.__st.warmup.remaining = 2; });
  await page.waitForTimeout(2400);
}
await page.evaluate(() => window.arcana.finishWarmup({ early: false }));
await page.waitForTimeout(1200);

// ── 2. into the hall, and the first fight ───────────────────────────────────
let b = await say('I wade into the flooded hall, sword drawn.');
await waitDM(b + 1);
await page.waitForTimeout(2200);
mark('hall');
b = await say('Whatever that is in the water — I attack it!');
await Promise.race([
  page.waitForSelector('#combat-strip:not([hidden])', { timeout: 45000 }),
  page.waitForFunction(k => document.querySelectorAll('.say.dm:not(.thinking)').length >= k, b + 1, { timeout: 45000 }),
]).catch(() => {});
if (!(await visible('#combat-strip'))) {
  // The DM described a fight without starting one. Put a guard in the water
  // and start it — the same two calls it should have made.
  await call('add_token', { name: 'Drowned Guard', kind: 'monster', art: 'skeleton', x: 9, y: 6, hp: 14 });
  await call('start_combat', {});
}
mark('combat');
await waitDM(b + 1, 30000);
await page.waitForTimeout(2600);

// ── 3. the money beat: ten push-ups for a natural 20 ────────────────────────
// The DM prices ten push-ups at +5 (correctly), but the narration and the title
// card promise the twenty — so this offer is made before the DM's, through the
// same tool. Anything the DM already put up is skipped on camera first.
await clearCards();
await page.evaluate(() => { window.__st.challenge = null; window.__st.tasks = null; window.__st.oath = null; });
await call('propose_challenge', { exercise: 'push-ups', reps: 10, reward: 'nat20',
  reason: 'The blade comes down. Ten push-ups, and I let the fates hand you a twenty.' });
await page.waitForSelector('#challenge-modal:not([hidden])', { timeout: 8000 }).catch(() => {});
mark('challenge_offer');
await page.waitForTimeout(3600);                                  // the offer breathes
await page.click('#chal-accept').catch(() => {});
mark('challenge_active');
const reps = parseInt(await page.innerText('#chal-title').catch(() => '10'), 10) || 10;
for (let i = 0; i < reps; i++) { await page.waitForTimeout(330); await page.click('#chal-tap').catch(() => {}); }
await page.waitForTimeout(900);
mark('challenge_done');
// Spend it, on camera: the gold die.
b = await say('Everything rides on this swing.');
await Promise.race([
  page.waitForSelector('#dice-overlay.nat20', { timeout: 40000 }),
  page.waitForFunction(k => document.querySelectorAll('.say.dm:not(.thinking)').length >= k, b + 1, { timeout: 40000 }),
]).catch(() => {});
if (marks.nat20 == null) {
  // The set die is still armed if the DM did not roll — roll it ourselves.
  await clearCards();
  await call('roll_dice', { formula: 'd20', reason: 'Brannok, everything on the swing' });
  await page.waitForTimeout(1500);
}
await page.waitForTimeout(3400);
await waitDM(b + 1, 20000);
await page.waitForTimeout(1800);

// ── 4. the Oath ─────────────────────────────────────────────────────────────
b = await say("My shoulder's shot — no more push-ups today. But I've got a sink full of dishes I've been avoiding.");
await Promise.race([
  page.waitForSelector('#oath:not([hidden])', { timeout: 40000 }),
  page.waitForFunction(k => document.querySelectorAll('.say.dm:not(.thinking)').length >= k, b + 1, { timeout: 40000 }),
]).catch(() => {});
if (!(await visible('#oath'))) {
  await page.evaluate(() => { window.__st.challenge = null; window.__st.tasks = null; });
  await call('propose_oath', { label: 'clear the sink full of dishes', kind: 'chores', minutes: 10, reward: 'nat20',
    reason: 'Then swear it. The dishes for the dagger — and the same twenty waits for you when you are back.' });
  await page.waitForSelector('#oath:not([hidden])', { timeout: 6000 }).catch(() => {});
}
mark('oath_offer');
await page.waitForTimeout(4000);
await page.click('#oath-accept').catch(() => {});
mark('oath_active');
await page.waitForTimeout(3600);                                  // the locked table, clock running
await page.evaluate(() => { if (window.__st.oath) window.__st.oath.endsAt = Date.now() - 1; });
await page.waitForTimeout(1200);
await page.click('#oath-keep').catch(() => {});
mark('oath_kept');
await waitDM(b + 1, 20000);
await page.waitForTimeout(1600);

// ── 5. micro-bursts: the task list ──────────────────────────────────────────
await page.evaluate(() => { window.__st.challenge = null; window.__st.tasks = null; window.__st.oath = null; });
await call('propose_task_list', { items: [
  { exercise: 'push-ups', mode: 'reps', amount: 5 }, { exercise: 'plank', mode: 'hold', amount: 20 },
  { exercise: 'squats', mode: 'reps', amount: 5 } ], reason: 'Between fights. Take what you like.' });
await page.waitForSelector('#tasks:not([hidden])', { timeout: 6000 }).catch(() => {});
mark('tasklist');
await page.waitForTimeout(2600);
await page.click('#tasks-list [data-task="0"]').catch(() => {});
await page.waitForTimeout(1300);
await page.click('#tasks-list [data-task="2"]').catch(() => {});
await page.waitForTimeout(1600);
await page.click('#tasks-claim').catch(() => {});
mark('tasklist_claimed');
await page.waitForTimeout(1500);

// ── 6. the log filling: a couple more exchanges ─────────────────────────────
b = await say('I finish it, and we push on for the vault.');
await waitDM(b + 1, 45000);
mark('log');
await page.waitForTimeout(3000);
mark('end');

} catch (e) {
  console.log('RECORDER ERROR (keeping what we have):', String(e).split('\n')[0]);
  mark('end');
} finally {
  stop = true;
  await page.waitForTimeout(600);
  await writeFile(join(OUT, 'marks.json'), JSON.stringify({ marks, dm: dmClips, t0: T0 }, null, 2));
  await ctx.close();                                  // flushes the video
  await browser.close();
  server.close();
}
console.log('\nmarks:', JSON.stringify(marks));
console.log(`${dmClips.length} DM clips captured`);
