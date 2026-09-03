// ── Arcana Table · effects ───────────────────────────────────────────────────
// Floating numbers, sparks, and screen shake. The board should react to a hit,
// not just update a number.

export const fx = {
  items: [],          // {kind, x, y, text, colour, t0, life, vx, vy}
  shake: 0,           // pixels of camera kick, decays each frame
  flash: null,        // {colour, t0, life} full-board tint
};

const now = () => performance.now();

export function damageNumber(x, y, amount) {
  const heal = amount > 0;
  fx.items.push({
    kind: 'number',
    x, y,
    text: heal ? `+${amount}` : `${amount}`,
    colour: heal ? '#79B255' : '#FF5A54',
    t0: now(), life: 1100,
    vy: -0.9, vx: (Math.random() - 0.5) * 0.35,
    size: heal ? 1 : Math.min(1.9, 1 + Math.abs(amount) / 14),
  });
  if (!heal) {
    burst(x, y, Math.abs(amount) > 8 ? 16 : 9, '#FF8A54');
    kick(Math.min(11, 3 + Math.abs(amount) * 0.55));
  }
}

export function burst(x, y, n = 10, colour = '#F2C14E') {
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
    const speed = 0.6 + Math.random() * 1.5;
    fx.items.push({
      kind: 'spark', x, y, colour,
      t0: now(), life: 500 + Math.random() * 420,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 0.3,
      r: 1.6 + Math.random() * 2.6,
    });
  }
}

export function ring(x, y, colour = '#F2C14E') {
  fx.items.push({ kind: 'ring', x, y, colour, t0: now(), life: 620 });
}

/**
 * The arc of a melee swing, drawn from the attacker's square through the
 * target's. Combat used to be entirely legible and entirely invisible — a line
 * in the log and two numbers changing — so who swung at whom never read on the
 * board itself.
 */
export function slash(from, to, { crit = false, hit = true } = {}) {
  fx.items.push({
    kind: 'slash', x: from.x, y: from.y, to,
    colour: crit ? '#F2C14E' : hit ? '#EFE7D2' : '#8A8194',
    t0: now(), life: crit ? 460 : 340, crit, hit,
  });
  if (hit) kick(crit ? 12 : 5);
}

export function kick(px = 6) { fx.shake = Math.max(fx.shake, px); }

export function flash(colour = 'rgba(242,193,78,.30)', life = 420) {
  fx.flash = { colour, t0: now(), life };
}

/** Advance the sim. Called once per rendered frame. */
export function step(dt) {
  const t = now();
  fx.shake *= Math.pow(0.86, dt / 16);
  if (fx.shake < 0.15) fx.shake = 0;
  if (fx.flash && t - fx.flash.t0 > fx.flash.life) fx.flash = null;
  fx.items = fx.items.filter(it => t - it.t0 < it.life);
  for (const it of fx.items) {
    if (it.kind === 'ring') continue;
    it.x += (it.vx || 0) * (dt / 16) * 0.03;
    it.y += (it.vy || 0) * (dt / 16) * 0.03;
    if (it.kind === 'spark') it.vy += 0.055 * (dt / 16);   // a little gravity
  }
}

/** Draw everything in board space. cellXY maps grid → pixels. */
export function draw(ctx, cellXY, cell) {
  const t = now();
  for (const it of fx.items) {
    const k = (t - it.t0) / it.life;               // 0 → 1
    const [px, py] = cellXY(it.x, it.y);
    const cx = px + cell / 2, cy = py + cell / 2;

    if (it.kind === 'number') {
      const rise = k * cell * 0.9;
      ctx.save();
      ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - Math.pow(k, 2.4);
      ctx.font = `800 ${Math.round(cell * 0.42 * (it.size || 1))}px "Baloo 2", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 5; ctx.strokeStyle = '#2E2233';
      ctx.strokeText(it.text, cx, cy - rise);
      ctx.fillStyle = it.colour;
      ctx.fillText(it.text, cx, cy - rise);
      ctx.restore();
    }

    if (it.kind === 'spark') {
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = it.colour;
      ctx.beginPath();
      ctx.arc(cx, cy, it.r * (1 - k * 0.55), 0, 7);
      ctx.fill();
      ctx.restore();
    }

    if (it.kind === 'slash') {
      // A crescent swept along the line of attack: it leans out from the
      // attacker, peaks across the target, and thins as it goes.
      const [tx, ty] = cellXY(it.to.x, it.to.y);
      const ax = px + cell / 2, ay = py + cell / 2;
      const bx = tx + cell / 2, by = ty + cell / 2;
      const ang = Math.atan2(by - ay, bx - ax);
      const reach = Math.hypot(bx - ax, by - ay) + cell * 0.34;
      // Sweep about 130° of arc, carried across the life of the effect.
      const sweep = 2.27;
      const head = -sweep / 2 + sweep * Math.min(1, k * 1.35);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      ctx.globalAlpha = (1 - k) * (it.hit ? 0.95 : 0.5);
      ctx.strokeStyle = it.colour;
      ctx.lineCap = 'round';
      ctx.lineWidth = (it.crit ? 9 : 6) * (1 - k * 0.7) + 1;
      ctx.beginPath();
      ctx.arc(0, 0, reach * 0.62, head - 0.55, head);
      ctx.stroke();
      // A brighter leading edge, so the swing has a tip rather than a smear.
      ctx.globalAlpha = (1 - k) * (it.hit ? 0.8 : 0.35);
      ctx.lineWidth = ctx.lineWidth * 0.45;
      ctx.strokeStyle = it.crit ? '#FFF3DC' : it.colour;
      ctx.beginPath();
      ctx.arc(0, 0, reach * 0.62, head - 0.18, head);
      ctx.stroke();
      ctx.restore();
    }

    if (it.kind === 'ring') {
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = it.colour;
      ctx.lineWidth = 4 * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(cx, cy, cell * (0.25 + k * 0.85), 0, 7);
      ctx.stroke();
      ctx.restore();
    }
  }
}
