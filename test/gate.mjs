import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { fileURLToPath } from 'url';
// A 0.1s silent MP3, inlined so this file has no dependency outside the repo.
// (It used to read /tmp/tiny.b64, which meant the check only ran on the machine
// that happened to have written that file.)
const B64 = 'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAwAAAbAAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV////////////////////////////////////////////AAAAAExhdmM2MC4zMQAAAAAAAAAAAAAAACQC8AAAAAAAAAGw9wruFgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/+MYxAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxDsAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxHYAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';
const root = join(fileURLToPath(import.meta.url), '..', '..');
const M={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const srv=createServer(async(q,s)=>{const p=q.url==='/'?'/index.html':q.url.split('?')[0];
try{s.writeHead(200,{'content-type':M[extname(p)]||'text/plain'});s.end(await readFile(join(root,p)));}catch{s.writeHead(404);s.end();}});
await new Promise(r=>srv.listen(8080,r));
// Real Chrome gates audible autoplay on user activation; headless does not by
// default. Force the production policy so this test means something.
const b=await chromium.launch({
  executablePath:process.env.CHROMIUM,
  args:['--autoplay-policy=document-user-activation-required'],
});
const page=await b.newPage({viewport:{width:1280,height:720}});
await page.route('**/arcana-dm*/**', r=>r.abort());
await page.goto('http://localhost:8080/');
await page.waitForFunction(()=>window.arcana);
const probe = async label => {
  const r = await page.evaluate(async b64 => {
    let ctxState='n/a';
    try { ctxState = new (window.AudioContext||window.webkitAudioContext)().state; } catch {}
    let el='n/a';
    try { const a=new Audio('data:audio/mpeg;base64,'+b64); a.volume=1; await a.play(); a.pause(); el='PLAYED'; }
    catch(e){ el=e.name; }
    return { audioContext: ctxState, audioElement: el };
  }, B64);
  console.log(label, JSON.stringify(r));
};
await probe('before gate:');
await page.screenshot({path:'screens/intro.png'});
await page.click('#intro-type');
await page.waitForTimeout(700);
await probe('after gate: ');
await page.screenshot({path:'screens/after_gate.png'});
await b.close(); srv.close();
