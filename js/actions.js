// ── Arcana Table · actions ───────────────────────────────────────────────────
// Every game mutation is a named action. The UI buttons call these; the WebMCP
// tools call these. One API, two hands on the table.

import {
  state, save, findToken, isWalkable, GRID_W, GRID_H, MAPS, QUEST,
  REACH, DEFAULT_REACH, gridDistance, attackBonusOf,
  DEATH_SAVE_DC, DEATH_SAVE_FAILS, STRETCHES, WARMUP_PLANS, warmupSeq, OATH_KINDS,
  EFFORT_PREFS,
} from './state.js';

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); }
export function emit(what = 'state') { listeners.forEach(fn => fn(what)); save(); }

export function logStory(type, actor, text) {
  state.log.push({ t: Date.now(), type, actor, text });
  if (state.log.length > 300) state.log.shift();
}

// ── rewards vocabulary (Heroic Effort) ───────────────────────────────────────
export const REWARDS = {
  'bonus+2':   { label: '+2 to your next roll',                 apply: b => { b.bonus += 2; } },
  'bonus+3':   { label: '+3 to your next roll',                 apply: b => { b.bonus += 3; } },
  'bonus+5':   { label: '+5 to your next roll',                 apply: b => { b.bonus += 5; } },
  'bonus+8':   { label: '+8 to your next roll',                 apply: b => { b.bonus += 8; } },
  'advantage': { label: 'Advantage on your next roll',          apply: b => { b.advantage = true; } },
  'set10':     { label: 'Next d20 lands on a solid 10',         apply: b => { b.setRoll = 10; } },
  'nat20':     { label: 'NATURAL 20 — the bard will sing of this', apply: b => { b.setRoll = 20; } },
};

// The price list, so effort and reward stay in proportion: five push-ups is
// worth +2, ten is worth +5, and a natural 20 costs you something real. The DM
// used to pick a reward with no relation to the size of the ask, which made the
// bargain feel arbitrary in both directions.
export const EFFORT_SCALE = [
  { reward: 'bonus+2',   reps: 5,  seconds: 20, oathMinutes: 5  },
  { reward: 'bonus+3',   reps: 8,  seconds: 25, oathMinutes: 8  },
  { reward: 'bonus+5',   reps: 10, seconds: 30, oathMinutes: 10 },
  { reward: 'advantage', reps: 12, seconds: 40, oathMinutes: 12 },
  { reward: 'bonus+8',   reps: 15, seconds: 45, oathMinutes: 15 },
  { reward: 'set10',     reps: 20, seconds: 60, oathMinutes: 20 },
  { reward: 'nat20',     reps: 25, seconds: 90, oathMinutes: 25 },
];

/** What an ask of this size is worth. Used when the DM names no reward. */
export function rewardFor(amount, kind = 'reps') {
  const key = kind === 'oath' ? 'oathMinutes' : kind === 'hold' ? 'seconds' : 'reps';
  let best = EFFORT_SCALE[0];
  for (const tier of EFFORT_SCALE) if (amount >= tier[key]) best = tier;
  return best.reward;
}

/** What this reward costs, so the DM can be told when its price is off. */
export function priceOf(reward, kind = 'reps') {
  const key = kind === 'oath' ? 'oathMinutes' : kind === 'hold' ? 'seconds' : 'reps';
  return EFFORT_SCALE.find(t => t.reward === reward)?.[key] ?? null;
}

// Everything the game knows how to ask for. What it may actually ask THIS
// player for is state.settings.exercisePool — bodies differ, and a challenge
// you cannot physically do is not a challenge, it is a wall.
export const EXERCISES = ['push-ups', 'crunches', 'jumping jacks', 'squats', 'sit-ups', 'lunges', 'high knees', 'mountain climbers', 'burpees'];

// Holds are a different list, and keeping them out of EXERCISES is what broke
// them: mode "hold" was validated against the REPS list, so every plank and wall
// sit the DM offered came back "Unknown exercise" — a headline mechanic, and the
// one the intro card advertises, failing every time it was reached for.
export const HOLDS = ['plank', 'side plank', 'high plank', 'wall sit', 'squat hold', 'dead hang', 'hollow hold', 'glute bridge'];

export function allowedExercises() {
  const pool = state.settings.exercisePool;
  return Array.isArray(pool) && pool.length ? pool.filter(e => EXERCISES.includes(e)) : EXERCISES;
}

export function allowedHolds() {
  const pool = state.settings.holdPool;
  return Array.isArray(pool) && pool.length ? pool.filter(e => HOLDS.includes(e)) : HOLDS;
}

// ── which currency this table may charge in ──────────────────────────────────
// A player who cannot exercise had to say so out loud and hope the DM kept
// remembering it. Now they set it once and the TOOLS refuse the wrong kind of
// ask, which is the only version of a preference a language model cannot drift
// away from. Unknown or missing (an old save) reads as "anything".
export { EFFORT_PREFS };

export function effortPref() {
  const p = state.settings?.effortPref;
  return EFFORT_PREFS[p] ? p : 'any';
}

export function setEffortPref(pref) {
  if (!EFFORT_PREFS[pref]) return { error: `Unknown preference "${pref}". Choose: ${Object.keys(EFFORT_PREFS).join(', ')}.` };
  if (!state.settings) state.settings = {};
  state.settings.effortPref = pref;
  emit('fitness');
  return { effortPreference: pref, label: EFFORT_PREFS[pref].label };
}

/** Null if this kind of ask is allowed, otherwise the refusal the DM should read. */
function effortGate(kind) {          // kind: 'reps' | 'hold' | 'oath'
  const pref = effortPref();
  if (pref === 'any') return null;
  const p = EFFORT_PREFS[pref];
  const ok = kind === 'oath' ? p.oaths : p.modes.includes(kind);
  if (ok) return null;
  const instead = pref === 'oaths'
    ? 'Call propose_oath instead — something real in the room, priced in minutes. It pays exactly the same.'
    : pref === 'reps'
      ? 'Call propose_challenge with mode "reps" instead.'
      : 'Call propose_challenge with mode "hold" instead.';
  const asked = kind === 'oath' ? 'An Oath' : kind === 'hold' ? 'A timed hold' : 'A rep exercise';
  return {
    error: `This player has set their effort preference to "${p.label}" (${p.hint}). ` +
           `${asked} is not something they have agreed to be asked for. ${instead}`,
    effortPreference: pref,
    useInstead: pref === 'oaths' ? 'propose_oath' : 'propose_challenge',
  };
}

/** What this player may be asked for in a given mode. */
export function allowedFor(mode) {
  return mode === 'hold' ? allowedHolds() : allowedExercises();
}

// ── dice ─────────────────────────────────────────────────────────────────────
export function parseFormula(formula) {
  const m = String(formula || 'd20').trim().toLowerCase().replace(/\s+/g, '')
    .match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (!m) return null;
  return { n: Math.min(parseInt(m[1] || '1', 10), 20), sides: parseInt(m[2], 10), mod: parseInt(m[3] || '0', 10) };
}

export function rollDice({ formula = 'd20', reason = '', forPlayer = true } = {}) {
  const p = parseFormula(formula);
  if (!p) return { error: `Could not parse dice formula "${formula}". Try "d20", "2d6+3".` };

  // Heroic boosts belong to the player. A monster's swing must never spend the
  // natural 20 someone just did push-ups for — which it could, and did.
  const b = forPlayer ? state.boosts : { bonus: 0, advantage: false, setRoll: null };
  const boostsUsed = [];
  let rolls = [];

  const rollOnce = () => Array.from({ length: p.n }, () => 1 + Math.floor(Math.random() * p.sides));

  if (p.sides === 20 && p.n === 1 && b.setRoll != null) {
    rolls = [b.setRoll];
    boostsUsed.push(b.setRoll === 20 ? 'Heroic Effort: NATURAL 20' : `Heroic Effort: die set to ${b.setRoll}`);
    b.setRoll = null;
  } else if (p.sides === 20 && p.n === 1 && b.advantage) {
    const a = rollOnce()[0], c = rollOnce()[0];
    rolls = [Math.max(a, c)];
    boostsUsed.push(`Advantage (rolled ${a} & ${c}, kept ${Math.max(a, c)})`);
    b.advantage = false;
  } else {
    rolls = rollOnce();
  }

  let bonus = 0;
  if (b.bonus) { bonus = b.bonus; boostsUsed.push(`Heroic Effort +${b.bonus}`); b.bonus = 0; }

  const total = rolls.reduce((s, r) => s + r, 0) + p.mod + bonus;
  const nat20 = p.sides === 20 && p.n === 1 && rolls[0] === 20;
  const nat1  = p.sides === 20 && p.n === 1 && rolls[0] === 1 && !boostsUsed.length;

  const result = { formula, reason, rolls, mod: p.mod, bonus, total, sides: p.sides, nat20, nat1, boostsUsed, t: Date.now() };
  // Every roll the player sees counts toward the pacing clock, including the
  // ones the attack tool makes for itself — from the chair they are all rolls.
  state.fitness.rollsSinceOffer = (state.fitness.rollsSinceOffer || 0) + 1;
  state.fitness.rollGateWaived = false;   // one waiver, spent — see rollGateRefusal
  state.dice = result;
  logStory('roll', 'Dice', `${reason ? reason + ' — ' : ''}${formula}: [${rolls.join(', ')}]` +
    (p.mod ? ` ${p.mod > 0 ? '+' : ''}${p.mod}` : '') + (bonus ? ` +${bonus}⚡` : '') + ` = ${total}` +
    (nat20 ? ' — NATURAL 20!' : nat1 ? ' — natural 1…' : ''));
  emit('dice');
  return result;
}

// ── board ────────────────────────────────────────────────────────────────────
export function moveToken({ tokenId, x, y }) {
  const t = findToken(tokenId);
  if (!t) return { error: `No token matches "${tokenId}".` };
  x = Math.max(0, Math.min(GRID_W - 1, Math.round(x)));
  y = Math.max(0, Math.min(GRID_H - 1, Math.round(y)));
  if (!isWalkable(x, y)) return { error: `(${x},${y}) is a wall — pick an open floor cell.` };
  const from = { x: t.x, y: t.y };
  t.x = x; t.y = y;
  if (t.kind === 'pc') revealPath(from, { x, y }, 3);
  logStory('action', t.name, `moved to (${x}, ${y})`);
  emit();
  return { ok: true, token: t.id, x, y };
}

