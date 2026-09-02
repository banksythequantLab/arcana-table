import { chromium, devices } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { fileURLToPath } from 'url';
const root = join(fileURLToPath(import.meta.url), '..', '..');
const M={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const srv=createServer(async(q,s)=>{const p=q.url==='/'?'/index.html':q.url.split('?')[0];
try{s.writeHead(200,{'content-type':M[extname(p)]||'text/plain'});s.end(await readFile(join(root,p)));}catch{s.writeHead(404);s.end();}});
await new Promise(r=>srv.listen(8080,r));
const b=await chromium.launch({executablePath:process.env.CHROMIUM});
const ctx=await b.newContext({...devices['iPhone 13']});
const page=await ctx.newPage();
await page.route('**/arcana-dm*/**', r=>r.abort());
await page.goto('http://localhost:8080/');
await page.waitForFunction(()=>window.arcana);
await page.screenshot({path:'screens/m_intro.png'});
await page.click('#intro-go');
await page.waitForTimeout(900);
await page.screenshot({path:'screens/m_table.png'});
const m = await page.evaluate(()=>{
  const r = s => { const e=document.querySelector(s); if(!e) return null; const b=e.getBoundingClientRect(); return {w:Math.round(b.width),h:Math.round(b.height),top:Math.round(b.top)}; };
  return { vw: innerWidth, vh: innerHeight, board:r('#board'), side:r('#side'), say:r('#say-row'),
           bodyScrollW: document.body.scrollWidth, horizOverflow: document.body.scrollWidth > innerWidth+1 };
});
console.log(JSON.stringify(m,null,1));
await b.close(); srv.close();
