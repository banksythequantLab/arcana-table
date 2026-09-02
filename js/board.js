// ── Arcana Table · board renderer ────────────────────────────────────────────
// Canvas grid: cel-shaded tiles, chunky outlines, torchlight, fog of war,
// drag-to-move — and effects, so the board reacts instead of just updating.

import { state, GRID_W, GRID_H, currentMap, isRevealed, isWalkable, findToken } from './state.js';
import { moveToken, moveParty, onChange, emit } from './actions.js';
import { TOKEN_ART, TILE_COLORS } from './art.js';
import { fx, step, draw as drawFx, damageNumber, burst, ring, kick, flash } from './fx.js';

let canvas, ctx, cell = 44, offX = 0, offY = 0;
let drag = null;
let tap = null;            // a press on empty floor, pending a click
let hoverCell = null;
let anims = new Map();     // tokenId → {fx, fy, tx, ty, t0}
let lastPos = new Map();
let lastHp = new Map();
let lastDiceT = 0;
let lastSpellT = 0;
let lastMsT = 0;
let lastFrame = performance.now();

// Someone who asked for less motion should not get a guttering torch.
const CALM = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// Deterministic per-cell jitter so stone looks laid, not printed.
const hash = (x, y) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

export function initBoard(el) {
  canvas = el;
  ctx = canvas.getContext('2d');
  new ResizeObserver(resize).observe(canvas.parentElement);
  resize();

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', () => { drag = null; });

  onChange(() => detectChanges());
  detectChanges(true);
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

// Watch state for things worth reacting to: movement, damage, dice.
function detectChanges(prime = false) {
  for (const t of state.tokens) {
    const prev = lastPos.get(t.id);
    if (!prime && prev && (prev.x !== t.x || prev.y !== t.y) && (!drag || drag.token.id !== t.id)) {
      anims.set(t.id, { fx: prev.x, fy: prev.y, tx: t.x, ty: t.y, t0: performance.now() });
    }
    lastPos.set(t.id, { x: t.x, y: t.y });

    const hp = lastHp.get(t.id);
    if (!prime && hp !== undefined && hp !== t.hp) {
      damageNumber(t.x, t.y, t.hp - hp);
      if (t.hp === 0) { burst(t.x, t.y, 22, '#D9534F'); kick(12); }
    }
    lastHp.set(t.id, t.hp);
  }
  for (const id of [...lastPos.keys()]) {
    if (!findToken(id)) { lastPos.delete(id); lastHp.delete(id); anims.delete(id); }
  }

  // A fireball should look like one: a hot burst over the target, a ring for
  // the blast edge that catches whatever is standing next to it, and a shove.
  const sp = state.spellFx;
  if (sp && sp.t !== lastSpellT) {
    lastSpellT = sp.t;
    burst(sp.x, sp.y, 26, '#F0762E');
    burst(sp.x, sp.y, 14, '#F2C14E');
    ring(sp.x, sp.y, '#F0762E');
    flash('rgba(240,118,46,.22)', 380);
    kick(10);
  }

  // A cleared beat throws a small party over the heroes.
  const ms = state.milestone;
  if (ms && ms.t !== lastMsT) {
    lastMsT = ms.t;
    state.tokens.filter(t => t.kind === 'pc').forEach(t => {
      burst(t.x, t.y, 26, '#F2C14E');
      burst(t.x, t.y, 12, '#79B255');
      ring(t.x, t.y, '#F2C14E');
    });
    flash('rgba(242,193,78,.26)', 700);
    kick(9);
  }

  const d = state.dice;
  if (!prime && d && d.t !== lastDiceT) {
    lastDiceT = d.t;
    const pc = state.tokens.find(t => t.kind === 'pc');
    if (d.nat20) { flash('rgba(242,193,78,.34)', 620); kick(14); if (pc) { burst(pc.x, pc.y, 30, '#F2C14E'); ring(pc.x, pc.y, '#F2C14E'); } }
    else if (d.boostsUsed?.length && pc) { ring(pc.x, pc.y, '#8BE0D6'); burst(pc.x, pc.y, 14, '#8BE0D6'); }
    else if (d.nat1) { flash('rgba(60,56,74,.4)', 420); }
  }
}

const cellXY = (x, y) => [offX + x * cell, offY + y * cell];

// ── fog buffer ───────────────────────────────────────────────────────────────
// Rebuilt only when the revealed set (or layout) changes — a few hundred radial
// gradients per frame would cost more than the whole rest of the render.
let fogCanvas = null, fogKey = '';
function fogLayer(w, h) {
  const key = `${w}x${h}:${cell}:${state.revealed.length}:${state.scene.mapId}`;
  if (fogCanvas && fogKey === key) return fogCanvas;

  fogCanvas = fogCanvas || document.createElement('canvas');
  fogCanvas.width = w; fogCanvas.height = h;
  const f = fogCanvas.getContext('2d');
  f.clearRect(0, 0, w, h);
  f.fillStyle = 'rgba(8,5,13,.965)';
  f.fillRect(0, 0, w, h);
  f.globalCompositeOperation = 'destination-out';
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
    if (!isRevealed(x, y)) continue;
    const [px, py] = cellXY(x, y);
    const cx = px + cell / 2, cy = py + cell / 2;
    const g = f.createRadialGradient(cx, cy, cell * 0.45, cx, cy, cell * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.72, 'rgba(0,0,0,.99)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    f.fillStyle = g;
    f.fillRect(px - cell, py - cell, cell * 3, cell * 3);
  }
  f.globalCompositeOperation = 'source-over';
  fogKey = key;
  return fogCanvas;
}

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
  else { tap = { ...c, px: e.clientX, py: e.clientY, at: performance.now() }; }
}
function onMove(e) {
  hoverCell = pickCell(e);
  if (drag) { drag.px = e.clientX; drag.py = e.clientY; }
  const c = hoverCell;
  const onToken = c && state.tokens.some(t => t.x === c.x && t.y === c.y);
  canvas.style.cursor = !c ? 'default'
    : onToken ? 'grab'
    : (isWalkable(c.x, c.y) && !state.downed && !state.challenge && !state.oath && !state.warmup) ? 'pointer'
    : 'not-allowed';
}
function onUp(e) {
  if (drag) {
    const c = pickCell(e);
    const t = drag.token;
    drag = null;
    if (c && (c.x !== t.x || c.y !== t.y) && isWalkable(c.x, c.y)) {
      lastPos.set(t.id, c);
      moveToken({ tokenId: t.id, x: c.x, y: c.y });
      ring(c.x, c.y, '#F2C14E');
      emit('player-move');
    }
    return;
  }
  // A press and release on the same empty cell is a click, not a stray drag.
  if (!tap) return;
  const c = pickCell(e);
  const slip = Math.hypot(e.clientX - tap.px, e.clientY - tap.py);
  const quick = performance.now() - tap.at < 800;
  tap = null;
  if (c && slip < 12 && quick) walkTo(c);
}