/** The nearest open cell to (x,y) that nothing is standing on. */
function nearestFree(x, y, taken) {
  for (let r = 0; r < 8; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const cx = x + dx, cy = y + dy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;   // walk the ring
      if (!isWalkable(cx, cy)) continue;
      if (taken.has(`${cx},${cy}`)) continue;
      return { x: cx, y: cy };
    }
  }
  return null;
}

// The party travels together. Asking the model for one move_token per hero
// meant it narrated the walk and left everyone standing in the last room —
// routine travel is exactly the bookkeeping a model skips. One call moves the
// whole party, keeps the companions at the leader's shoulder, and lifts the fog
// at the far end, so "we head through the door" is a single, reliable act.
export function moveParty({ x, y, who = 'all' }) {
  const pcs = state.tokens.filter(t => t.kind === 'pc' && (who === 'all' || t.id === who || t.name === who));
  if (!pcs.length) return { error: who === 'all' ? 'No party on the board.' : `No party member matches "${who}".` };
  x = Math.max(0, Math.min(GRID_W - 1, Math.round(x)));
  y = Math.max(0, Math.min(GRID_H - 1, Math.round(y)));
  // A wall used to be an error the DM had to notice and retry, and a live run
  // burned three calls on exactly that. Travel is not a precision act: land on
  // the nearest open floor instead and say where they actually ended up.
  let nudged = null;
  if (!isWalkable(x, y)) {
    const near = nearestFree(x, y, new Set());
    if (!near) return { error: `Nothing open anywhere near (${x},${y}). Call get_board_state.` };
    nudged = { asked: { x, y }, landed: near };
    x = near.x; y = near.y;
  }

  // Everyone not travelling still occupies their cell.
  const taken = new Set(state.tokens.filter(t => !pcs.includes(t)).map(t => `${t.x},${t.y}`));
  const moved = [];
  pcs.forEach((t, i) => {
    const spot = i === 0 ? { x, y } : nearestFree(x, y, taken);
    if (!spot) return;
    taken.add(`${spot.x},${spot.y}`);
    const from = { x: t.x, y: t.y };
    t.x = spot.x; t.y = spot.y;
    revealPath(from, spot, 3);
    moved.push({ token: t.id, name: t.name, x: spot.x, y: spot.y });
  });
  if (!moved.length) return { error: `Nowhere to stand near (${x},${y}) — every cell is occupied.` };
  logStory('action', 'Party', `moves to (${x}, ${y}).`);
  emit();
  return { ok: true, moved, left: pcs.length - moved.length,
           ...(nudged ? { note: `(${nudged.asked.x},${nudged.asked.y}) is wall; the party stopped at (${x},${y}).` } : {}) };
}

export function addToken({ name, kind = 'monster', art, x, y, hp = 10, maxHp, scale }) {
  if (!name) return { error: 'Token needs a name.' };
  const arts = ['knight', 'wizard', 'goblin', 'skeleton', 'dragon', 'wolf', 'ooze', 'spider', 'wraith', 'ogre', 'rat', 'warden', 'wight', 'chest', 'villager'];
  if (!art) art = kind === 'monster' ? 'goblin' : kind === 'object' ? 'chest' : 'villager';
  if (!arts.includes(art)) return { error: `Unknown art "${art}". Choose one of: ${arts.join(', ')}.` };
  let px = Math.max(0, Math.min(GRID_W - 1, Math.round(x ?? 10)));
  let py = Math.max(0, Math.min(GRID_H - 1, Math.round(y ?? 6)));
  // nudge to nearest walkable cell
  outer: for (let r = 0; r < 8; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (isWalkable(px + dx, py + dy)) { px += dx; py += dy; break outer; }
    }
  }
  const id = `${kind}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.random().toString(36).slice(2, 6)}`;
  const r = REACH[art] || DEFAULT_REACH;
  const tok = { id, name, kind, art, x: px, y: py, hp, maxHp: maxHp ?? hp,
                reach: r.reach, range: r.range,
                // A boss should read as one from across the room, so it draws
                // bigger than its square rather than politely inside it.
                scale: Math.max(1, Math.min(2.5, Number(scale) || 1)),
                conditions: [], inventory: [] };
  state.tokens.push(tok);
  logStory('action', 'DM', `${name} appears on the board.`);
  // "The vault warden didn't swing once." A monster that arrives mid-fight was
  // never in the initiative order, so it stood there for the whole battle. It
  // joins the round now, at the end, and acts when the turn comes to it.
  let joined = false;
  if (state.combat.active && kind === 'monster') { state.combat.order.push(tok.id); joined = true; }
  emit();
  return { ok: true, token: tok, ...(joined ? { joinedCombat: true, note: `${name} joins the fight and acts at the end of this round.` } : {}) };
}

export function removeToken({ tokenId }) {
  const t = findToken(tokenId);
  if (!t) return { error: `No token matches "${tokenId}".` };
  state.tokens = state.tokens.filter(x => x.id !== t.id);
  dropFromOrder(t.id);          // same turn-index care as a token that dies
  logStory('action', 'DM', `${t.name} is removed from the board.`);
  emit();
  return { ok: true, removed: t.id };
}

export function revealAround(x, y, radius = 3) {
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    if (dx * dx + dy * dy <= radius * radius + 1) {
      const cx = x + dx, cy = y + dy;
      if (cx >= 0 && cx < GRID_W && cy >= 0 && cy < GRID_H) {
        const key = `${cx},${cy}`;
        if (!state.revealed.includes(key)) state.revealed.push(key);
      }
    }
  }
}

/** Light every cell you actually walked through, not just the two ends of the
 *  walk. Revealing only origin and destination left a dark corridor between two
 *  lit rooms, which reads as a rendering bug — you carried a torch down it. */
export function revealPath(from, to, radius = 3) {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  if (steps === 0) return revealAround(to.x, to.y, radius);
  for (let i = 0; i <= steps; i++) {
    revealAround(Math.round(from.x + ((to.x - from.x) * i) / steps),
                 Math.round(from.y + ((to.y - from.y) * i) / steps), radius);
  }
}

export function revealArea({ x, y, radius = 3 }) {
  x = Math.round(x); y = Math.round(y);
  revealAround(x, y, Math.min(Math.round(radius), 10));
  logStory('action', 'DM', `The gloom recedes around (${x}, ${y}).`);
  emit();
  return { ok: true, x, y, radius };
}

/** The only way the map changes: the quest moves the party. Not a tool. */
function travelTo(mapId) {
  if (!MAPS[mapId] || mapId === state.scene.mapId) return;
  const map = MAPS[mapId];
  // "The glade changed but the chest remained." A new map is a new place: what
  // stood on the old one — the chest, the dead, anything the DM spawned — does
  // not come along. Only the party travels, and it arrives at the door.
  state.tokens = state.tokens.filter(t => t.kind === 'pc');
  if (state.combat.active) state.combat = { active: false, order: [], turnIndex: 0, round: 0 };
  state.scene.mapId = mapId;
  state.scene.title = map.name;
  state.scene.mood = map.mood || state.scene.mood;      // not "torchlight over wet stone" in a forest
  state.revealed = [];
  const entry = map.entry || { x: 2, y: 2 };
  const pcs = state.tokens.filter(t => t.kind === 'pc');
  const taken = new Set();
  pcs.forEach((t, i) => {
    const spot = i === 0 && isWalkable(entry.x, entry.y) ? entry : nearestFree(entry.x, entry.y, taken);
    if (spot) { t.x = spot.x; t.y = spot.y; taken.add(`${spot.x},${spot.y}`); }
    revealAround(t.x, t.y, 3);
  });
  logStory('scene', 'DM', `— ${state.scene.title} —`);
}

export function setScene({ mapId, title, mood }) {
  if (mapId && !MAPS[mapId]) return { error: `Unknown map "${mapId}". Choose: ${Object.keys(MAPS).join(', ')}.` };
  if (mapId && mapId !== state.scene.mapId) {
    // The prompt said "do not switch maps with set_scene" and the DM did it
    // anyway: walked the party into the glade, changed the map, and never called
    // advance_quest — so the beat was never cleared and the player crossed the
    // whole glade for nothing. Maps belong to beats. Only advance_quest moves
    // the party between them, because that is the call that pays.
    const beat = currentBeat();
    return {
      error: `set_scene cannot change the map. The board is on "${state.scene.mapId}" because the current ` +
             `beat ("${beat?.title}") is set there. If the party has done what that beat asked, call ` +
             `advance_quest — it changes the map for you AND pays the milestone. If they have not, they ` +
             `are not leaving yet. Use set_scene for the title and mood only.`,
      useInstead: 'advance_quest', currentMap: state.scene.mapId, beat: beat?.title,
    };
  }
  if (title) state.scene.title = title;
  if (mood) state.scene.mood = mood;
  state.tokens.filter(t => t.kind === 'pc').forEach(t => revealAround(t.x, t.y, 3));
  logStory('scene', 'DM', `— ${state.scene.title} — ${state.scene.mood}`);
  emit();
  return { ok: true, scene: state.scene };
}

export function narrate({ text, speaker = 'DM' }) {
  if (!text) return { error: 'Nothing to narrate.' };
  logStory('narrate', speaker, text);
  emit('log');
  return { ok: true };
}

