import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
const root = join(process.cwd(), '..');
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml' };
const server = createServer(async (req,res)=>{ const p=req.url==='/'?'/index.html':req.url.split('?')[0];
  try{ const body=await readFile(join(root,p)); res.writeHead(200,{'content-type':MIME[extname(p)]||'application/octet-stream'}); res.end(body); }catch{res.writeHead(404);res.end();} });
await new Promise(r=>server.listen(0,r));
const port = server.address().port;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await b.newPage({ viewport:{width:1400,height:900} });
await page.route(/arcana-dm.*workers\.dev/, r => r.fulfill({status:200,contentType:'application/json',body:'{"content":"Before we begin — want to stand up and loosen out?","tool_calls":[]}'}));
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(()=>window.arcana);
await page.click('#intro-type');
await page.waitForTimeout(1000);
const before = await page.evaluate(()=>({ revealed: window.__st.revealed.length, pc: {...window.__st.tokens[0]} }));
await page.evaluate(()=>window.arcana.call('start_warmup',{plan:'90s'}));
await page.waitForTimeout(1200);
await page.screenshot({ path:'screens/warm-prologue-a.png' });
// fast-forward three stretches
for (let i=0;i<3;i++){ await page.evaluate(()=>window.__st.warmup.remaining=1); await page.waitForTimeout(1300); }
await page.screenshot({ path:'screens/warm-prologue-b.png' });
const after = await page.evaluate(()=>({ revealed: window.__st.revealed.length, pc: {...window.__st.tokens[0]},
  scenes: [...document.querySelectorAll('#story-log .entry.scene')].map(e=>e.innerText.replace(/\s+/g,' ').trim()) }));
console.log('fog cells revealed:', before.revealed, '->', after.revealed);
console.log('party moved:', `(${before.pc.x},${before.pc.y})`, '->', `(${after.pc.x},${after.pc.y})`);
console.log('prologue lines:');
after.scenes.slice(-5).forEach(l=>console.log('   ', l));
await b.close(); server.close();
