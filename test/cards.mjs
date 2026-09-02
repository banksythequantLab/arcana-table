// Renders demo-video title cards in Arcana Table's own visual language.
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'fs/promises';

const CARDS = [
  { id: 'open',    kicker: '', title: 'Arcana Table', sub: 'Play D&amp;D with an AI co-DM — and do real push-ups for your natural 20s.', big: true },
  { id: 'webmcp',  kicker: 'How it works', title: '17 tools on <code>document.modelContext</code>', sub: 'The built-in DM calls <code>getTools()</code> and <code>executeTool()</code> — the same contract your agent would use.' },
  { id: 'heroic',  kicker: 'The signature move', title: 'Heroic&nbsp;Effort', sub: '10 jumping jacks → +2 · 15 squats → advantage · 5 burpees → a natural 20' },
  { id: 'burpees', kicker: '[ DROP YOUR BURPEE FOOTAGE HERE ]', title: 'Do the reps.', sub: 'Hands on the floor. Count out loud. The table is listening.' },
  { id: 'close',   kicker: '', title: 'Roll with your whole self.', sub: 'arcana-table.pages.dev · github.com/banksythequantLab/arcana-table', big: true },
];

const html = c => `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700;800&family=Nunito:ital,wght@0,600;0,800;1,600&display=swap">
<style>
  *{box-sizing:border-box;margin:0}
  body{width:1280px;height:720px;background:#1C1426;color:#F2ECDF;
    font:600 15px/1.45 "Nunito",system-ui,sans-serif;display:flex;align-items:center;justify-content:center;
    background-image:linear-gradient(rgba(242,193,78,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(242,193,78,.045) 1px,transparent 1px);
    background-size:44px 44px;overflow:hidden}
  .wrap{text-align:center;max-width:1000px;padding:0 60px}
  .kicker{font:800 15px "Baloo 2",cursive;letter-spacing:.18em;text-transform:uppercase;color:#F2C14E;margin-bottom:22px}
  .kicker.warn{color:#D9534F}
  h1{font:800 ${c.big ? '82px' : '58px'}/1.06 "Baloo 2",cursive;text-shadow:4px 4px 0 #2E2233;margin-bottom:22px}
  h1 code{font:800 .8em "IBM Plex Mono",ui-monospace,monospace;color:#F2C14E}
  p{font-size:22px;line-height:1.5;color:#B9AECB;max-width:820px;margin:0 auto}
  p code{background:#2A2038;border:2px solid #2E2233;border-radius:6px;padding:1px 7px;color:#8BE0D6;font-size:.88em}
  .die{position:absolute;font-size:210px;opacity:.05;transform:rotate(-14deg)}
</style></head><body>
<div class="die">🎲</div>
<div class="wrap">
  ${c.kicker ? `<div class="kicker${c.id === 'burpees' ? ' warn' : ''}">${c.kicker}</div>` : ''}
  <h1>${c.title}</h1>
  <p>${c.sub}</p>
</div></body></html>`;

await mkdir('screens/cards', { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
for (const c of CARDS) {
  await writeFile(`screens/cards/${c.id}.html`, html(c));
  await page.goto(`file://${process.cwd()}/screens/cards/${c.id}.html`);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `screens/cards/${c.id}.png` });
  console.log('card:', c.id);
}
await b.close();