// ── combat ───────────────────────────────────────────────────────────────────
export function startCombat({ order } = {}) {
  if (state.combat.active) return { error: 'Combat is already running.' };
  let ids;
  if (Array.isArray(order) && order.length) {
    ids = order.map(o => findToken(o)?.id).filter(Boolean);
  } else {
    // auto-initiative: d20 + dex mod-ish
    ids = state.tokens.filter(t => t.kind !== 'object')
      .map(t => ({ id: t.id, init: 1 + Math.floor(Math.random() * 20) }))
      .sort((a, b) => b.init - a.init).map(o => o.id);
  }
  if (!ids.length) return { error: 'No combatants on the board.' };
  state.combat = { active: true, order: ids, turnIndex: 0, round: 1 };
  // You cannot be asked to fight what you cannot see. Every combatant comes out
  // of the fog when the fight starts.
  ids.forEach(id => { const t = findToken(id); if (t) revealAround(t.x, t.y, 2); });
  const first = findToken(ids[0]);
  logStory('combat', 'DM', `⚔ Combat begins! Round 1 — ${first.name} acts first.`);
  emit('combat');
  // If a monster won initiative it does not wait to be introduced.
  const acted = runMonsterTurns();
  const cur = findToken(state.combat.order[state.combat.turnIndex]);
  return { ok: true, order: ids.map(id => findToken(id)?.name), current: cur?.name || first.name,
           ...(acted.length ? { monstersActed: acted, note: 'Monsters that won initiative already acted. Narrate it, then hand the turn to the player.' } : {}) };
}

/** Where to stand to swing at this target: nearest open cell within reach. */
function stepIntoReach(attacker, target, reach) {
  const taken = new Set(state.tokens.filter(t => t.id !== attacker.id).map(t => `${t.x},${t.y}`));
  let best = null;
  for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
    const cx = target.x + dx, cy = target.y + dy;
    if (cx === target.x && cy === target.y) continue;
    if (!isWalkable(cx, cy) || taken.has(`${cx},${cy}`)) continue;
    const d = gridDistance({ x: cx, y: cy }, attacker);
    if (!best || d < best.d) best = { x: cx, y: cy, d };
  }
  return best ? { x: best.x, y: best.y } : null;
}

// A sword swung from eight squares away is the fastest way to make a board feel
// fake. Every attack goes through here, so reach is a rule rather than a
// suggestion the DM may forget: melee has to be adjacent, bows and spells work
// at distance, and a hit always lifts the fog around what was hit — you cannot
// be asked to fight something you were never shown.
export function attack({ attackerId, targetId, kind = 'melee', damage, reason = '' }) {
  const a = findToken(attackerId);
  const t = findToken(targetId);
  if (!a) return { error: `No attacker matches "${attackerId}".` };
  if (!t) return { error: `No target matches "${targetId}".` };
  if (a.id === t.id) return { error: `${a.name} cannot attack themselves.` };
  if (timeStopped()) return { error: 'A hero is down and time has stopped. Nothing swings until they are back up.' };

  const melee = kind === 'melee';
  const limit = melee ? (a.reach ?? 1) : (a.range ?? 0);
  const d = gridDistance(a, t);

  if (limit === 0) {
    const alt = melee ? 'ranged' : 'melee';
    return { error: `${a.name} has no ${kind} attack. Try kind:"${alt}", or move someone who does.`,
             attacker: a.name, reach: a.reach ?? 1, range: a.range ?? 0 };
  }
  if (d > limit) {
    const spot = melee ? stepIntoReach(a, t, limit) : null;

    // A MONSTER CLOSES AND SWINGS. Telling the model "move it, then attack" did
    // not work — it narrated the lunge and left the creature standing across the
    // room, because that is two calls for one obvious act. A monster that could
    // reach the target this turn now does: it walks in and the swing resolves,
    // in the one call the DM already made. Player characters still get the
    // refusal, because where YOUR heroes stand is the player's decision, not the
    // model's.
    if (melee && spot && a.kind === 'monster') {
      const from = { x: a.x, y: a.y };
      a.x = spot.x; a.y = spot.y;
      revealAround(a.x, a.y, 2);
      logStory('combat', a.name, `closes the distance from ${d} squares away.`);
      emit('combat');
      return { ...attack({ attackerId: a.id, targetId: t.id, kind, damage, reason }),
               closed: { from, to: spot, squares: d } };
    }

    return {
      error: `${a.name} is ${d} squares from ${t.name} and a ${kind} attack reaches ${limit}. ` +
             (melee
               ? (spot ? `Move ${a.name} to (${spot.x},${spot.y}) first, then attack.`
                       : `There is nowhere open beside ${t.name} to swing from.`)
               : `Close to within ${limit}, or attack something nearer.`),
      tooFar: true, distance: d, maxDistance: limit, moveTo: spot || undefined,
    };
  }

  // In reach: you can see what you are hitting.
  revealAround(t.x, t.y, 2);

  // A spell cast at distance is a FIREBALL: it bursts, and everything hostile
  // standing next to what you aimed at catches the edge of it. That is the
  // whole reason to keep a caster back rather than walking her into the melee.
  const fireball = kind === 'spell' && d > 1;

  // Through rollDice, so a Heroic Effort boost spends itself on the swing.
  const roll = rollDice({ formula: 'd20', reason: reason || `${a.name} attacks ${t.name}`, forPlayer: a.kind === 'pc' });
  const ac = t.ac ?? 12;
  // d20 + the attacker's bonus against AC. It used to be the bare die, and
  // nothing in the game could reliably touch a knight in plate.
  const atk = attackBonusOf(a);
  const toHit = roll.total + atk;
  const hit = roll.nat20 || (!roll.nat1 && toHit >= ac);
  // A swing should be visible on the board, not only readable in the log — an
  // arc from the attacker through the target, so you can see who went at whom.
  // Set before the hit check, because a miss is a swing too.
  if (melee) state.swingFx = { from: { x: a.x, y: a.y }, to: { x: t.x, y: t.y }, crit: !!roll.nat20, hit, t: Date.now() };

  if (!hit) {
    logStory('combat', a.name, `swings at ${t.name} and misses (${roll.total}+${atk} = ${toHit} vs AC ${ac}).`);
    emit('combat');
    return { ok: true, hit: false, roll: roll.total, attackBonus: atk, toHit, nat1: roll.nat1, targetAc: ac, distance: d, kind };
  }

  // A level should be felt when you swing, not only on the character sheet.
  // Everyone scales with the party's level: heroes hit harder as they level,
  // and so does what they are fighting, or a level-five party with seventy
  // hit points shrugs off the same six-damage goblins it met in the hall.
  const lvl = state.party.level || 1;
  const base = Number(damage) || (roll.nat20 ? 12 : 6);
  const dmg = Math.max(1, Math.round(base + (lvl - 1) * 2));
  const after = updateHp({ tokenId: t.id, delta: -dmg });

  let splash = [];
  if (fireball) {
    // Half damage, rounded down, to every other hostile within one square —
    // and never to the party, because a fireball that kills your own knight is
    // a different game than the one this table is running.
    const edge = Math.max(1, Math.floor(dmg / 2));
    splash = state.tokens
      .filter(o => o.id !== t.id && o.kind === 'monster' && o.hp > 0 && gridDistance(o, t) <= 1)
      .map(o => {
        const r = updateHp({ tokenId: o.id, delta: -edge });
        return { name: o.name, damage: edge, hp: r.hp, down: r.down };
      });
    state.spellFx = { x: t.x, y: t.y, kind: 'fire', t: Date.now() };
    logStory('combat', a.name,
      `hurls a fireball ${d} squares — it bursts over ${t.name}` +
      (splash.length ? ` and catches ${splash.map(x => x.name).join(', ')}.` : '.'));
  }

  emit('combat');
  return { ok: true, hit: true, critical: !!roll.nat20, roll: roll.total, attackBonus: atk, toHit, targetAc: ac,
           damage: dmg, distance: d, kind, target: t.name, fireball,
           splash: splash.length ? splash : undefined,
           targetHp: after.hp, targetDown: after.down, boosts: roll.boostsUsed };
}

export function endCombat() {
  if (!state.combat.active) return { error: 'No combat is running.' };
  state.combat = { active: false, order: [], turnIndex: 0, round: 1 };
  logStory('combat', 'DM', 'The dust settles. Combat ends.');
  emit('combat');
  return { ok: true };
}

export function advanceTurn() {
  const c = state.combat;
  if (!c.active) return { error: 'No combat is running.' };
  c.turnIndex++;
  if (c.turnIndex >= c.order.length) { c.turnIndex = 0; c.round++; }
  const t = findToken(c.order[c.turnIndex]);
  if (!t) { c.order.splice(c.turnIndex, 1); return advanceTurn(); }
  logStory('combat', 'DM', `Round ${c.round} — ${t.name}'s turn.`);
  emit('combat');
  // If that is a monster, it acts now. The turn does not come back to the DM
  // until a hero is up — see runMonsterTurns.
  const acted = runMonsterTurns();
  const cur = findToken(c.order[c.turnIndex]);
  return { ok: true, round: c.round, current: cur?.name, tokenId: cur?.id,
           ...(acted.length ? { monstersActed: acted, note: 'The monsters above already took their turns. Narrate what they did, then it is the player\'s move.' } : {}) };
}

// ── monsters act on their own turn ───────────────────────────────────────────
// A goblin standing in the doorway waited, politely, for the player to type
// "I attack it" — and then for the DM to remember to swing it back. "Having to
// say one line to engage the monster was silly." So a monster's turn is not
// the DM's to spend: when initiative lands on one it closes and swings at the
// nearest hero itself, and the turn keeps moving until a hero is up.
function nearestHero(from) {
  return state.tokens.filter(t => t.kind === 'pc' && t.hp > 0)
    .sort((a, b) => gridDistance(from, a) - gridDistance(from, b))[0] || null;
}

