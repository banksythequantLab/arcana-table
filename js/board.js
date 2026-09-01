// ── Arcana Table · board renderer ────────────────────────────────────────────
// Canvas grid: cel-shaded tiles, chunky outlines, fog of war, drag-to-move.

import { state, GRID_W, GRID_H, currentMap, isRevealed, isWalkable, findToken } from './state.js';
import { moveToken, onChange, emit } from './actions.js';
import { TOKEN_ART, TILE_COLORS } from './art.js';

let canvas, ctx, cell = 44, offX = 0, offY = 0;
let drag = null;           // {token, px, py}
let hoverCell = null;
let anims = new Map();     // tokenId → {fx, fy, tx, ty, t0}
let lastPos = new Map();   // tokenId → {x, y} to detect agent moves

export function initBoard(el) {
  canvas = el;
  ctx = canvas.getContext('2d');
  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement);
  resize();

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', () => { drag = null; });

  onChange(() => detectMoves());
  detectMoves(true);
  requestAnimationFrame(frame);
}

function resize() {
  const box = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(300, box.width) * dpr;
  canvas.height = Math.max(240, box.height) * dpr;
  canvas.style.width = box.width + 'px';
  canvas.style.height = box.height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cell = Math.floor(Math.min(box.width / GRID_W, box.height / GRID_H));
  offX = Math.floor((box.width - cell * GRID_W) / 2);
  offY = Math.floor((box.height - cell * GRID_H) / 2);
}

function detectMoves(prime = false) {
  for (const t of state.tokens) {
    const prev = lastPos.get(t.id);
    if (!prime && prev && (prev.x !== t.x || prev.y !== t.y) && (!drag || drag.token.id !== t.id)) {
      anims.set(t.id, { fx: prev.x, fy: prev.y, tx: t.x, ty: t.y, t0: performance.now() });
    }
    lastPos.set(t.id, { x: t.x, y: t.y });
  }
  for (const id of [...lastPos.keys()]) if (!findToken(id)) { lastPos.delete(id); anims.delete(id); }
}

const cellXY = (x, y) => [offX + x * cell, offY + y * cell];

function pickCell(e) {
  const r = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left - offX) / cell);
  const y = Math.floor((e.clientY - r.top - offY) / cell);
  return (x >= 0 && x < GRID_W && y >= 0 && y < GRID_H) ? { x, y } : null;
}

function onDown(e) {
  const c = pickCell(e);
  if (!c) return;
  const t = [...state.tokens].reverse().find(t => t.x === c.x && t.y === c.y);
  if (t) { drag = { token: t, px: e.clientX, py: e.clientY }; canvas.setPointerCapture(e.pointerId); }
}
function onMove(e) {
  hoverCell = pickCell(e);
  if (drag) { drag.px = e.clientX; drag.py = e.clientY; }
}
function onUp(e) {
  if (!drag) return;
  const c = pickCell(e);
  const t = drag.token;
  drag = null;
  if (c && (c.x !== t.x || c.y !== t.y) && isWalkable(c.x, c.y)) {
    lastPos.set(t.id, c);                       // no snap-back animation
    moveToken({ tokenId: t.id, x: c.x, y: c.y });
    emit('player-move');                        // the DM should react to this
  }
}

// ── render loop ──────────────────────────────────────────────────────────────
function frame(now) {
  draw(now);
  requestAnimationFrame(frame);
}

