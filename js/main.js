// ── Arcana Table · boot ──────────────────────────────────────────────────────
import { initBoard } from './board.js';
import { initTools } from './tools.js';
import { initUI } from './ui.js';

async function boot() {
  await initTools();          // register the WebMCP surface first
  initUI();
  initBoard(document.getElementById('board'));
  console.log('%c🎲 Arcana Table ready.', 'font-weight:bold');
  console.log('Agent tools:', window.arcana.tools().join(', '));
  console.log('Try: await arcana.call("roll_dice", {formula:"d20", reason:"perception check"})');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