export function runMonsterTurns() {
  const c = state.combat;
  const acted = [];
  if (!c.active) return acted;
  for (let guard = 0; guard < c.order.length + 1 && c.active; guard++) {
    if (state.downed) break;                          // time has stopped
    const m = findToken(c.order[c.turnIndex]);
    if (!m || m.kind !== 'monster' || m.hp <= 0) break;   // a hero is up — stop here
    const hero = nearestHero(m);
    if (!hero) break;
    const d = gridDistance(m, hero);
    const kind = (m.range || 0) > 0 && d > (m.reach ?? 1) && d <= m.range ? 'ranged' : 'melee';
    const r = attack({ attackerId: m.id, targetId: hero.id, kind, reason: `${m.name} attacks ${hero.name}` });
    if (r.error) {
      // Could not reach and could not shoot: it holds. Say so, so the DM can
      // narrate it prowling rather than pretending it hit something.
      logStory('combat', m.name, `cannot reach anyone this turn and holds its ground.`);
      acted.push({ monster: m.name, held: true, distance: d });
    } else {
      acted.push({ monster: m.name, target: hero.name, kind, hit: r.hit, damage: r.damage,
                   closed: r.closed ? r.closed.squares : 0, targetHp: r.targetHp, targetDown: r.targetDown });
    }
    if (!c.active || state.downed) break;             // the fight ended, or someone fell
    // Next combatant. Round rolls over the same way advanceTurn does.
    c.turnIndex++;
    if (c.turnIndex >= c.order.length) { c.turnIndex = 0; c.round++; }
    const nxt = findToken(c.order[c.turnIndex]);
    if (nxt) logStory('combat', 'DM', `Round ${c.round} — ${nxt.name}'s turn.`);
  }
  if (acted.length) emit('combat');
  return acted;
}

export function updateHp({ tokenId, delta }) {
  const t = findToken(tokenId);
  if (!t) return { error: `No token matches "${tokenId}".` };
  delta = Math.round(Number(delta) || 0);
  t.hp = Math.max(0, Math.min(t.maxHp, t.hp + delta));
  const verb = delta < 0 ? `takes ${-delta} damage` : `heals ${delta} HP`;
  logStory('combat', t.name, `${verb} (${t.hp}/${t.maxHp}).`);
  if (t.hp === 0) {
    if (t.kind === 'pc') { goDown(t); }
    else fallToken(t);
  }
  // Healing a downed hero back above zero puts them on their feet.
  if (t.hp > 0 && state.downed?.tokenId === t.id) return { ...standUp(`${t.name} is pulled back from the edge.`), hp: t.hp };
  emit();
  return { ok: true, token: t.id, hp: t.hp, maxHp: t.maxHp, down: t.hp === 0, timeStopped: !!state.downed };
}

// ── a monster that dies leaves the board ─────────────────────────────────────
// It used to only get a line in the log. The token stayed exactly where it fell:
// still drawn, still blocking its square, still a legal target, and still taking
// its turn in the initiative order. Players killed the first goblin and it stood
// there for the rest of the fight.
function fallToken(t) {
  logStory('combat', 'DM', `${t.name} is defeated!`);
  state.deathFx = { x: t.x, y: t.y, art: t.art, name: t.name, t: Date.now() };
  state.tokens = state.tokens.filter(x => x.id !== t.id);
  dropFromOrder(t.id);
  // Nothing left to fight — do not make the player call end_combat on an empty
  // room, and do not leave the combat-only tools registered.
  if (state.combat.active && !state.tokens.some(x => x.kind === 'monster' && x.hp > 0)) {
    logStory('combat', 'DM', 'Nothing else is standing.');
    endCombat();
  }
}

/** Take a token out of initiative without skipping whoever is up next. */
function dropFromOrder(id) {
  const c = state.combat;
  const i = c.order.indexOf(id);
  if (i === -1) return;
  c.order.splice(i, 1);
  // Everything after the hole shifts down one, so the index has to follow it or
  // the turn silently jumps a combatant.
  if (i < c.turnIndex) c.turnIndex--;
  if (c.turnIndex >= c.order.length) { c.turnIndex = 0; c.round++; }
}

// ── going down · time stops ─────────────────────────────────────────────────
// A hero at 0 HP does not simply die and it is not simply ignored. The board
// freezes. The only two ways forward are a death save or real effort — and a
// completed Heroic Effort while down always wins, so sweat is never wasted.
function goDown(t) {
  state.downed = { tokenId: t.id, name: t.name, saves: 0, fails: 0 };
  if (state.combat.active) state.combat.frozenAt = state.combat.turnIndex;
  logStory('downed', 'DM', `${t.name} goes down. Time stops. Nothing moves until they are back on their feet.`);
  emit('downed');
}

function standUp(text, hp = 1) {
  const d = state.downed;
  if (!d) return { error: 'Nobody is down.' };
  const t = findToken(d.tokenId);
  if (t && t.hp <= 0) t.hp = Math.max(hp, 1);
  state.downed = null;
  logStory('downed', 'DM', text);
  emit('downed');
  return { ok: true, revived: t?.name, hp: t?.hp, timeStopped: false };
}

/** The board is frozen while a hero is down; most tools refuse to act. */
export function timeStopped() { return !!state.downed && state.quest.status === 'active'; }

export function deathSave() {
  const d = state.downed;
  if (!d) return { error: 'Nobody is down — there is nothing to save against.' };
  const roll = 1 + Math.floor(Math.random() * 20);
  state.dice = { formula: 'd20', rolls: [roll], modifier: 0, total: roll, reason: `${d.name}'s death save`, nat20: roll === 20, nat1: roll === 1, at: Date.now() };
  emit('dice');

  if (roll === 20) return { ...standUp(`${d.name} rolls a natural 20 and surges back up, snarling.`, 3), roll, outcome: 'critical-success' };
  if (roll >= DEATH_SAVE_DC) {
    d.saves++;
    logStory('downed', d.name, `steadies — death save ${roll}, success ${d.saves}/2.`);
    if (d.saves >= 2) return { ...standUp(`${d.name} drags themself back to their feet.`), roll, outcome: 'stabilised' };
    emit('downed');
    return { ok: true, roll, outcome: 'success', saves: d.saves, fails: d.fails, note: 'Two successes and they are up. Or offer a Heroic Effort — reps always work.' };
  }

  d.fails++;
  logStory('downed', d.name, `slips further — death save ${roll}, failure ${d.fails}/${DEATH_SAVE_FAILS}.`);
  if (d.fails >= DEATH_SAVE_FAILS) {
    state.quest.status = 'lost';
    logStory('downed', 'DM', `${d.name} does not get up. The run ends here.`);
    emit('quest');
    return { ok: true, roll, outcome: 'run-lost', note: 'The run is over. Nothing but a fresh table will change that.' };
  }
  emit('downed');
  return {
    ok: true, roll, outcome: 'failure', saves: d.saves, fails: d.fails,
    note: `${DEATH_SAVE_FAILS - d.fails} failure(s) from the end. Offer a Heroic Effort — completed reps clear a failure and put them back up.`,
  };
}

/** Called when a challenge completes while a hero is down: effort always wins. */
function repsRevive() {
  const d = state.downed;
  if (!d) return;
  standUp(`${d.name} pushes up off the floor — in the room and on the board — and stands.`, 4);
}

export function applyCondition({ tokenId, condition, remove = false }) {
  const t = findToken(tokenId);
  if (!t) return { error: `No token matches "${tokenId}".` };
  if (!condition) return { error: 'Name the condition (e.g. "poisoned").' };
  condition = String(condition).toLowerCase();
  if (remove) t.conditions = t.conditions.filter(c => c !== condition);
  else if (!t.conditions.includes(condition)) t.conditions.push(condition);
  logStory('combat', t.name, remove ? `is no longer ${condition}.` : `is now ${condition}.`);
  emit();
  return { ok: true, token: t.id, conditions: t.conditions };
}

export function awardLoot({ items = [], gold = 0 }) {
  if (typeof items === 'string') items = [items];
  items.forEach(i => state.party.loot.push(String(i)));
  state.party.gold += Math.max(0, Math.round(gold || 0));
  const bits = [...items];
  if (gold) bits.push(`${gold} gold`);
  if (!bits.length) return { error: 'Nothing to award.' };
  logStory('loot', 'DM', `The party gains: ${bits.join(', ')}!`);
  emit();
  return { ok: true, loot: state.party.loot, gold: state.party.gold };
}

// ── Heroic Effort (exercise ↔ dice) ─────────────────────────────────────────
let challengeSeq = 0;
const challengeWaiters = new Map();   // id → {resolve}

/** One player turn has gone by without the table asking for anything. */
export function notePlayerTurn() {
  state.fitness.turnsSinceOffer = (state.fitness.turnsSinceOffer || 0) + 1;
  // And how long we have been on this beat. A live run showed the DM taking
  // nine exchanges to clear one of five — a judge playing for five minutes
  // would never reach the boss. Telling it "roughly two minutes a beat" did
  // nothing; a number it can see does.
  state.quest.turnsOnBeat = (state.quest.turnsOnBeat || 0) + 1;
}

/** An offer was made — reps, hold or Oath. Restarts both clocks. */
function noteOffer() {
  state.fitness.turnsSinceOffer = 0;
  state.fitness.rollsSinceOffer = 0;
  state.fitness.rollGateWaived = false;
  state.fitness.offersMade = (state.fitness.offersMade || 0) + 1;
}

// ── the roll gate ────────────────────────────────────────────────────────────
// Asking the model to offer effort more often has now failed three ways: in the
// system prompt, in a counter handed to it every turn, and in a nudge injected
// into the message stream. It complies for a while and drifts back. So the last
// version of this is not a request at all — the dice themselves stop.
//
// Two rolls without anything staked and roll_dice refuses ONCE, naming the
// bargain it wants made first. It never refuses twice in a row: the refusal
// spends a waiver, so if the DM ignores it and rolls again that roll goes
// through and the run continues. A pacing rule that can deadlock a game is
// worse than the drift it was fixing.
export const ROLLS_PER_OFFER = 2;

export function rollGateRefusal() {
  const f = state.fitness;
  // Something is already staked, or the board is frozen — nothing to ask for.
  if (state.challenge || state.tasks || state.oath || state.warmup || state.downed) return null;
  if ((f.rollsSinceOffer || 0) < ROLLS_PER_OFFER) return null;
  if (f.rollGateWaived) return null;              // already refused once; let it through

  f.rollGateWaived = true;
  f.rollsGated = (f.rollsGated || 0) + 1;
  const pref = effortPref();
  const how = pref === 'oaths'
    ? 'Call propose_oath — this player takes nothing physical.'
    : pref === 'holds'
      ? 'Call propose_challenge with mode "hold".'
      : pref === 'reps'
        ? 'Call propose_challenge with mode "reps".'
        : 'Call propose_challenge (reps or a hold) or propose_oath — whichever suits the moment.';
  return {
    error: `${f.rollsSinceOffer} rolls since anything was staked. This table trades effort for dice, ` +
           `and a roll nobody paid for is the one thing it is not for. Offer a Heroic Effort for THIS ` +
           `roll first, then roll. ${how} Scale it to the moment — five reps or twenty seconds for +2 ` +
           `on a small check is plenty. Then call roll_dice again; if the player declines, roll straight away.`,
    mustOfferFirst: true,
    rollsSinceOffer: f.rollsSinceOffer,
    // Said plainly so the DM does not get stuck in a loop trying to satisfy it.
    note: 'This refusal will not repeat on your next roll_dice — but it returns two rolls later.',
  };
}