function draw(now) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);
  const pal = TILE_COLORS[state.scene.mapId] || TILE_COLORS.dungeon;
  const rows = currentMap().rows;

  // frame mat
  ctx.fillStyle = '#241B2E';
  ctx.fillRect(0, 0, w, h);

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const t = rows[y]?.[x] ?? '#';
      const [px, py] = cellXY(x, y);
      ctx.fillStyle = pal[t] || pal['.'];
      ctx.fillRect(px, py, cell, cell);
      if (t === '#') {                                   // chunky wall cap
        ctx.fillStyle = pal.edge;
        ctx.fillRect(px, py + cell * 0.72, cell, cell * 0.28);
      }
      if (t === ',') {                                   // rubble dots
        ctx.fillStyle = pal.edge;
        ctx.beginPath(); ctx.arc(px + cell * 0.3, py + cell * 0.6, cell * 0.06, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(px + cell * 0.65, py + cell * 0.35, cell * 0.05, 0, 7); ctx.fill();
      }
      if (t === '~') {                                   // waves
        ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px + cell * .15, py + cell * .5);
        ctx.quadraticCurveTo(px + cell * .35, py + cell * .35, px + cell * .5, py + cell * .5);
        ctx.quadraticCurveTo(px + cell * .68, py + cell * .65, px + cell * .85, py + cell * .5);
        ctx.stroke();
      }
      if (t === 'L') {                                   // lava bubbles
        ctx.fillStyle = '#F2C14E';
        ctx.beginPath(); ctx.arc(px + cell * .5, py + cell * .5, cell * .1 * (1 + .3 * Math.sin(now / 300 + x + y)), 0, 7); ctx.fill();
      }
      if (t === 'D') {                                   // door planks
        ctx.strokeStyle = pal.edge; ctx.lineWidth = 2;
        for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(px + (cell / 4) * i, py + 4); ctx.lineTo(px + (cell / 4) * i, py + cell - 4); ctx.stroke(); }
      }
      // grid line
      ctx.strokeStyle = 'rgba(0,0,0,.16)'; ctx.lineWidth = 1;
      ctx.strokeRect(px + .5, py + .5, cell - 1, cell - 1);
    }
  }

  // hover
  if (hoverCell && isWalkable(hoverCell.x, hoverCell.y)) {
    const [px, py] = cellXY(hoverCell.x, hoverCell.y);
    ctx.strokeStyle = '#F2C14E'; ctx.lineWidth = 3;
    ctx.strokeRect(px + 2, py + 2, cell - 4, cell - 4);
  }

  // tokens
  const order = [...state.tokens].sort((a, b) => a.y - b.y);
  for (const t of order) {
    let dx = t.x, dy = t.y;
    const a = anims.get(t.id);
    if (a) {
      const k = Math.min(1, (now - a.t0) / 260);
      const e = 1 - Math.pow(1 - k, 3);
      dx = a.fx + (a.tx - a.fx) * e;
      dy = a.fy + (a.ty - a.fy) * e;
      if (k >= 1) anims.delete(t.id);
    }
    if (drag && drag.token.id === t.id) {
      const r = canvas.getBoundingClientRect();
      drawToken(t, drag.px - r.left - cell / 2, drag.py - r.top - cell / 2, now, true);
      continue;
    }
    const [px, py] = cellXY(dx, dy);
    drawToken(t, px, py, now, false);
  }

  // fog of war
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
    if (!isRevealed(x, y)) {
      const [px, py] = cellXY(x, y);
      ctx.fillStyle = 'rgba(18,11,26,.88)';
      ctx.fillRect(px - .5, py - .5, cell + 1, cell + 1);
    }
  }
}

function drawToken(t, px, py, now, lifted) {
  const img = TOKEN_ART[t.art] || TOKEN_ART.villager;
  const pad = cell * 0.08;
  const isTurn = state.combat.active && state.combat.order[state.combat.turnIndex] === t.id;

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath();
  ctx.ellipse(px + cell / 2, py + cell * .88, cell * .32, cell * .1, 0, 0, 7);
  ctx.fill();

  // turn ring
  if (isTurn) {
    ctx.strokeStyle = '#F2C14E'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(px + cell / 2, py + cell / 2, cell * .52 + 2 * Math.sin(now / 200), 0, 7); ctx.stroke();
  }

  const bounce = lifted ? -6 : 0;
  if (img.complete) ctx.drawImage(img, px + pad, py + pad + bounce, cell - pad * 2, cell - pad * 2);

  // hp bar (skip full-health objects)
  if (t.maxHp && (t.hp < t.maxHp || t.kind !== 'object')) {
    const bw = cell * .7, bx = px + (cell - bw) / 2, by = py + 1;
    ctx.fillStyle = '#2E2233'; ctx.fillRect(bx - 1, by - 1, bw + 2, 6);
    const frac = Math.max(0, t.hp / t.maxHp);
    ctx.fillStyle = frac > .5 ? '#79B255' : frac > .25 ? '#F2C14E' : '#D9534F';
    ctx.fillRect(bx, by, bw * frac, 4);
  }

  // condition pips
  if (t.conditions?.length) {
    ctx.fillStyle = '#7A4FBF';
    t.conditions.slice(0, 4).forEach((c, i) => {
      ctx.beginPath(); ctx.arc(px + cell * .16 + i * 8, py + cell * .95 - 4, 3.4, 0, 7); ctx.fill();
      ctx.strokeStyle = '#2E2233'; ctx.lineWidth = 1.4; ctx.stroke();
    });
  }

  if (t.hp === 0) {          // downed X
    ctx.strokeStyle = '#D9534F'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px + cell * .25, py + cell * .25); ctx.lineTo(px + cell * .75, py + cell * .75);
    ctx.moveTo(px + cell * .75, py + cell * .25); ctx.lineTo(px + cell * .25, py + cell * .75);
    ctx.stroke();
  }
}