// Click the floor and the party walks there. Dragging a token was the only way
// to move anything, which nobody guesses — and the one thing every player tries
// on a map is clicking where they want to go.
export function walkTo(c) {
  if (!isWalkable(c.x, c.y)) { ring(c.x, c.y, '#D9534F'); return { error: 'wall' }; }
  if (state.downed) { ring(c.x, c.y, '#D9534F'); return { error: 'A hero is down — time has stopped.' }; }
  if (state.challenge || state.oath || state.warmup) { ring(c.x, c.y, '#D9534F'); return { error: 'The table is waiting on you.' }; }

  // In a fight you move whoever's turn it is; out of one the party travels
  // together, which is what "we go over there" means at a real table.
  const actor = state.combat.active
    ? state.tokens.find(t => t.id === state.combat.order[state.combat.turnIndex])
    : null;
  const r = (actor && actor.kind === 'pc')
    ? moveParty({ x: c.x, y: c.y, who: actor.id })
    : moveParty({ x: c.x, y: c.y });
  if (r?.error) { ring(c.x, c.y, '#D9534F'); return r; }
  ring(c.x, c.y, '#F2C14E');
  emit('player-move');                 // the DM reacts to it like any other move
  return r;
}

// ── render loop ──────────────────────────────────────────────────────────────
function frame(now) {
  const dt = Math.min(48, now - lastFrame);
  lastFrame = now;
  step(dt);
  draw(now);
  requestAnimationFrame(frame);
}