export function proposeChallenge({ exercise, reps, reward, reason = '', mode = 'reps', seconds }) {
  if (state.challenge) return { error: 'A challenge is already in progress — resolve it first.' };
  if (state.tasks) return { error: 'A task list is on the table — let the player finish it first.' };
  if (state.oath) return { error: 'The player is away keeping an Oath. Wait for them.' };
  mode = mode === 'hold' ? 'hold' : 'reps';
  const gate = effortGate(mode);
  if (gate) return gate;
  exercise = String(exercise || '').toLowerCase();
  // Validate against the list for THIS mode — a plank is not a rep exercise and
  // push-ups are not a hold, and checking one against the other rejects both.
  const known = mode === 'hold' ? HOLDS : EXERCISES;
  const allowed = allowedFor(mode);
  if (!known.includes(exercise)) {
    return { error: `"${exercise}" is not a ${mode === 'hold' ? 'hold' : 'rep exercise'}. ` +
                    `For mode "${mode}" choose: ${allowed.join(', ')}.` };
  }
  if (!allowed.includes(exercise)) {
    return { error: `This player has not enabled "${exercise}". Offer one of: ${allowed.join(', ')}.` };
  }
  if (mode === 'hold') {
    seconds = Math.max(5, Math.min(300, Math.round(seconds || 30)));
    reps = seconds;                          // the ring fills once per second
  } else {
    reps = Math.max(1, Math.min(100, Math.round(reps || 10)));
  }
  // Effort and reward should stay in proportion. Name no reward and the size of
  // the ask picks one; name one that the ask does not cover and the tool says so
  // rather than silently handing out a natural 20 for three jumping jacks.
  const amount = mode === 'hold' ? seconds : reps;
  if (!reward) reward = rewardFor(amount, mode);
  if (!REWARDS[reward]) return { error: `Unknown reward "${reward}". Choose: ${Object.keys(REWARDS).join(', ')}.` };
  const price = priceOf(reward, mode);
  const fair = price === null || amount >= price;

  const id = `chal-${++challengeSeq}-${Date.now().toString(36)}`;
  state.challenge = {
    id, mode, exercise, reps, seconds: mode === 'hold' ? seconds : null, reward, reason,
    progress: 0, status: 'offered', startedAt: null,
    // Reported on whichever way this resolves, so the DM learns the going rate
    // rather than only hearing about it if the player walks away.
    underpriced: fair ? null
      : `${REWARDS[reward].label} normally costs ${price} ${mode === 'hold' ? 'seconds' : 'reps'}; you asked for ${amount}. ` +
        `Fine if the moment earns it, but ask nearer the going rate next time.`,
  };
  const ask = mode === 'hold' ? `${seconds}s ${exercise}` : `${reps} ${exercise}`;
  noteOffer();
  logStory('challenge', 'DM', `💪 HEROIC EFFORT: ${ask} → ${REWARDS[reward].label}. ${reason}`);
  emit('challenge');

  return new Promise(resolve => {
    challengeWaiters.set(id, resolve);
    setTimeout(() => {                       // agent shouldn't hang forever
      if (challengeWaiters.has(id)) {
        challengeWaiters.delete(id);
        resolve({ status: 'pending', challengeId: id, challenge: ask, reward: REWARDS[reward].label,
                  underpriced: state.challenge?.underpriced || undefined,
                  note: 'Player is still working on it — call get_fitness_log to check back.' });
      }
    }, 90_000);
  });
}

let holdTimer = null;
export function acceptChallenge() {
  const c = state.challenge;
  if (!c || c.status !== 'offered') return { error: 'No challenge waiting.' };
  c.status = 'active'; c.startedAt = Date.now();
  // A hold counts itself down — you cannot tap a button while you are in a plank.
  if (c.mode === 'hold') {
    clearInterval(holdTimer);
    holdTimer = setInterval(() => {
      const cur = state.challenge;
      if (!cur || cur.status !== 'active' || cur.mode !== 'hold') { clearInterval(holdTimer); holdTimer = null; return; }
      tickChallenge(1);
    }, 1000);
  }
  emit('challenge');
  return { ok: true };
}

export function tickChallenge(n = 1) {
  const c = state.challenge;
  if (!c || c.status !== 'active') return;
  c.progress = Math.min(c.reps, c.progress + n);
  emit('challenge');
  if (c.progress >= c.reps) completeChallenge();
}

export function completeChallenge() {
  const c = state.challenge;
  if (!c) return { error: 'No challenge in progress.' };
  const secs = c.startedAt ? Math.round((Date.now() - c.startedAt) / 1000) : 0;
  clearInterval(holdTimer); holdTimer = null;
  REWARDS[c.reward].apply(state.boosts);
  if (c.mode === 'hold') state.fitness.holdSeconds += c.seconds;
  else state.fitness.totalReps += c.reps;
  state.fitness.byExercise[c.exercise] = (state.fitness.byExercise[c.exercise] || 0) + c.reps;
  state.fitness.challengesDone++;
  state.fitness.diceEarned.push(c.reward);
  const did = c.mode === 'hold' ? `held ${c.seconds}s of ${c.exercise}` : `completed ${c.reps} ${c.exercise} in ${secs}s`;
  logStory('challenge', 'Player', `${did} — earned: ${REWARDS[c.reward].label}!`);
  const done = { status: 'completed', challengeId: c.id, mode: c.mode, exercise: c.exercise, reps: c.reps, seconds: secs, rewardGranted: REWARDS[c.reward].label };
  if (c.underpriced) done.underpriced = c.underpriced;
  // Reps done over a downed hero are never wasted: they clear a failed death
  // save and put them back on their feet, whatever the dice have been doing.
  if (state.downed) { done.revived = state.downed.name; done.note = 'The reps put them back up. Time moves again.'; repsRevive(); }
  const waiter = challengeWaiters.get(c.id);
  if (waiter) { challengeWaiters.delete(c.id); waiter(done); }
  state.challenge = null;
  emit('challenge');
  return done;
}

export function declineChallenge() {
  const c = state.challenge;
  if (!c) return { error: 'No challenge in progress.' };
  clearInterval(holdTimer); holdTimer = null;
  logStory('challenge', 'Player', `declined the ${c.exercise} challenge — rolling fate as it lies.`);
  const res = { status: 'declined', challengeId: c.id, note: 'Player declined — proceed with a normal roll.' };
  if (c.underpriced) res.underpriced = c.underpriced;
  const waiter = challengeWaiters.get(c.id);
  if (waiter) { challengeWaiters.delete(c.id); waiter(res); }
  state.challenge = null;
  emit('challenge');
  return res;
}

// ── a task list: pick your own price ─────────────────────────────────────────
// One offer, take it or leave it, is a yes/no question — and a player who does
// not fancy push-ups right now just says no and the table gets nothing. A list
// is a different question: three small things on screen, each worth its own
// points, tick off whatever you actually did. Do one for +2, do all three for
// +6. Nobody has to be talked into the whole set to get some of it.
//
// Every item is priced off the same EFFORT_SCALE the single challenge uses, so
// this is not a cheaper door to the same rewards — it is the same rates, split
// into pieces. Additive bonuses only: "advantage" and "natural 20" do not sum,
// and pretending they do would make the list the best deal at the table.
let taskSeq = 0;
const taskWaiters = new Map();

const BONUS_OF = { 'bonus+2': 2, 'bonus+3': 3, 'bonus+5': 5, 'bonus+8': 8 };

/** What one item of this size is worth, in flat bonus points. */
export function taskBonus(amount, mode = 'reps') {
  const kind = mode === 'oath' ? 'oath' : mode === 'hold' ? 'hold' : 'reps';
  return BONUS_OF[rewardFor(amount, kind)] ?? 8;   // the ladder tops out at +8 per item
}

export function proposeTaskList({ items, reason = '' }) {
  if (state.tasks) return { error: 'A task list is already on the table — resolve it first.' };
  if (state.challenge) return { error: 'A challenge is already in progress — resolve it first.' };
  if (state.oath) return { error: 'The player is away keeping an Oath. Wait for them.' };
  if (!Array.isArray(items) || !items.length) {
    return { error: 'Give 2-3 items, e.g. [{"exercise":"push-ups","mode":"reps","amount":5},{"exercise":"plank","mode":"hold","amount":20}].' };
  }
  if (items.length > 4) return { error: 'Four is already too many to read on a card. Offer 2 or 3.' };

  const built = [];
  for (const raw of items) {
    const mode = raw.mode === 'hold' ? 'hold' : raw.mode === 'oath' ? 'oath' : 'reps';
    const gate = effortGate(mode);
    if (gate) return gate;                     // the standing preference decides, as everywhere else
    const amount = Math.max(1, Math.min(300, Math.round(Number(raw.amount) || (mode === 'hold' ? 20 : 5))));

    let label, exercise = String(raw.exercise || '').toLowerCase();
    if (mode === 'oath') {
      label = String(raw.exercise || raw.label || '').trim().slice(0, 60);
      if (!label) return { error: 'An oath item needs to say what it is, e.g. "clear the sink".' };
      label = `${label} · ${amount} min`;
    } else {
      const known = mode === 'hold' ? HOLDS : EXERCISES;
      const allowed = allowedFor(mode);
      if (!known.includes(exercise)) {
        return { error: `"${exercise}" is not a ${mode === 'hold' ? 'hold' : 'rep exercise'}. For mode "${mode}" choose: ${allowed.join(', ')}.` };
      }
      if (!allowed.includes(exercise)) {
        return { error: `This player has not enabled "${exercise}". Offer one of: ${allowed.join(', ')}.` };
      }
      label = mode === 'hold' ? `${amount}s ${exercise}` : `${amount} ${exercise}`;
    }
    built.push({ label, exercise, mode, amount, bonus: taskBonus(amount, mode), done: false });
  }

  const id = `tasks-${++taskSeq}-${Date.now().toString(36)}`;
  state.tasks = { id, items: built, reason, status: 'offered' };
  noteOffer();
  const most = built.reduce((s, i) => s + i.bonus, 0);
  logStory('challenge', 'DM',
    `📋 TASK LIST: ${built.map(i => `${i.label} (+${i.bonus})`).join(' · ')} — all of it is +${most}. ${reason}`);
  emit('tasks');

  return new Promise(resolve => {
    taskWaiters.set(id, resolve);
    setTimeout(() => {
      if (taskWaiters.has(id)) {
        taskWaiters.delete(id);
        resolve({ status: 'pending', taskListId: id, note: 'The player is still working through it. Call get_fitness_log to check back.' });
      }
    }, 90_000);
  });
}

