// Plays the build that is actually deployed, gate to first tool call, against
// the real Worker — the check that catches what unit tests cannot: a shipped
// site that loads but does not play. Byte-compare the files against pages.dev
// first (curl | sha256sum), then run this.
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { fileURLToPath } from 'url';

// The sandbox proxy blocks browser HTTPS, so the page cannot be pointed at
// pages.dev directly. These files were byte-compared against the deployed ones
// first, so serving them locally plays exactly what is live — and the DM calls
// still go to the real Worker.
const root = join(fileURLToPath(import.meta.url), '..', '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml' };
const srv = createServer(async (q, s) => {
  const p = q.url === '/' ? '/index.html' : q.url.split('?')[0];
  try { s.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
        s.end(await readFile(join(root, p))); } catch { s.writeHead(404); s.end(); }
});
await new Promise(r => srv.listen(8080, r));
const SITE = 'http://localhost:8080/';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });

const errs = [];
page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
// Google Fonts is unreachable from the sandbox, not broken in the app — the
// stylesheet is non-blocking and every face has a real fallback stack.
page.on('requestfailed', r => {
  if (r.url().includes('fonts.googleapis.com') || r.url().includes('fonts.gstatic.com')) return;
  errs.push('net: ' + r.url() + ' — ' + (r.failure()?.errorText || ''));
});

// The sandbox proxy blocks browser HTTPS to the Worker; relay it through Node.
await page.route('https://arcana-dm.dj-b02.workers.dev/**', async route => {
  try {
    const r = await fetch(route.request().url(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:8080' },
      body: route.request().postData(),
    });
    const speak = route.request().url().endsWith('/speak');
    await route.fulfill({
      status: r.status,
      contentType: speak ? 'audio/mpeg' : 'application/json',
      body: speak ? Buffer.from(await r.arrayBuffer()) : await r.text(),
    });
  } catch (e) {
    await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: String(e) }) });
  }
});

await page.goto(SITE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.arcana, { timeout: 20000 });

const ck = (label, ok, extra = '') => console.log(`  ${ok ? '✓' : '✗ FAIL'} ${label}${extra ? '  ' + extra : ''}`);

ck('the gate is the new two-button one', await page.isVisible('#intro-voice') && await page.isVisible('#intro-type'));
const fits = await page.evaluate(() => {
  const c = document.querySelector('.intro-card').getBoundingClientRect();
  const go = document.querySelector('.intro-go-row').getBoundingClientRect();
  const cr = document.querySelector('.intro-credit').getBoundingClientRect();
  return { card: Math.round(c.bottom), go: Math.round(go.bottom), credit: Math.round(cr.bottom), vh: innerHeight };
});
ck('both buttons and the OpenAI credit are on screen', fits.go <= fits.vh && fits.credit <= fits.vh, JSON.stringify(fits));

await page.click('#intro-type');
await page.waitForSelector('#intro', { state: 'hidden', timeout: 10000 });
ck('the voice status line is showing', await page.isVisible('#voice-state'),
   (await page.innerText('#voice-state')).replace(/\s+/g, ' ').trim());

// getTools() is async per spec — the count is behind a promise.
const tools = await page.evaluate(async () =>
  (await (document.modelContext || navigator.modelContext).getTools()).length);
ck('WebMCP tools are registered on the live page', tools >= 18, `${tools} tools`);

await page.waitForFunction(() => document.querySelectorAll('.say.dm:not(.thinking)').length >= 1, { timeout: 90000 });
ck('the live DM opened the scene', true, JSON.stringify((await page.innerText('.say.dm')).slice(0, 70)));

await page.click('#say');
await page.type('#say', 'I raise my torch and look around the hall.', { delay: 12 });
await page.click('#say-btn');
await page.waitForFunction(() => document.querySelectorAll('.say.dm:not(.thinking)').length >= 2, { timeout: 90000 });
const log = await page.evaluate(() => document.querySelectorAll('#agent-log .agent-row, #agent-log li, #agent-log > div').length);
ck('the DM answered a typed turn', true);
ck('tool calls landed in the Agent Log', log > 0, `${log} rows`);
ck('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));

await page.screenshot({ path: 'screens/live.png' });
await b.close();
srv.close();
