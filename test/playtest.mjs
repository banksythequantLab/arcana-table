// Real playtest: the actual page, the real 17 WebMCP tools, the real system
// prompt, against the live Cloudflare Worker + gpt-5.6-luna.
// Served on :8080 so the Worker's origin allowlist accepts us.
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
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) errs.push(m.text()); });

// The sandbox's TLS proxy blocks the browser's own HTTPS, so relay just the
// DM request through Node — the page, tools and prompt are all still real.
let relayed = 0;
await page.route('https://arcana-dm.dj-b02.workers.dev/**', async route => {
  relayed++;
  try {
    const r = await fetch('https://arcana-dm.dj-b02.workers.dev', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:8080' },
      body: route.request().postData(),
    });
    await route.fulfill({ status: r.status, contentType: 'application/json', body: await r.text() });
  } catch (e) {
    await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: String(e.message || e) }) });
  }
});

await page.goto('http://localhost:8080/');
await page.waitForFunction(() => window.arcana);
await page.evaluate(() => { localStorage.clear(); });
await page.reload();
await page.waitForFunction(() => window.arcana);
await enterTable(page);

// The intro gate is the first thing a player meets — dismiss it as they would.
async function enterTable(page, { muted = true } = {}) {
  const gate = await page.$('#intro:not([hidden])');
  if (!gate) return;
  if (muted) await page.check('#intro-mute').catch(() => {});
  await page.click('#intro-go');
  await page.waitForSelector('#intro[hidden]', { timeout: 10000 }).catch(() => {});
}

const dmCount = () => page.evaluate(() => document.querySelectorAll('.say.dm:not(.thinking)').length);
const waitForDM = async (n, label) => {
  try {
    await page.waitForFunction(k => document.querySelectorAll('.say.dm:not(.thinking)').length >= k, n, { timeout: 90000 });
  } catch { console.log(`  ! timed out waiting for DM reply (${label})`); }
};

console.log('=== opening scene (DM speaks first, unprompted) ===');
await waitForDM(1, 'open');

const turns = [
  'What are we actually here to do? Tell me the job.',
  'I wade into the flooded hall, sword drawn, looking for whatever is guarding it.',
  'I attack it!',
  'I put everything into this swing — I want this thing down now.',
  'Good. We push on toward the vault.',
];
for (const t of turns) {
  const before = await dmCount();
  await page.fill('#say', t);
  await page.click('#say-btn');

  // A Heroic Effort offer blocks the DM until a human answers it — do the reps.
  const raced = await Promise.race([
    page.waitForSelector('#challenge-modal:not([hidden])', { timeout: 90000 }).then(() => 'challenge'),
    page.waitForFunction(k => document.querySelectorAll('.say.dm:not(.thinking)').length >= k, before + 1, { timeout: 90000 }).then(() => 'spoke'),
  ]).catch(() => 'timeout');

  if (raced === 'challenge') {
    const offer = await page.evaluate(() => ({
      title: document.querySelector('#chal-title').innerText,
      reward: document.querySelector('#chal-reward').innerText,
      reason: document.querySelector('#chal-reason').innerText,
    }));
    console.log(`\n  >>> HEROIC EFFORT OFFERED: ${offer.title} ${offer.reward}`);
    console.log(`      "${offer.reason}"`);
    await page.screenshot({ path: 'screens/challenge-live.png' });
    await page.click('#chal-accept');
    const reps = parseInt(offer.title, 10) || 10;
    for (let i = 0; i < reps; i++) { await page.waitForTimeout(90); await page.click('#chal-tap'); }
    console.log(`      ...${reps} reps done. Boost banked.\n`);
    await waitForDM(before + 1, 'after challenge');
  }
  await page.waitForTimeout(1500);
}

// Spend the earned boost so we can see it applied to a real roll.
const boostsBefore = await page.evaluate(() => window.arcana.call('get_fitness_log'));
if (boostsBefore.unspentBoosts?.bonus || boostsBefore.unspentBoosts?.setRoll != null || boostsBefore.unspentBoosts?.advantage) {
  const before = await dmCount();
  await page.fill('#say', 'I bring the blade down with everything I have.');
  await page.click('#say-btn');
  await waitForDM(before + 1, 'boosted strike');
  await page.waitForTimeout(1500);
}

const report = await page.evaluate(() => ({
  transcript: [...document.querySelectorAll('.say, .entry')].map(e => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean),
  toolCalls: [...document.querySelectorAll('#agent-log .acall')].map(e => e.innerText.replace(/\s+/g, ' ').trim()),
  tokens: [...document.querySelectorAll('canvas')].length,
}));
const board = await page.evaluate(() => window.arcana.call('get_board_state'));
const quest = await page.evaluate(() => window.arcana.call('get_quest'));

console.log('\n=== TRANSCRIPT ===');
report.transcript.forEach(l => console.log('  ' + l));
console.log('\n=== TOOL CALLS THE DM MADE ===');
[...new Set(report.toolCalls)].slice(0, 25).forEach(l => console.log('  ' + l));
console.log('\n=== QUEST AFTER PLAY ===');
console.log('  beat  :', quest.beatNumber, 'of', quest.of, '—', quest.current?.title);
console.log('  done  :', quest.completed.join(' · ') || '(none yet)');
console.log('  frozen:', quest.timeStopped, quest.downed ? JSON.stringify(quest.downed) : '');
console.log('\n=== BOARD AFTER PLAY ===');
console.log('  scene :', board.scene.title, '—', board.scene.mood);
console.log('  tokens:', board.tokens.map(t => `${t.name}(${t.x},${t.y}) ${t.hp}/${t.maxHp}`).join(' · '));
console.log('  combat:', JSON.stringify(board.combat));
console.log('\nDM round-trips:', relayed);
console.log('errors:', errs.length ? errs.join('; ') : 'none');

await page.screenshot({ path: 'screens/playtest.png' });
await browser.close();
server.close();