export function taskTotal() {
  return (state.tasks?.items || []).filter(i => i.done).reduce((s, i) => s + i.bonus, 0);
}

export function toggleTask(index) {
  const t = state.tasks;
  if (!t) return { error: 'No task list on the table.' };
  const item = t.items[index];
  if (!item) return { error: `No item ${index}.` };
  item.done = !item.done;
  t.status = 'active';
  emit('tasks');
  return { ok: true, index, done: item.done, runningTotal: taskTotal() };
}

/** Take what was actually ticked. Nothing ticked is the same as walking away. */
export function claimTasks() {
  const t = state.tasks;
  if (!t) return { error: 'No task list on the table.' };
  const done = t.items.filter(i => i.done);
  const total = taskTotal();

  done.forEach(i => {
    if (i.mode === 'reps') {
      state.fitness.totalReps += i.amount;
      state.fitness.byExercise[i.exercise] = (state.fitness.byExercise[i.exercise] || 0) + i.amount;
    } else if (i.mode === 'hold') {
      state.fitness.holdSeconds += i.amount;
    } else {
      state.fitness.oathsKept++;
      state.fitness.oathMinutes += i.amount;
    }
  });
  if (total > 0) {
    state.boosts.bonus += total;
    state.fitness.challengesDone++;
    logStory('challenge', 'Player',
      `✅ ${done.length} of ${t.items.length} done — ${done.map(i => i.label).join(', ')}. +${total} on the next roll.`);
  } else {
    logStory('challenge', 'Player', 'left the task list untouched — rolling fate as it lies.');
  }

  const res = {
    status: total > 0 ? 'completed' : 'declined',
    taskListId: t.id,
    completed: done.map(i => i.label),
    ofItems: t.items.length,
    bonusGranted: total,
    note: total > 0
      ? `Player earned +${total} on their next roll. Say so, then make the roll.`
      : 'Player took none of it — proceed with a normal roll, and do not nag.',
  };
  const w = taskWaiters.get(t.id);
  if (w) { taskWaiters.delete(t.id); w(res); }
  state.tasks = null;
  emit('tasks');
  return res;
}

// ── Oaths: effort the app cannot see ─────────────────────────────────────────
// Not everyone can drop and do push-ups, and not every session should be about
// sweat. An Oath stakes something real in the room — the dishes, twenty pages,
// twenty minutes of study — against the same dice. The app cannot verify it, so
// it spends the one thing it can actually charge: your time. The table locks,
// the DM waits, and you confirm on your honour when you get back.
let oathSeq = 0;
const oathWaiters = new Map();

export function proposeOath({ label, kind = 'chores', minutes, reward, reason = '' }) {
  if (state.oath) return { error: 'An Oath is already being kept. Wait for the player to come back.' };
  if (state.challenge) return { error: 'A challenge is already in progress — resolve it first.' };
  if (state.tasks) return { error: 'A task list is on the table — let the player finish it first.' };
  const gate = effortGate('oath');
  if (gate) return gate;
  label = String(label || '').trim().slice(0, 90);
  if (!label) return { error: 'Say what the Oath actually is, e.g. "clear the sink" or "read 10 pages".' };
  kind = OATH_KINDS.includes(String(kind).toLowerCase()) ? String(kind).toLowerCase() : 'chores';
  minutes = Math.max(1, Math.min(60, Math.round(minutes || 10)));
  if (!REWARDS[reward]) return { error: `Unknown reward "${reward}". Choose: ${Object.keys(REWARDS).join(', ')}.` };

  const id = `oath-${++oathSeq}-${Date.now().toString(36)}`;
  state.oath = { id, label, kind, minutes, reward, reason, status: 'offered', startedAt: null, endsAt: null };
  noteOffer();
  logStory('challenge', 'DM', `📜 OATH: ${label} — ${minutes} min → ${REWARDS[reward].label}. ${reason}`);
  emit('oath');

  return new Promise(resolve => {
    oathWaiters.set(id, resolve);
    setTimeout(() => {
      if (oathWaiters.has(id)) {
        oathWaiters.delete(id);
        resolve({ status: 'pending', oathId: id, note: 'The player is away keeping it. Call get_fitness_log to check back.' });
      }
    }, 90_000);
  });
}

export function acceptOath() {
  const o = state.oath;
  if (!o || o.status !== 'offered') return { error: 'No Oath waiting.' };
  o.status = 'active';
  o.startedAt = Date.now();
  o.endsAt = o.startedAt + o.minutes * 60_000;
  logStory('challenge', 'Player', `swore an Oath: ${o.label}. The table waits ${o.minutes} minutes.`);
  emit('oath');
  return { ok: true, endsAt: o.endsAt };
}

export function oathRemaining() {
  const o = state.oath;
  if (!o || o.status !== 'active') return 0;
  return Math.max(0, o.endsAt - Date.now());
}

/** The player says they did it. The clock is the only witness we have. */
export function keepOath() {
  const o = state.oath;
  if (!o) return { error: 'No Oath in progress.' };
  if (o.status === 'active' && oathRemaining() > 0) {
    return { error: `Not yet — ${Math.ceil(oathRemaining() / 1000)}s still on the clock. Go finish it.` };
  }
  REWARDS[o.reward].apply(state.boosts);
  state.fitness.oathsKept++;
  state.fitness.oathMinutes += o.minutes;
  state.fitness.challengesDone++;
  state.fitness.diceEarned.push(o.reward);
  logStory('challenge', 'Player', `kept the Oath — ${o.label} (${o.minutes} min). Earned: ${REWARDS[o.reward].label}!`);
  const done = { status: 'kept', oathId: o.id, label: o.label, kind: o.kind, minutes: o.minutes, rewardGranted: REWARDS[o.reward].label };
  if (state.downed) { done.revived = state.downed.name; done.note = 'Keeping the Oath put them back up. Time moves again.'; repsRevive(); }
  const w = oathWaiters.get(o.id);
  if (w) { oathWaiters.delete(o.id); w(done); }
  state.oath = null;
  emit('oath');
  return done;
}

/** Walked away, or never swore it. No reward, and no lecture either. */
export function breakOath({ declined = false } = {}) {
  const o = state.oath;
  if (!o) return { error: 'No Oath in progress.' };
  if (!declined) state.fitness.oathsBroken++;
  logStory('challenge', 'Player',
    declined ? `passed on the Oath — rolling fate as it lies.` : `set the Oath aside. No reward, no judgement.`);
  const res = {
    status: declined ? 'declined' : 'abandoned', oathId: o.id,
    note: 'No reward was granted. Proceed with a normal roll and do not nag them about it.',
  };
  const w = oathWaiters.get(o.id);
  if (w) { oathWaiters.delete(o.id); w(res); }
  state.oath = null;
  emit('oath');
  return res;
}

export function oathActive() { return !!state.oath && state.oath.status === 'active'; }

// ── the warm-up ──────────────────────────────────────────────────────────────
// Ten minutes of standing still is ten minutes of nothing happening, so the
// program drives itself: the cue changes, the ring drains, and a breath pacer
// runs underneath. The player's only job is to follow along.
let warmTimer = null;

// Asked for in prose, the warm-up died in the chat: the DM said "ninety seconds
// or three minutes?", the player typed an answer, and by then the moment had
// passed. It is a choice with two buttons — so it is a card, like every other
// thing this table asks for. Called with no plan, start_warmup OFFERS.
export function offerWarmup({ reason = '' } = {}) {
  if (state.warmup) return { error: 'A warm-up is already running.' };
  if (state.warmupOffer) return { error: 'The warm-up card is already on screen.' };
  // Asked once. The DM was told "if they say no, never raise it again" and
  // raised it again anyway, three times in one session — so the answer is kept
  // and the tool refuses, whatever the prompt remembers.
  if (state.fitness.warmupAnswered) {
    return {
      error: `The player already answered the warm-up (${state.fitness.warmupAnswered}). Do not offer it again this run. ` +
             `If they ASK to stretch mid-game in their own words, call start_warmup with the plan they named.`,
      alreadyAnswered: state.fitness.warmupAnswered,
    };
  }
  state.warmupOffer = { reason, plans: ['90s', '3min', '5min'], t: Date.now() };
  logStory('challenge', 'DM', '🤸 Warm-up offered — 90 seconds, 3 minutes, or straight in.');
  emit('warmup');
  return { ok: true, offered: true,
           note: 'The card is on screen with the plan buttons. Say one line inviting them to stretch, then WAIT — do not call start_warmup yourself, the player picks.' };
}

export function dismissWarmupOffer() {
  if (!state.warmupOffer) return { error: 'No warm-up offered.' };
  state.warmupOffer = null;
  state.fitness.warmupAnswered = 'declined';
  logStory('challenge', 'Player', 'skipped the warm-up — straight into the keep.');
  emit('warmup');
  return { ok: true, declined: true };
}

