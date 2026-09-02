// Records the demo screen bed: a real session against the live DM, captured to
// video. Derek intercuts his own push-up footage over the Heroic Effort beat.
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const p = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  try {
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(await readFile(join(root, p)));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(8080, r));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: 'screens/video', size: { width: 1280, height: 720 } },
});
const page = await ctx.newPage();

// Relay the DM call through Node (the sandbox proxy blocks browser HTTPS).
await page.route('https://arcana-dm.dj-b02.workers.dev/**', async route => {
  const isSpeak = route.request().url().endsWith('/speak');
  try {
    const r = await fetch(route.request().url(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:8080' },
      body: route.request().postData(),
    });
    if (isSpeak) {
      const buf = Buffer.from(await r.arrayBuffer());
      await route.fulfill({ status: r.status, contentType: 'audio/mpeg', body: buf });
    } else {
      await route.fulfill({ status: r.status, contentType: 'application/json', body: await r.text() });
    }
  } catch (e) {
    await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: String(e) }) });
  }
});

await page.goto('http://localhost:8080/');
await page.waitForFunction(() => window.arcana);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.arcana);
await enterTable(page, { muted: true, hold: 5000 });

// The intro gate is the first thing a player meets — dismiss it as they would.
async function enterTable(page, { muted = true, hold = 0 } = {}) {
  const gate = await page.$('#intro:not([hidden])');
  if (!gate) return;
  if (muted) await page.$eval('#intro-mute', el => { el.checked = true; }).catch(() => {});
  await page.waitForTimeout(hold);        // let the card read on camera
  await page.click('#intro-go');
  await page.waitForSelector('#intro[hidden]', { timeout: 10000 }).catch(() => {});
}

const dm = () => page.evaluate(() => document.querySelectorAll('.say.dm:not(.thinking)').length);
const waitDM = async (n, ms = 90000) => {
  try { await page.waitForFunction(k => document.querySelectorAll('.say.dm:not(.thinking)').length >= k, n, { timeout: ms }); }
  catch { /* keep rolling; the camera does not stop */ }
};

// Type like a person so the footage reads as real play.
const playerSays = async line => {
  const before = await dm();
  await page.click('#say');
  await page.type('#say', line, { delay: 38 });
  await page.waitForTimeout(400);
  await page.click('#say-btn');
  return before;
};

// Answer approval prompts on camera: let them sit long enough to read, then
// allow. This is the human-in-the-loop beat, so it belongs in the footage.
let approvals = 0;
const watchApprovals = async () => {
  while (!stop) {
    try {
      await page.waitForSelector('.approval', { timeout: 2500 });
      approvals++;
      await page.waitForTimeout(2200);              // hold it on screen
      await page.click('.approval .ok').catch(() => {});
    } catch { /* none pending */ }
  }
};
let stop = false;
const approvalLoop = watchApprovals();

let gotChallenge = false;
console.log('recording…');
await waitDM(1);                                   // opening scene
await page.waitForTimeout(2500);

for (const line of [
  "Yes — give me the 90 second warm-up.",
  'I wade into the flooded hall, sword drawn.',
  "I attack it! My shoulder's wrecked today though — no push-ups. But I've got a sink full of dishes I've been avoiding.",
  'Everything rides on this swing.',
  'I finish it.',
]) {
  const before = await playerSays(line);
  const outcome = await Promise.race([
    page.waitForSelector('#challenge-modal:not([hidden])', { timeout: 90000 }).then(() => 'challenge'),
    page.waitForSelector('#oath:not([hidden])', { timeout: 90000 }).then(() => 'oath'),
    page.waitForSelector('#warmup:not([hidden])', { timeout: 90000 }).then(() => 'warmup'),
    page.waitForFunction(k => document.querySelectorAll('.say.dm:not(.thinking)').length >= k, before + 1, { timeout: 90000 }).then(() => 'spoke'),
  ]).catch(() => 'timeout');

  if (outcome === 'warmup') {
    console.log('  warm-up on camera — letting three stretches run');
    await page.waitForTimeout(9000);              // three stretches at 15s, sped past
    await page.evaluate(() => window.arcana.finishWarmup());
    await waitDM(before + 1);
    await page.waitForTimeout(1800);
  }

  if (outcome === 'oath') {
    console.log('  OATH offered on camera');
    await page.waitForTimeout(4200);              // let the offer read
    await page.click('#oath-accept');
    await page.waitForTimeout(3400);              // the locked table, clock ticking
    await page.evaluate(() => { window.__st.oath.endsAt = Date.now() - 1; });
    await page.waitForTimeout(1400);
    await page.click('#oath-keep');
    await waitDM(before + 1);
    await page.waitForTimeout(2200);
  }

  if (outcome === 'challenge') {
    const reps = parseInt(await page.innerText('#chal-title'), 10) || 10;
    gotChallenge = true;
    console.log(`  challenge offered: ${reps} reps — holding on screen for the cut`);
    await page.waitForTimeout(3800);               // let the offer breathe on camera
    await page.click('#chal-accept');
    for (let i = 0; i < reps; i++) { await page.waitForTimeout(340); await page.click('#chal-tap'); }
    await page.waitForTimeout(900);
    await waitDM(before + 1);
  }
  await page.waitForTimeout(2600);
  if (gotChallenge) break;                          // the money beat is in the can
}

// Land on the board so the last frame is the game, not a menu.
await page.waitForTimeout(2500);
stop = true; await approvalLoop.catch(() => {});
console.log('approvals answered on camera:', approvals);
console.log('done. board:', JSON.stringify((await page.evaluate(() => window.arcana.call('get_board_state'))).combat));

await ctx.close();                                 // flushes the video file
await browser.close();
server.close();
