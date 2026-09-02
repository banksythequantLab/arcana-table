// Hands-free had the DM hearing itself: its own line came back through the mic,
// was transcribed, and was submitted as the player's turn. Headless Chromium has
// no SpeechRecognition, so we install a fake one we can drive — which is the
// only way to test this path at all, and lets us replay the exact failure.
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
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });

// A SpeechRecognition stand-in, installed before any app code runs.
await ctx.addInitScript(() => {
  class FakeSR {
    constructor() { this.lang = 'en-US'; this.continuous = false; this.interimResults = true; }
    start() { this.running = true; window.__sr = this; }
    stop()  { this.running = false; this.onend && this.onend(); }
    abort() { this.running = false; setTimeout(() => this.onend && this.onend(), 0); }
  }
  window.SpeechRecognition = FakeSR;
  // Drive a final transcript into whatever recognizer is currently open.
  window.__hear = text => {
    const sr = window.__sr;
    if (!sr || !sr.onresult) return 'no recognizer open';
    sr.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] });
    return 'delivered';
  };
});
const page = await ctx.newPage();

// The DM answers, and its /speak audio is a short real mp3 so playback ends.
const MP3 = (await readFile('/tmp/tiny.b64', 'utf8')).trim();
await page.route('**/arcana-dm*/**', async route => {
  if (route.request().url().endsWith('/speak')) {
    return route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.from(MP3, 'base64') });
  }
  return route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ content: 'The door groans open and cold air spills out across the flagstones.', tool_calls: [] }) });
});

await page.goto('http://localhost:8080/');
await page.waitForFunction(() => window.arcana);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.arcana);

let pass = 0, fail = 0;
const ck = (l, ok, x = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? '✓' : '✗ FAIL'} ${l}${x ? '  ' + x : ''}`); };
const V = () => page.evaluate(async () => {
  const v = (await import('/js/voice.js')).voice;
  return { listening: v.listening, speaking: v.speaking, handsFree: v.handsFree, ignored: v.echoesIgnored };
});
const turns = () => page.evaluate(async () =>
  (await import('/js/dm.js')).chat.messages.filter(m => m.role === 'user').map(m => m.text));

await page.click('#intro-voice');                 // hands-free, the path that broke
// The opening line is spoken immediately, so the mic is legitimately shut for a
// moment; what matters is that hands-free is on and the ear opens once it can.
// Assert the wait itself: re-reading afterwards races the next spoken line,
// which legitimately shuts the mic again.
const opened = await page.waitForFunction(async () =>
  (await import('/js/voice.js')).voice.listening, null, { timeout: 8000 })
  .then(() => true).catch(() => false);
const v0 = await V();
ck('hands-free turns on and opens the mic once the DM stops', v0.handsFree && opened,
   `opened=${opened} ${JSON.stringify(v0)}`);

console.log('— the DM speaking shuts the ear —');
const speak = page.evaluate(async () =>
  (await import('/js/voice.js')).say('The door groans open and cold air spills out across the flagstones.'));
await page.waitForFunction(async () =>
  (await import('/js/voice.js')).voice.speaking, null, { timeout: 8000 }).catch(() => {});
const mid = await V();
ck('the mic is closed while the DM talks', mid.speaking && !mid.listening, JSON.stringify(mid));

console.log('— and its own words are refused even if they get through —');
const leaked = await page.evaluate(() => window.__hear('The door groans open and cold air spills out'));
await speak;
const afterSpeak = await V();
ck('a transcript captured while speaking is dropped', afterSpeak.ignored >= 1,
   `ignored ${afterSpeak.ignored} (${leaked})`);
ck('it never became a player turn', (await turns()).length === 0, JSON.stringify(await turns()));

console.log('— the tail covers the room echo —');
await page.waitForTimeout(120);
const inTail = await V();
ck('the mic stays shut through the echo tail', !inTail.listening, JSON.stringify(inTail));
const reopenedOk = await page.waitForFunction(async () =>
  (await import('/js/voice.js')).voice.listening, null, { timeout: 10000 })
  .then(() => true).catch(() => false);
const reopened = await V();
ck('and reopens once the room is quiet', reopenedOk, JSON.stringify(reopened));

console.log('— a late echo of an old line is still caught —');
const before = (await V()).ignored;
await page.evaluate(() => window.__hear('cold air spills out across the flagstones'));
await page.waitForFunction(async n =>
  (await import('/js/voice.js')).voice.echoesIgnored > n, before, { timeout: 6000 }).catch(() => {});
ck('a fragment of what the DM said is refused', (await V()).ignored > before);
ck('still no player turn from it', (await turns()).length === 0, JSON.stringify(await turns()));

console.log('— but the player is still heard —');
// This assertion is about the FILTER, not the timing: a line that is not an
// echo must reach the DM. The reopen schedule is what the two assertions above
// cover, so pin the mic open here rather than racing the tail — otherwise a
// loaded machine fails this for a reason that has nothing to do with echoes.
const LINE = 'I kick the door the rest of the way open';
await page.evaluate(async () => {
  const V = await import('/js/voice.js');
  V.shutUp();                                  // stop any audio still playing
  await new Promise(r => setTimeout(r, 800));  // let the tail expire for real
  V.setHandsFree(true, null);
});
await page.waitForFunction(async () =>
  (await import('/js/voice.js')).voice.listening &&
  !(await import('/js/voice.js')).inQuietPeriod(), null, { timeout: 10000 }).catch(() => {});
const delivered = await page.evaluate(l => window.__hear(l), LINE);
await page.waitForFunction(async () =>
  (await import('/js/dm.js')).chat.messages.some(m => m.role === 'user'), null, { timeout: 6000 }).catch(() => {});

ck('a real turn goes through untouched', (await turns()).includes(LINE),
   `${delivered} · ${JSON.stringify(await turns())}`);

console.log('— and the DM cannot count your reps for you —');
await page.evaluate(async () => {
  const A = await import('/js/actions.js');
  A.proposeChallenge({ mode: 'reps', exercise: 'push-ups', reps: 10, reward: 'nat20', reason: 'test' });
  A.acceptChallenge();
});
const progress0 = await page.evaluate(() => window.__st.challenge.progress);
await page.evaluate(async () => {
  const V = await import('/js/voice.js');
  // The DM offering the challenge out loud, heard by its own mic.
  await V.say('Ten push-ups, and the fates hand you a twenty.');
  window.__hear('ten push-ups and the fates hand you a twenty');
});
await page.waitForTimeout(200);
const progress1 = await page.evaluate(() => window.__st.challenge?.progress ?? -1);
ck('the DM saying "ten push-ups" does not count ten reps', progress1 === progress0,
   `progress ${progress0} → ${progress1}`);

console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); srv.close();
process.exit(fail ? 1 : 0);