export function startWarmup({ plan } = {}) {
  // No plan named means "ask them", which is what the DM should almost always do.
  if (plan === undefined || plan === null || plan === '') return offerWarmup({});
  if (!WARMUP_PLANS[plan]) return { error: `Unknown plan "${plan}". Choose: ${Object.keys(WARMUP_PLANS).join(', ')}.` };
  if (state.warmup) return { error: 'A warm-up is already running.' };
  state.warmupOffer = null;
  state.fitness.warmupAnswered = `started ${plan}`;
  const p = WARMUP_PLANS[plan];
  // seq is the list of stretch indices this plan runs — it spans the body, so
  // index is a position in seq, never a position in STRETCHES.
  const seq = warmupSeq(plan);
  state.warmup = { planId: plan, index: 0, seq, hold: p.hold, count: seq.length,
                   remaining: p.hold, paused: false, startedAt: Date.now() };
  logStory('challenge', 'DM', `🤸 Warm-up — ${p.label}, ${seq.length} stretches. Stand up.`);
  clearInterval(warmTimer);
  warmTimer = setInterval(tickWarmup, 1000);
  prologueBeat(0);                       // give the board something to do at once
  emit('warmup');
  return { ok: true, plan, stretches: seq.length, holdSeconds: p.hold,
           totalSeconds: seq.length * p.hold, first: STRETCHES[seq[0]].name,
           order: seq.map(i => STRETCHES[i].name) };
}

// While you stretch, the game should not sit frozen. Each stretch advances a
// silent prologue on the board behind the card: the torches find another
// stretch of wall, the party walks in, the keep wakes up around you.
const PROLOGUE = [
  'Torchlight finds the first of the flooded steps.',
  'Brannok shoulders the door and it gives, grinding on wet stone.',
  'Mira lights a second torch from the first. The hall opens ahead.',
  'Black water laps at your boots. Something has been through here.',
  'A dropped shield, rusted through. Older than this week.',
  'The passage bends. Further in, the water is still moving.',
  'Mira checks her pack without being asked. She has done this before.',
  'Somewhere below, stone shifts against stone.',
  'The far arch resolves out of the dark.',
  'Brannok rolls his shoulder, testing it, and nods.',
];

function prologueBeat(i) {
  if (state.quest.status !== 'active' || state.combat.active) return;
  const pc = state.tokens.find(t => t.kind === 'pc');
  if (!pc) return;
  // Widen the torchlight a step at a time, and walk the party a cell in.
  revealAround(pc.x, pc.y, 3 + (i % 4));
  if (i % 2 === 1) {
    const step = [[1, 0], [0, 1], [1, 1], [0, -1]][(i >> 1) % 4];
    const nx = pc.x + step[0], ny = pc.y + step[1];
    if (isWalkable(nx, ny) && !state.tokens.some(t => t.x === nx && t.y === ny)) {
      pc.x = nx; pc.y = ny; revealAround(nx, ny, 3);
    }
  }
  logStory('scene', 'DM', PROLOGUE[i % PROLOGUE.length]);
  emit('prologue');
}

function tickWarmup() {
  const w = state.warmup;
  if (!w) { clearInterval(warmTimer); warmTimer = null; return; }
  if (w.paused) return;
  w.remaining--;
  if (w.remaining <= 0) {
    w.index++;
    if (w.index >= w.count) return void finishWarmup();
    w.remaining = w.hold;
    prologueBeat(w.index);
  }
  emit('warmup');
}

export function skipStretch() {
  const w = state.warmup;
  if (!w) return { error: 'No warm-up running.' };
  w.index++;
  if (w.index >= w.count) return finishWarmup();
  w.remaining = w.hold;
  emit('warmup');
  return { ok: true, now: STRETCHES[w.seq[w.index]].name };
}

export function pauseWarmup(paused) {
  if (!state.warmup) return { error: 'No warm-up running.' };
  state.warmup.paused = paused === undefined ? !state.warmup.paused : !!paused;
  emit('warmup');
  return { ok: true, paused: state.warmup.paused };
}

export function finishWarmup({ early = false } = {}) {
  const w = state.warmup;
  if (!w) return { error: 'No warm-up running.' };
  clearInterval(warmTimer); warmTimer = null;
  const done = w.index;
  const secs = Math.round((Date.now() - w.startedAt) / 1000);
  state.fitness.holdSeconds += secs;
  if (!early) state.fitness.warmedUp = true;
  state.warmup = null;
  logStory('challenge', 'Player',
    early ? `stopped the warm-up after ${done} stretches. Still counts.`
          : `finished the warm-up — ${done} stretches, ${Math.round(secs / 60)} min. Loose and ready.`);
  // Warming up is its own small reward: the first roll of the run runs warm.
  if (!early && done >= 4) { state.boosts.bonus += 2; logStory('challenge', 'DM', 'Warm muscles, steady hands: +2 on your next roll.'); }
  emit('warmup');
  return { ok: true, stretchesDone: done, seconds: secs, early, bonusGranted: !early && done >= 4 ? '+2 next roll' : null };
}

export function currentStretch() {
  const w = state.warmup;
  if (!w) return null;
  const s = STRETCHES[w.seq[w.index]] || STRETCHES[w.seq[w.seq.length - 1]];
  const next = w.seq[w.index + 1];
  return { ...s, index: w.index, of: w.count, remaining: w.remaining, hold: w.hold,
           paused: w.paused, next: next === undefined ? null : STRETCHES[next].name };
}

// ── the quest ────────────────────────────────────────────────────────────────
export function currentBeat() {
  const q = state.quest;
  return q.status === 'active' ? QUEST.beats[q.beatIndex] || null : null;
}

/** Move to the next beat: pay out the milestone, swap the map, spawn the boss. */
export function advanceQuest({ summary = '' } = {}) {
  const q = state.quest;
  if (q.status !== 'active') return { error: `This run is already ${q.status}. Nothing left to advance.` };
  if (timeStopped()) return { error: 'A hero is down and time has stopped. Get them up before the story moves on.' };
  const beat = QUEST.beats[q.beatIndex];
  if (!beat) return { error: 'No beat is in progress.' };

  // "The guard got hit and advanced a level — the guard still isn't dead."
  // A beat is not cleared while the fight for it is still on. Either the party
  // finishes it, or it genuinely gets away (end_combat first, deliberately). And
  // a beat that owns a named monster — the Warden, the Wight — is cleared over
  // that monster's body, not around it.
  if (state.combat.active) {
    const standing = state.tokens.filter(t => t.kind === 'monster' && t.hp > 0).map(t => t.name);
    return {
      error: `A fight is still on — ${standing.length ? standing.join(', ') + (standing.length > 1 ? ' are' : ' is') + ' still standing' : 'initiative is still running'}. ` +
             `Finish it, then advance. If the party truly slips away instead, call end_combat first and say so — but a beat is not cleared mid-swing.`,
      combatActive: true, standing,
    };
  }
  const owned = beat.boss || beat.spawn;
  if (owned) {
    const alive = state.tokens.find(t => t.kind === 'monster' && t.name === owned.name && t.hp > 0);
    if (alive) {
      return {
        error: `${alive.name} still stands (${alive.hp}/${alive.maxHp}). This beat is cleared over its body, not around it.`,
        mustDefeat: alive.name, hp: alive.hp,
      };
    }
  }

  q.completed.push({ id: beat.id, title: beat.title, at: Date.now(), summary: String(summary || '').slice(0, 240) });
  logStory('quest', 'DM', `✦ ${beat.title} — complete. ${summary}`.trim());
  if (beat.reward) awardLoot(beat.reward);

  // Clearing a beat used to pay a trinket and a little gold, and then the next
  // fight started with the party as battered as they finished the last one.
  // A cleared beat now pays three things you can feel:
  //   1. the loot, which escalates hard across the run,
  //   2. a BOON — a real dice reward banked for the next beat, the same currency
  //      Heroic Effort pays in, so progress and sweat spend the same way,
  //   3. a short rest: every hero back to full, because arriving at the Cinder
  //      Wight on four hit points is not a difficulty curve, it is a dead end.
  // THE PARTY LEVELS. A one-shot dice boost is a small thing to win for the
  // hardest fight of the run — and it is gone on the next roll. A level is
  // permanent, it compounds, and every beat after this one is fought with it:
  // more maximum health, and heavier hits. That is what makes clearing a beat
  // feel like getting somewhere rather than collecting a token.
  state.party.level = (state.party.level || 1) + 1;
  const level = state.party.level;
  const hpGain = 6 + level * 2;                  // 10, 12, 14, 16, 18 across the run
  const levelled = [];
  state.tokens.filter(t => t.kind === 'pc').forEach(t => {
    t.maxHp += hpGain;
    t.hp = t.maxHp;                              // and a full rest into the bargain
    levelled.push({ name: t.name, maxHp: t.maxHp });
  });
  logStory('quest', 'DM',
    `⬆ THE PARTY IS LEVEL ${level}` + (beat.honorific ? ` — ${beat.honorific}.` : '.') +
    ` +${hpGain} max health each, and everyone is back to full.`);

  let boon = null;
  if (beat.boon && REWARDS[beat.boon]) {
    REWARDS[beat.boon].apply(state.boosts);
    boon = REWARDS[beat.boon].label;
    // From the third beat on it pays two boons, not one — the run should feel
    // like it is accelerating, and the last fights are the ones that need it.
    if (level >= 4) { REWARDS['bonus+5'].apply(state.boosts); boon += ' · and +5 on top'; }
    logStory('quest', 'DM', `✦ Milestone boon: ${boon}. Spend it well.`);
  }

  // The board throws a small party over the heroes, and the UI raises a banner.
  state.milestone = {
    t: Date.now(), title: beat.title,
    beatNumber: q.beatIndex + 1, of: QUEST.beats.length,
    items: beat.reward?.items || [], gold: beat.reward?.gold || 0,
    boon, level, hpGain, honorific: beat.honorific || null,
  };

  q.beatIndex++;
  q.turnsOnBeat = 0;
  const next = QUEST.beats[q.beatIndex];
  if (!next) {
    q.status = 'won';
    q.finishedAt = Date.now();
    endCombat();
    logStory('quest', 'DM', `👑 ${QUEST.name} is yours. The marshes cool. The run is won.`);
    emit('quest');
    return { ok: true, questComplete: true, status: 'won', totalReps: state.fitness.totalReps,
             loot: state.party.loot, gold: state.party.gold, boon, level, hpGain };
  }

  // The beat owns its map. A live run had the DM set_scene back to the dungeon
  // while the party stood in the glade, so the board and the rail disagreed
  // about where everyone was.
  if (next.mapId !== state.scene.mapId) travelTo(next.mapId);
  logStory('quest', 'DM', `✦ Next: ${next.title} — ${next.objective}`);
  // A beat can name the thing that bars it, so the DM does not have to invent a
  // token for the set-piece — and cannot reach for the knight art, which is
  // Brannok's own picture, for a stone guardian.
  const arrival = next.boss || next.spawn || null;
  const spawned = arrival ? addToken({ ...arrival, kind: 'monster', maxHp: arrival.hp }) : null;
  // The set-piece monster does not wait to be noticed. It is a fight the moment
  // it arrives, and it takes its own turns — the DM narrates, it does not have
  // to remember to call start_combat for a thing the beat itself put there.
  let fight = null;
  if (spawned?.token && !state.combat.active) {
    const pcs = state.tokens.filter(t => t.kind === 'pc').map(t => t.id);
    fight = startCombat({ order: [...pcs, spawned.token.id] });
  }
  emit('quest');
  return {
    ok: true, beat: next.id, title: next.title, objective: next.objective,
    beatNumber: q.beatIndex + 1, of: QUEST.beats.length,
    bossSpawned: spawned?.token?.name || null,
    combatStarted: fight ? { order: fight.order, current: fight.current } : null,
    cleared: beat.title,
    paid: { items: beat.reward?.items || [], gold: beat.reward?.gold || 0, boon,
            partyLevel: level, maxHpGained: hpGain, honorific: beat.honorific || null },
    note: (next.boss ? 'This is the final beat. Play it like one. ' : '') +
          `Tell the player what they just earned, and make it sound like something: the party is now LEVEL ${level}, ` +
          `every hero gained +${hpGain} maximum health and is back to full, plus the loot and the boon.`,
  };
}