function draw(now) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const pal = TILE_COLORS[state.scene.mapId] || TILE_COLORS.dungeon;
  const rows = currentMap().rows;

  ctx.save();
  if (fx.shake && !CALM) {
    ctx.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake);
  }

  ctx.fillStyle = pal.void || '#14101C';
  ctx.fillRect(-20, -20, w + 40, h + 40);

  // ── tiles ─────────────────────────────────────────────────────────────────
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const t = rows[y]?.[x] ?? '#';
      const [px, py] = cellXY(x, y);
      const n = hash(x, y);

      ctx.fillStyle = pal[t] || pal['.'];
      ctx.fillRect(px, py, cell, cell);

      // per-stone shade variation — flat colour reads as printed paper
      ctx.fillStyle = n > 0.5 ? 'rgba(255,255,255,.045)' : 'rgba(0,0,0,.07)';
      ctx.fillRect(px, py, cell, cell);

      if (t === '#') {
        ctx.fillStyle = pal.edge;
        ctx.fillRect(px, py + cell * 0.72, cell, cell * 0.28);
        ctx.fillStyle = 'rgba(255,255,255,.06)';
        ctx.fillRect(px, py, cell, cell * 0.1);          // top light catch
      }
      if (t === ',') {
        ctx.fillStyle = pal.edge;
        ctx.beginPath(); ctx.arc(px + cell * (0.24 + n * 0.2), py + cell * 0.62, cell * 0.06, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(px + cell * (0.6 + n * 0.18), py + cell * 0.33, cell * 0.045, 0, 7); ctx.fill();
      }
      if (t === '~') {
        ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2;
        const bob = Math.sin(now / 620 + x * 0.9 + y) * cell * 0.05;
        ctx.beginPath();
        ctx.moveTo(px + cell * .15, py + cell * .5 + bob);
        ctx.quadraticCurveTo(px + cell * .35, py + cell * .34 + bob, px + cell * .5, py + cell * .5 + bob);
        ctx.quadraticCurveTo(px + cell * .68, py + cell * .66 + bob, px + cell * .85, py + cell * .5 + bob);
        ctx.stroke();
      }
      if (t === 'L') {
        const pulse = 1 + 0.3 * Math.sin(now / 300 + x + y);
        const g = ctx.createRadialGradient(px + cell / 2, py + cell / 2, 0, px + cell / 2, py + cell / 2, cell * 0.5);
        g.addColorStop(0, 'rgba(255,180,90,.42)');
        g.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = g;
        ctx.fillRect(px - cell * .2, py - cell * .2, cell * 1.4, cell * 1.4);
        ctx.fillStyle = '#FFD86B';
        ctx.beginPath(); ctx.arc(px + cell * .5, py + cell * .5, cell * .1 * pulse, 0, 7); ctx.fill();
      }
      if (t === 'D') {
        ctx.strokeStyle = pal.edge; ctx.lineWidth = 2;
        for (let i = 1; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(px + (cell / 4) * i, py + 4);
          ctx.lineTo(px + (cell / 4) * i, py + cell - 4);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,220,150,.14)';
        ctx.fillRect(px, py, cell, cell);
      }

      ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1;
      ctx.strokeRect(px + .5, py + .5, cell - 1, cell - 1);
    }
  }

  // ── torchlight ────────────────────────────────────────────────────────────
  // Warm pools around the party and every fire, with a slow flicker. This is
  // what turns a grey grid into a dungeon.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const flicker = CALM ? 1 : 1 + Math.sin(now / 170) * 0.045 + Math.sin(now / 61) * 0.025;
  const lights = [];
  state.tokens.filter(t => t.kind === 'pc').forEach(t => lights.push({ x: t.x, y: t.y, r: 4.2, c: [255, 184, 98], i: 0.40 }));
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
    if ((rows[y]?.[x]) === 'L') lights.push({ x, y, r: 2.2, c: [255, 138, 52], i: 0.30 });
  }
  for (const L of lights) {
    const [px, py] = cellXY(L.x, L.y);
    const R = L.r * cell * flicker;
    const g = ctx.createRadialGradient(px + cell / 2, py + cell / 2, cell * 0.2, px + cell / 2, py + cell / 2, R);
    g.addColorStop(0, `rgba(${L.c[0]},${L.c[1]},${L.c[2]},${L.i})`);
    g.addColorStop(0.4, `rgba(${L.c[0]},${L.c[1]},${L.c[2]},${L.i * 0.34})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(px + cell / 2 - R, py + cell / 2 - R, R * 2, R * 2);
  }
  ctx.restore();

  // hover — an empty walkable cell is a destination, and should look like one
  if (hoverCell && isWalkable(hoverCell.x, hoverCell.y)) {
    const [px, py] = cellXY(hoverCell.x, hoverCell.y);
    const empty = !state.tokens.some(t => t.x === hoverCell.x && t.y === hoverCell.y);
    const barred = state.downed || state.challenge || state.oath || state.warmup;
    const tint = barred ? '#D9534F' : '#F2C14E';
    if (empty && !barred) {
      ctx.fillStyle = 'rgba(242,193,78,.18)';
      ctx.fillRect(px + 2, py + 2, cell - 4, cell - 4);
      // a small footprint mark, so it reads as "walk here" rather than "selected"
      ctx.fillStyle = 'rgba(242,193,78,.75)';
      ctx.beginPath();
      ctx.ellipse(px + cell / 2, py + cell * .58, cell * .12, cell * .08, 0, 0, 7);
      ctx.fill();
    }
    ctx.strokeStyle = tint; ctx.lineWidth = 3;
    ctx.strokeRect(px + 2, py + 2, cell - 4, cell - 4);
  }

  // ── tokens ────────────────────────────────────────────────────────────────
  for (const t of [...state.tokens].sort((a, b) => a.y - b.y)) {
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

  // ── fog of war, with soft edges ───────────────────────────────────────────
  // Punched on its own buffer: destination-out on the main canvas would erase
  // the dungeon along with the fog.
  ctx.drawImage(fogLayer(w, h), 0, 0);

  drawFx(ctx, cellXY, cell);

  // ── vignette ──────────────────────────────────────────────────────────────
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.34, w / 2, h / 2, Math.max(w, h) * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  if (fx.flash) {
    const k = (performance.now() - fx.flash.t0) / fx.flash.life;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - k);
    ctx.fillStyle = fx.flash.colour;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  ctx.restore();
}

/** A stable number in [0,1) from a token's id — the same token varies the same
 *  way every frame and every reload. */
function hashUnit(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

function drawToken(t, px, py, now, lifted) {
  const img = TOKEN_ART[t.art] || TOKEN_ART.villager;
  const pad = cell * 0.08;
  const isTurn = state.combat.active && state.combat.order[state.combat.turnIndex] === t.id;
  const seed = t.id.charCodeAt(0) + t.id.length;
  const bob = (CALM || t.hp === 0) ? 0 : Math.sin(now / 700 + seed) * cell * 0.022;

  ctx.fillStyle = 'rgba(0,0,0,.42)';
  ctx.beginPath();
  ctx.ellipse(px + cell / 2, py + cell * .88, cell * .32, cell * .1, 0, 0, 7);
  ctx.fill();

  if (isTurn) {
    const pulse = CALM ? 0 : 2.5 * Math.sin(now / 220);
    ctx.save();
    ctx.shadowColor = '#F2C14E'; ctx.shadowBlur = 16;
    ctx.strokeStyle = '#F2C14E'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(px + cell / 2, py + cell / 2, cell * .52 + pulse, 0, 7); ctx.stroke();
    ctx.restore();
  }

  const lift = lifted ? -8 : bob;
  if (img.complete) {
    // Two goblins used to be the same goblin, pixel for pixel. Monsters get a
    // deterministic tint, a size nudge and sometimes a mirror, all derived from
    // their own id — so a room full of them reads as a room full of creatures
    // rather than a row of stamps. Heroes and objects are left exactly as drawn:
    // the player should always recognise their own party instantly.
    // A named boss is drawn once, deliberately, and must look exactly as drawn —
    // the tint that keeps five goblins apart was turning the Cinder Wight's
    // burning crown green. Variation is for the rank and file.
    const vary = t.kind === 'monster' && (t.scale || 1) <= 1;
    const u = vary ? hashUnit(t.id) : 0;
    const v = vary ? hashUnit(t.id + '~') : 0;   // a second, independent axis
    const size = cell - pad * 2;
    ctx.save();
    if (vary) {
      ctx.shadowColor = 'rgba(217,83,79,.55)'; ctx.shadowBlur = 10;
      // Hue stays on a short leash — swing it far and a red dragon comes out
      // pink, which is variety at the cost of knowing what you are fighting.
      // Lightness and saturation do the heavy lifting instead: at 40px a pale
      // goblin next to a dark one reads as two creatures long before a
      // 20-degree hue shift does.
      const hue = Math.round((u - 0.5) * 50);
      const light = (0.72 + v * 0.58).toFixed(2);
      const sat = (0.66 + u * 0.72).toFixed(2);
      if (typeof ctx.filter === 'string') {
        ctx.filter = `hue-rotate(${hue}deg) saturate(${sat}) brightness(${light})`;
      }
    }
    // A token's own scale (a boss is 2) multiplies the small random variation.
    const grow = (t.scale || 1) * (vary ? 1 + (v - 0.5) * 0.32 : 1);
    const w = size * grow, off = (size - w) / 2;
    if (vary && u > 0.5) {                                  // half of them face the other way
      ctx.translate(px + pad + off + w, py + pad + off + lift);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, w, w);
    } else {
      ctx.drawImage(img, px + pad + off, py + pad + off + lift, w, w);
    }
    ctx.restore();
  }

  if (t.maxHp && (t.hp < t.maxHp || t.kind !== 'object')) {
    const bw = cell * .7, bx = px + (cell - bw) / 2, by = py + 1;
    ctx.fillStyle = '#2E2233'; ctx.fillRect(bx - 1, by - 1, bw + 2, 6);
    const frac = Math.max(0, t.hp / t.maxHp);
    ctx.fillStyle = frac > .5 ? '#79B255' : frac > .25 ? '#F2C14E' : '#D9534F';
    ctx.fillRect(bx, by, bw * frac, 4);
  }

  if (t.conditions?.length) {
    ctx.fillStyle = '#A46BFF';
    t.conditions.slice(0, 4).forEach((c, i) => {
      ctx.beginPath(); ctx.arc(px + cell * .16 + i * 8, py + cell * .95 - 4, 3.4, 0, 7); ctx.fill();
      ctx.strokeStyle = '#2E2233'; ctx.lineWidth = 1.4; ctx.stroke();
    });
  }

  if (t.hp === 0) {
    ctx.strokeStyle = '#D9534F'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px + cell * .25, py + cell * .25); ctx.lineTo(px + cell * .75, py + cell * .75);
    ctx.moveTo(px + cell * .75, py + cell * .25); ctx.lineTo(px + cell * .25, py + cell * .75);
    ctx.stroke();
  }
}
