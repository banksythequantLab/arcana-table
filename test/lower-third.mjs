// Renders the transparent lower-third strip that sits over the real push-up
// footage, in the same visual language as the title cards.
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'fs/promises';

const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700;800&family=Nunito:wght@600;800&display=swap">
<style>
  *{box-sizing:border-box;margin:0}
  html,body{width:1280px;height:720px;background:transparent}
  body{font:600 15px/1.45 "Nunito",system-ui,sans-serif;position:relative}
  .band{
    position:absolute;left:0;right:0;bottom:0;height:190px;
    background:linear-gradient(transparent, rgba(20,13,28,.55) 38%, rgba(20,13,28,.92));
  }
  .lt{position:absolute;left:56px;bottom:52px}
  .kicker{font:800 16px "Baloo 2",cursive;letter-spacing:.2em;text-transform:uppercase;
    color:#F2C14E;margin-bottom:10px;text-shadow:0 2px 6px rgba(0,0,0,.8)}
  .title{font:800 54px/1 "Baloo 2",cursive;color:#F2ECDF;text-shadow:3px 3px 0 #2E2233}
  .sub{margin-top:10px;font-size:21px;color:#E4D9C4;text-shadow:0 2px 6px rgba(0,0,0,.9)}
  .sub b{color:#F2C14E}
  .badge{
    position:absolute;right:56px;bottom:64px;
    background:#F2C14E;color:#2E2233;border:4px solid #2E2233;border-radius:16px;
    padding:14px 22px;font:800 30px "Baloo 2",cursive;box-shadow:0 6px 0 rgba(0,0,0,.45);
    transform:rotate(-3deg)
  }
</style></head><body>
<div class="band"></div>
<div class="lt">
  <div class="kicker">💪 Heroic Effort · not a cutscene</div>
  <div class="title">10 push-ups.</div>
  <div class="sub">The table waits. Finish them and the next d20 is a <b>natural 20</b>.</div>
</div>
<div class="badge">NAT 20 PENDING</div>
</body></html>`;

await mkdir('screens/cards', { recursive: true });
await writeFile('screens/cards/lower-third.html', html);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`file://${process.cwd()}/screens/cards/lower-third.html`);
await page.waitForTimeout(700);
await page.screenshot({ path: 'screens/cards/lower-third.png', omitBackground: true });
await b.close();
console.log('lower-third rendered');