export function getQuest() {
  const q = state.quest;
  const beat = currentBeat();
  return {
    name: QUEST.name,
    premise: QUEST.premise,
    status: q.status,
    beatNumber: Math.min(q.beatIndex + 1, QUEST.beats.length),
    of: QUEST.beats.length,
    current: beat ? { id: beat.id, title: beat.title, objective: beat.objective, map: MAPS[beat.mapId].name, isFinalBeat: !!beat.boss } : null,
    upcoming: QUEST.beats.slice(q.beatIndex + 1).map(b => b.title),
    completed: q.completed.map(c => c.title),
    exchangesOnThisBeat: q.turnsOnBeat || 0,
    beatOverdue: (q.turnsOnBeat || 0) >= 4,
    timeStopped: timeStopped(),
    downed: state.downed ? { name: state.downed.name, successes: state.downed.saves, failures: state.downed.fails, of: DEATH_SAVE_FAILS } : null,
    note: q.status === 'active'
      ? 'Drive play toward current.objective. When the party has achieved it, call advance_quest — that is what moves the story and pays the milestone. ' +
        'A beat is two to four exchanges. If beatOverdue is true you have been here too long: bring the obstacle to a head THIS turn and advance. ' +
        'Five beats at four exchanges is a twenty-minute run; at nine it is a session nobody finishes.'
      : `The run is ${q.status}.`,
  };
}

export function resetQuest() {
  state.quest = { beatIndex: 0, status: 'active', completed: [], startedAt: Date.now() };
  state.downed = null;
  state.fitness.warmupAnswered = null;      // a new run gets asked once more
  state.left = false;
  emit('quest');
  return { ok: true, ...getQuest() };
}

// ── reads ────────────────────────────────────────────────────────────────────
/** Whoever the DM is acting as: the current combatant, else the party leader. */
function actingToken() {
  if (state.combat.active) {
    const t = findToken(state.combat.order[state.combat.turnIndex]);
    if (t) return t;
  }
  return state.tokens.find(t => t.kind === 'pc') || null;
}

export function getBoardState() {
  return {
    scene: state.scene,
    grid: { width: GRID_W, height: GRID_H, legend: '# wall · . floor · , rubble · ~ water · D door · L lava', rows: MAPS[state.scene.mapId].rows },
    // Distances are measured from whoever is acting (or the party leader out of
    // combat), because "can I hit it from here?" is the question the DM keeps
    // getting wrong. inMeleeReach / inRangedRange answer it outright.
    tokens: state.tokens.map(t => {
      const from = actingToken();
      const d = from ? gridDistance(from, t) : null;
      return {
        id: t.id, name: t.name, kind: t.kind, art: t.art, x: t.x, y: t.y,
        hp: t.hp, maxHp: t.maxHp, conditions: t.conditions,
        reach: t.reach ?? 1, range: t.range ?? 0,
        distanceFromActor: from && from.id !== t.id ? d : undefined,
        inMeleeReach: from && from.id !== t.id ? d <= (from.reach ?? 1) : undefined,
        inRangedRange: from && from.id !== t.id ? (from.range ?? 0) > 0 && d <= (from.range ?? 0) : undefined,
        visible: state.revealed.includes(`${t.x},${t.y}`),
      };
    }),
    actor: actingToken()?.name,
    combat: state.combat.active ? { active: true, round: state.combat.round, order: state.combat.order.map(id => findToken(id)?.name), current: findToken(state.combat.order[state.combat.turnIndex])?.name } : { active: false },
    activeBoosts: { ...state.boosts },
    party: state.party,
    quest: getQuest(),
    recentLog: state.log.slice(-12).map(l => `[${l.type}] ${l.actor}: ${l.text}`),
    combatNote: 'Attacks go through the attack tool, which enforces reach: melee needs ' +
      'inMeleeReach true (move first if it is not), ranged and spells need inRangedRange. ' +
      'A token with visible:false is still in the fog — move someone closer or reveal_area ' +
      'before asking the player to fight it.',
  };
}

export function getCharacterSheet({ tokenId } = {}) {
  const t = tokenId ? findToken(tokenId) : state.tokens.find(x => x.kind === 'pc');
  if (!t) return { error: `No token matches "${tokenId}".` };
  const { id, name, kind, hp, maxHp, ac, str, dex, con, int: intl, wis, cha, conditions, inventory } = t;
  return { id, name, kind, hp, maxHp, ac, abilities: { str, dex, con, int: intl, wis, cha }, conditions, inventory };
}

export function getFitnessLog() {
  return {
    ...state.fitness,
    activeChallenge: state.challenge
      ? { mode: state.challenge.mode, exercise: state.challenge.exercise, reps: state.challenge.reps, seconds: state.challenge.seconds, progress: state.challenge.progress, status: state.challenge.status }
      : null,
    activeTaskList: state.tasks
      ? { items: state.tasks.items.map(i => ({ label: i.label, bonus: i.bonus, done: i.done })),
          runningTotal: taskTotal(), status: state.tasks.status }
      : null,
    activeOath: state.oath
      ? { label: state.oath.label, minutes: state.oath.minutes, status: state.oath.status, secondsLeft: Math.ceil(oathRemaining() / 1000) }
      : null,
    warmup: state.warmup ? currentStretch() : null,
    unspentBoosts: { ...state.boosts },
    availableExercises: allowedExercises(),
    availableHolds: allowedHolds(),
    effortScale: EFFORT_SCALE,
    turnsSinceLastOffer: state.fitness.turnsSinceOffer || 0,
    offerOverdue: (state.fitness.turnsSinceOffer || 0) >= 2,
    rollsSinceLastOffer: state.fitness.rollsSinceOffer || 0,
    rollsLeftBeforeDiceStop: Math.max(0, ROLLS_PER_OFFER - (state.fitness.rollsSinceOffer || 0)),
    oathKinds: OATH_KINDS,
    effortPreference: {
      setting: effortPref(),
      label: EFFORT_PREFS[effortPref()].label,
      mayAsk: [
        ...EFFORT_PREFS[effortPref()].modes.map(m => m === 'hold' ? 'propose_challenge mode "hold"' : 'propose_challenge mode "reps"'),
        ...(EFFORT_PREFS[effortPref()].oaths ? ['propose_oath'] : []),
      ],
      note: effortPref() === 'any'
        ? 'This player takes all three. Vary between them.'
        : `The player set this themselves. Anything outside mayAsk is REFUSED by the tool, not merely discouraged — do not spend a turn discovering that.`,
    },
    coachNote: [
      'PRICE LIST: effortScale maps how much you ask for to what it is worth — 5 reps or 20s for +2, 10 or 30s for +5, 15 or 45s for +8, 25 or 90s for a natural 20. Ask bigger, pay bigger. Omit the reward and the size of the ask picks one.',
      'PACING IS ENFORCED BY THE DICE: stake something real at least every SECOND roll. rollsLeftBeforeDiceStop counts down, and at zero roll_dice refuses once and tells you to make an offer first. Do not play chicken with it — offer before it fires and the game never stops.',
      'Three ways to stake effort, and they are equals — never treat the Oath as the lesser option.',
      'reps: countable, tapped or counted out loud. hold: a timed hold, the ring counts itself down.',
      'oath: something real in the room the app cannot see. It locks the table for the minutes agreed.',
      'task list (propose_task_list): 2-3 small items at once, each worth its own flat bonus, and the player ticks off whatever they actually did — 5 push-ups, a 20s plank and 5 squats is +2 +2 +2, so the whole card is +6. Reach for it INSTEAD of a single challenge when you want to ask properly: a player who would decline one big ask will often take two of three small ones. Additive bonuses only, so it never pays advantage or a natural 20 — those stay with propose_challenge.',
      'READ effortPreference FIRST and offer only what mayAsk lists — the tools refuse the rest.',
      'Offer ONLY from availableExercises for mode "reps", and ONLY from availableHolds for mode "hold" — the player chose them.',
      'Vary muscle groups; scale down if they are slowing. Everything here is always optional.',
    ].join(' '),
  };
}
