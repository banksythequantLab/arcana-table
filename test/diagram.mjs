// Records the "how it works" model: an animated architecture diagram in the
// app's own visual language, paced against the WebMCP voice-over.
//
// The point the picture has to make is the one the prose keeps making: the
// built-in DM and an outside agent reach the board through the SAME two calls.
// So both sit on the right, both wire into one registry, and the registry is
// the only door into the board. There is no second, private arrow.
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'fs/promises';

const HTML = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="stylesheet" media="print" onload="this.media='all'" href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700;800&family=Nunito:wght@600;800&display=swap">
<style>
  *{box-sizing:border-box;margin:0}
  body{width:1280px;height:720px;background:#1C1426;color:#F2ECDF;overflow:hidden;
    font:600 15px/1.4 "Nunito",system-ui,sans-serif;
    background-image:linear-gradient(rgba(242,193,78,.045) 1px,transparent 1px),
                     linear-gradient(90deg,rgba(242,193,78,.045) 1px,transparent 1px);
    background-size:44px 44px}
  .wrap{position:relative;width:1280px;height:720px;padding:26px 34px}
  h2{font:800 26px "Baloo 2",cursive;color:#F2C14E;letter-spacing:.02em}
  .sub{color:#B9AECB;font-size:14.5px;margin-top:2px}

  .box{position:absolute;border:3px solid #2E2233;border-radius:14px;
    background:#2A2038;box-shadow:0 5px 0 rgba(0,0,0,.45);padding:11px 14px;
    opacity:0;transform:translateY(10px);transition:opacity .5s ease,transform .5s ease}
  .box.on{opacity:1;transform:none}
  .box .t{font:800 15px "Baloo 2",cursive;color:#F2ECDF;white-space:nowrap}
  .box .d{font-size:12.5px;color:#B9AECB;margin-top:3px;line-height:1.35}
  .box code{font:800 12px ui-monospace,monospace;color:#8BE0D6}

  #you   {left:34px;  top:252px; width:186px; text-align:center}
  #page  {left:252px; top:150px; width:428px; height:382px; background:#221A2E;
          border-color:#F2C14E; padding:12px}
  #reg   {left:266px; top:198px; width:400px; background:#332746; border-color:#8BE0D6}
  #board {left:266px; top:428px; width:400px; background:#2E2340}
  #dm    {left:812px; top:176px; width:414px; border-color:#79B255}
  #key   {left:812px; top:294px; width:414px; background:#241C31; border-color:#4E7BD0}
  #ext   {left:812px; top:412px; width:414px; border-color:#7A4FBF}

  .pagelabel{position:absolute;left:252px;top:120px;font:800 13px "Baloo 2",cursive;
    color:#F2C14E;letter-spacing:.14em;opacity:0;transition:opacity .4s}
  .pagelabel.on{opacity:1}

  .chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}
  .chip{font:800 10px ui-monospace,monospace;background:#221A2E;border:2px solid #2E2233;
    border-radius:999px;padding:1px 6px;color:#8BE0D6;opacity:0;transform:scale(.7);
    transition:opacity .25s,transform .25s}
  .chip.on{opacity:1;transform:none}
  .chip.combat{color:#F2C14E;border-color:#5A4530}
  .chip.downed{color:#D9534F;border-color:#5A2F2F}

  svg.wires{position:absolute;inset:0;width:1280px;height:720px;pointer-events:none}
  .wire{fill:none;stroke:#5A4A70;stroke-width:3;stroke-linecap:round;
    stroke-dasharray:var(--len);stroke-dashoffset:var(--len);
    transition:stroke-dashoffset .6s ease}
  .wire.on{stroke-dashoffset:0}
  .wire.get{stroke:#8BE0D6} .wire.exec{stroke:#F2C14E} .wire.ext{stroke:#9B7BD8}
  .pulse{fill:#F2C14E;opacity:0}
  .pulse.on{opacity:1}

  .wlabel{position:absolute;font:800 12px ui-monospace,monospace;
    background:#1C1426;padding:2px 7px;border-radius:6px;opacity:0;transition:opacity .35s}
  .wlabel.on{opacity:1}
  #l-get {left:700px; top:200px; color:#8BE0D6}
  #l-exec{left:696px; top:256px; color:#F2C14E}
  #l-ext {left:690px; top:500px; color:#9B7BD8}

  .punch{position:absolute;left:34px;top:612px;width:1212px;text-align:center;
    font:800 21px "Baloo 2",cursive;color:#F2ECDF;opacity:0;transform:translateY(8px);
    transition:opacity .6s,transform .6s}
  .punch.on{opacity:1;transform:none}
  .punch b{color:#F2C14E}
</style></head><body>
<div class="wrap">
  <h2>How it actually works</h2>
  <div class="sub">One registry. Two calls. No private door.</div>

  <svg class="wires">
    <!-- you ⇄ page -->
    <path id="w-say"  class="wire" d="M 220 272 L 252 272"/>
    <path id="w-see"  class="wire" d="M 252 306 L 220 306"/>
    <!-- DM → registry (getTools / executeTool) -->
    <path id="w-get"  class="wire get"  d="M 812 198 C 756 198, 716 220, 666 244"/>
    <path id="w-exec" class="wire exec" d="M 812 232 C 756 232, 716 262, 666 288"/>
    <!-- external agent → the same registry -->
    <path id="w-ext"  class="wire ext"  d="M 812 452 C 742 452, 690 380, 666 330"/>
    <!-- registry → board -->
    <path id="w-board" class="wire" d="M 466 414 L 466 428"/>
    <!-- DM → worker → OpenAI -->
    <path id="w-key"  class="wire" d="M 1019 244 L 1019 294"/>
    <circle id="pulse" class="pulse" r="7" cx="0" cy="0"/>
  </svg>

  <div class="pagelabel" id="pagelabel">THE PAGE · arcana-table.pages.dev</div>

  <div class="box" id="you">
    <div class="t">🧍 You</div>
    <div class="d">type it, or say it out loud —<br>and watch it happen</div>
  </div>

  <div class="box" id="page"></div>

  <div class="box" id="reg">
    <div class="t">🔌 <code>document.modelContext</code></div>
    <div class="d">the WebMCP registry — every tool the table has</div>
    <div class="chips" id="chips"></div>
  </div>

  <div class="box" id="board">
    <div class="t">🗺 The board</div>
    <div class="d">tokens, fog, initiative, dice, the quest — mutated only by a tool call</div>
  </div>

  <div class="box" id="dm">
    <div class="t">🎩 The built-in DM</div>
    <div class="d">OpenAI GPT with function calling. The functions ARE the registry above.</div>
  </div>

  <div class="box" id="key">
    <div class="t">🔐 Cloudflare Worker → OpenAI</div>
    <div class="d">holds the API key, origin-locked, rate-limited. No key in your browser.</div>
  </div>

  <div class="box" id="ext">
    <div class="t">🤖 Your agent — ChatGPT, Claude, anything</div>
    <div class="d">Same registry. Same two calls. Nothing special about the one built in.</div>
  </div>

  <div class="wlabel" id="l-get">getTools()</div>
  <div class="wlabel" id="l-exec">executeTool()</div>
  <div class="wlabel" id="l-ext">the identical two calls</div>

  <div class="punch" id="punch">The DM has <b>no back door</b> — if you can watch the log, you can see everything it is allowed to do.</div>
</div>

<script>
const TOOLS = ['get_board_state','get_character_sheet','get_fitness_log','get_quest',
  'roll_dice','narrate','set_scene','reveal_area','move_token','add_token','remove_token',
  'start_combat','end_combat','award_loot','propose_challenge','propose_oath','start_warmup',
  'advance_quest'];
const COMBAT = ['advance_turn','update_hp','apply_condition'];
const DOWNED = ['death_save'];
const chips = document.getElementById('chips');
[...TOOLS.map(t=>[t,'']), ...COMBAT.map(t=>[t,'combat']), ...DOWNED.map(t=>[t,'downed'])]
  .forEach(([t,cls])=>{
    const s=document.createElement('span'); s.className='chip '+cls; s.textContent=t; chips.appendChild(s);
  });

const on = (id, v=true) => document.getElementById(id)?.classList.toggle('on', v);
const wire = id => { const p=document.getElementById(id); const L=p.getTotalLength();
  p.style.setProperty('--len', L); return p; };
['w-say','w-see','w-get','w-exec','w-ext','w-board','w-key'].forEach(wire);

// A dot that actually travels the executeTool wire, so the arrow is not just
// decoration — it shows a call going out and the board changing because of it.
function runPulse(pathId, ms=900){
  const p=document.getElementById(pathId), dot=document.getElementById('pulse');
  const L=p.getTotalLength(); const t0=performance.now();
  dot.classList.add('on');
  (function step(now){
    const k=Math.min(1,(now-t0)/ms);
    const pt=p.getPointAtLength(L*(1-k));
    dot.setAttribute('cx',pt.x); dot.setAttribute('cy',pt.y);
    if(k<1) requestAnimationFrame(step); else dot.classList.remove('on');
  })(t0);
}

window.__beats = [
  () => { on('you'); on('page'); on('pagelabel'); on('w-say'); },
  () => { on('reg'); on('board'); on('w-board'); on('w-see'); },
  () => { document.querySelectorAll('.chip').forEach((c,i)=>setTimeout(()=>c.classList.add('on'), i*55)); },
  () => { on('dm'); on('key'); on('w-key'); },
  () => { on('w-get'); on('l-get'); },
  () => { on('w-exec'); on('l-exec'); runPulse('w-exec'); },
  () => { runPulse('w-exec'); },
  () => { on('ext'); on('w-ext'); on('l-ext'); },
  () => { on('punch'); },
];
window.__step = 0;
window.__next = () => { (window.__beats[window.__step++] || (()=>{}))(); };
</script></body></html>`;

await mkdir('screens/diagram', { recursive: true });
await writeFile('screens/diagram/model.html', HTML);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: 'screens/diagram/vid', size: { width: 1280, height: 720 } },
});
const page = await ctx.newPage();
await page.goto(`file://${process.cwd()}/screens/diagram/model.html`);
await page.waitForSelector('#you');
await page.waitForTimeout(1200);   // let the first paint settle

// Paced against the three WebMCP voice-over takes.
const BEATS = [1500, 2400, 1800, 3000, 2600, 2600, 2200, 3400, 3000];
for (const hold of BEATS) {
  await page.evaluate(() => window.__next());
  await page.waitForTimeout(hold);
}
await page.waitForTimeout(2500);
await page.screenshot({ path: 'screens/diagram/model.png' });

await ctx.close();
await browser.close();
console.log('diagram recorded');
