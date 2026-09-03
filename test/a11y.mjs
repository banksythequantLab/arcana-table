import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
const root = join(process.cwd(), '..');
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml' };
const server = createServer(async (req,res)=>{ const p=req.url==='/'?'/index.html':req.url.split('?')[0];
  try{ res.writeHead(200,{'content-type':MIME[extname(p)]||'application/octet-stream'}); res.end(await readFile(join(root,p))); }catch{res.writeHead(404);res.end();} });
await new Promise(r=>server.listen(0,r));
const port = server.address().port;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await b.newPage({ viewport:{width:1400,height:900} });
await page.route(/arcana-dm.*workers\.dev/, r => r.fulfill({status:200,contentType:'application/json',body:'{"content":"ok","tool_calls":[]}'}));
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(()=>window.arcana);

let pass=0, fail=0;
const ck=(l,c,x='')=>{ c?(pass++,console.log('  ✓ '+l)):(fail++,console.log('  ✗ '+l+' '+x)); };

// 1. the intro gate is reachable and dismissible by keyboard alone
// Chrome makes an overflowing scroller a tab stop of its own — correct, since a
// keyboard user has to be able to scroll the copy — so the first stop may be the
// scrolling region. What matters is that focus is trapped in the gate and the
// CTA is right there, not that it is stop number one.
await page.keyboard.press('Tab');
const first = await page.evaluate(()=>({ id: document.activeElement?.id, cls: document.activeElement?.className,
                                         inGate: !!document.activeElement?.closest('#intro'),
                                         named: !!document.activeElement?.getAttribute('aria-label') }));
ck('keyboard focus lands inside the intro gate', first.inGate, JSON.stringify(first));
ck('and that first stop has a name, scroller or button', !!first.id || first.named, JSON.stringify(first));
await page.keyboard.press('Tab');
const second = await page.evaluate(()=>document.activeElement?.id);
ck('the call to action is within two stops', ['intro-voice','intro-type'].includes(second) || ['intro-voice','intro-type'].includes(first.id), `${first.id||first.cls} → ${second}`);
await page.evaluate(()=>document.getElementById('intro-type').focus());
await page.keyboard.press('Enter');
await page.waitForTimeout(600);
ck('the gate can be dismissed with the keyboard', await page.isHidden('#intro'));

// 2. every interactive control is focusable and named
const unlabeled = await page.evaluate(()=>{
  const sel='button,input,select,[tabindex]:not([tabindex="-1"])';
  return [...document.querySelectorAll(sel)]
    .filter(el=>el.offsetParent!==null)
    .filter(el=>!(el.getAttribute('aria-label')||el.textContent.trim()||
                  el.closest('label')||document.querySelector(`label[for="${el.id}"]`)))
    .map(el=>el.tagName+'#'+(el.id||'?'));
});
ck('every visible control has an accessible name', unlabeled.length===0, unlabeled.join(','));

// 3. tab order actually reaches the main input
let reached=false;
for (let i=0;i<40;i++){ await page.keyboard.press('Tab');
  if (await page.evaluate(()=>document.activeElement?.id)==='say'){ reached=true; break; } }
ck('the "what do you do" input is reachable by Tab', reached);

// 4. focus is visible, not suppressed
const ring = await page.evaluate(()=>{
  const el=document.getElementById('say-btn'); el.focus();
  const s=getComputedStyle(el);
  return { w:s.outlineWidth, style:s.outlineStyle };
});
ck('focused controls show a visible ring', ring.style!=='none' && parseFloat(ring.w)>0, JSON.stringify(ring));

// 5. the canvas is not the only channel — the log narrates it
ck('the board has a text alternative', !!(await page.getAttribute('#board','aria-label')));
ck('the story log is a live region', (await page.getAttribute('#story-log','aria-live'))==='polite');

// 6. reduced motion is actually honoured, not just declared
const calm = await b.newContext({ reducedMotion:'reduce', viewport:{width:1200,height:800} });
const p2 = await calm.newPage();
await p2.route(/arcana-dm.*workers\.dev/, r => r.fulfill({status:200,contentType:'application/json',body:'{"content":"ok","tool_calls":[]}'}));
await p2.goto(`http://localhost:${port}/`);
await p2.waitForFunction(()=>window.arcana);
await p2.click('#intro-type');
await p2.waitForTimeout(500);
await p2.evaluate(()=>window.arcana.call('roll_dice',{formula:'d20',reason:'calm test'}));
await p2.waitForTimeout(250);
// The standard reduced-motion reset keeps the animation NAME and collapses its
// duration, so assert on the duration — the name alone says nothing.
const anim = await p2.evaluate(()=>{
  const d=document.querySelector('.die3d');
  if(!d) return null;
  const s=getComputedStyle(d);
  return { name:s.animationName, ms:parseFloat(s.animationDuration)*1000 };
});
ck('reduced motion collapses the dice animation to nothing',
   anim && anim.ms < 5, JSON.stringify(anim));
const shown = await p2.evaluate(()=>document.querySelector('.pip')?.textContent);
ck('reduced motion still shows the result', !!shown && shown!=='', shown);

console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); server.close();
process.exit(fail?1:0);
