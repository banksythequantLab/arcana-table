// ── Arcana Table · actions ───────────────────────────────────────────────────
// Every game mutation is a named action. The UI buttons call these; the WebMCP
// tools call these. One API, two hands on the table.

import { state, save, findToken, isWalkable, GRID_W, GRID_H, MAPS } from './state.js';

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
  'bonus+5':   { label: '+5 to your next roll',                 apply: b => { b.bonus += 5; } },
  'advantage': { label: 'Advantage on your next roll',          apply: b => { b.advantage = true; } },
  'set10':     { label: 'Next d20 lands on a solid 10',         apply: b => { b.setRoll = 10; } },
  'nat20':     { label: 'NATURAL 20 — the bard will sing of this', apply: b => { b.setRoll = 20; } },
};

// Everything the game knows how to ask for. What it may actually ask THIS
// player for is state.settings.exercisePool — bodies differ, and a challenge
// you cannot physically do is not a challenge, it is a wall.
export const EXERCISES = ['push-ups', 'crunches', 'jumping jacks', 'squats', 'sit-ups', 'lunges', 'high knees', 'mountain climbers', 'burpees'];

export function allowedExercises() {
  const pool = state.settings.exercisePool;
  return Array.isArray(pool) && pool.length ? pool.filter(e => EXERCISES.includes(e)) : EXERCISES;
}

// ── dice ─────────────────────────────────────────────────────────────────────
export function parseFormula(formula) {
  const m = String(formula || 'd20').trim().toLowerCase().replace(/\s+/g, '')
    .match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (!m) return null;
  return { n: Math.min(parseInt(m[1] || '1', 10), 20), sides: parseInt(m[2], 10), mod: parseInt(m[3] || '0', 10) };
}

export function rollDice({ formula = 'd20', reason = '' } = {}) {
  const p = parseFormula(formula);
  if (!p) return { error: `Could not parse dice formula "${formula}". Try "d20", "2d6+3".` };

  const b = state.boosts;
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
  t.x = x; t.y = y;
  if (t.kind === 'pc') revealAround(x, y, 3);
  logStory('action', t.name, `moved to (${x}, ${y})`);
  emit();
  return { ok: true, token: t.id, x, y };
}

export function addToken({ name, kind = 'monster', art, x, y, hp = 10, maxHp }) {
  if (!name) return { error: 'Token needs a name.' };
  const arts = ['knight', 'wizard', 'goblin', 'skeleton', 'dragon', 'wolf', 'chest', 'villager'];
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
  const tok = { id, name, kind, art, x: px, y: py, hp, maxHp: maxHp ?? hp, conditions: [], inventory: [] };
  state.tokens.push(tok);
  logStory('action', 'DM', `${name} appears on the board.`);
  emit();
  return { ok: true, token: tok };
}

export function removeToken({ tokenId }) {
  const t = findToken(tokenId);
  if (!t) return { error: `No token matches "${tokenId}".` };
  state.tokens = state.tokens.filter(x => x.id !== t.id);
  state.combat.order = state.combat.order.filter(id => id !== t.id);
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

export function revealArea({ x, y, radius = 3 }) {
  x = Math.round(x); y = Math.round(y);
  revealAround(x, y, Math.min(Math.round(radius), 10));
  logStory('action', 'DM', `The gloom recedes around (${x}, ${y}).`);
  emit();
  return { ok: true, x, y, radius };
}

export function setScene({ mapId, title, mood }) {
  if (mapId && !MAPS[mapId]) return { error: `Unknown map "${mapId}". Choose: ${Object.keys(MAPS).join(', ')}.` };
  if (mapId && mapId !== state.scene.mapId) {
    state.scene.mapId = mapId;
    state.revealed = [];
    if (!title) state.scene.title = MAPS[mapId].name;
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
  const first = findToken(ids[0]);
  logStory('combat', 'DM', `⚔ Combat begins! Round 1 — ${first.name} acts first.`);
  emit('combat');
  return { ok: true, order: ids.map(id => findToken(id)?.name), current: first.name };
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
  return { ok: true, round: c.round, current: t.name, tokenId: t.id };
}

export function updateHp({ tokenId, delta }) {
  const t = findToken(tokenId);
  if (!t) return { error: `No token matches "${tokenId}".` };
  delta = Math.round(Number(delta) || 0);
  t.hp = Math.max(0, Math.min(t.maxHp, t.hp + delta));
  const verb = delta < 0 ? `takes ${-delta} damage` : `heals ${delta} HP`;
  logStory('combat', t.name, `${verb} (${t.hp}/${t.maxHp}).`);
  if (t.hp === 0) logStory('combat', 'DM', t.kind === 'pc' ? `${t.name} falls unconscious!` : `${t.name} is defeated!`);
  emit();
  return { ok: true, token: t.id, hp: t.hp, maxHp: t.maxHp, down: t.hp === 0 };
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

export function proposeChallenge({ exercise, reps, reward, reason = '' }) {
  if (state.challenge) return { error: 'A challenge is already in progress — resolve it first.' };
  exercise = String(exercise || '').toLowerCase();
  const allowed = allowedExercises();
  if (!EXERCISES.includes(exercise)) return { error: `Unknown exercise "${exercise}". Choose: ${allowed.join(', ')}.` };
  if (!allowed.includes(exercise)) {
    return { error: `This player has not enabled "${exercise}". Offer one of: ${allowed.join(', ')}.` };
  }
  reps = Math.max(1, Math.min(100, Math.round(reps || 10)));
  if (!REWARDS[reward]) return { error: `Unknown reward "${reward}". Choose: ${Object.keys(REWARDS).join(', ')}.` };

  const id = `chal-${++challengeSeq}-${Date.now().toString(36)}`;
  state.challenge = { id, exercise, reps, reward, reason, progress: 0, status: 'offered', startedAt: null };
  logStory('challenge', 'DM', `💪 HEROIC EFFORT: ${reps} ${exercise} → ${REWARDS[reward].label}. ${reason}`);
  emit('challenge');

  return new Promise(resolve => {
    challengeWaiters.set(id, resolve);
    setTimeout(() => {                       // agent shouldn't hang forever
      if (challengeWaiters.has(id)) {
        challengeWaiters.delete(id);
        resolve({ status: 'pending', challengeId: id, note: 'Player is still working on it — call get_fitness_log to check back.' });
      }
    }, 90_000);
  });
}

export function acceptChallenge() {
  const c = state.challenge;
  if (!c || c.status !== 'offered') return { error: 'No challenge waiting.' };
  c.status = 'active'; c.startedAt = Date.now();
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
  REWARDS[c.reward].apply(state.boosts);
  state.fitness.totalReps += c.reps;
  state.fitness.byExercise[c.exercise] = (state.fitness.byExercise[c.exercise] || 0) + c.reps;
  state.fitness.challengesDone++;
  state.fitness.diceEarned.push(c.reward);
  logStory('challenge', 'Player', `completed ${c.reps} ${c.exercise} in ${secs}s — earned: ${REWARDS[c.reward].label}!`);
  const done = { status: 'completed', challengeId: c.id, exercise: c.exercise, reps: c.reps, seconds: secs, rewardGranted: REWARDS[c.reward].label };
  const waiter = challengeWaiters.get(c.id);
  if (waiter) { challengeWaiters.delete(c.id); waiter(done); }
  state.challenge = null;
  emit('challenge');
  return done;
}

export function declineChallenge() {
  const c = state.challenge;
  if (!c) return { error: 'No challenge in progress.' };
  logStory('challenge', 'Player', `declined the ${c.exercise} challenge — rolling fate as it lies.`);
  const res = { status: 'declined', challengeId: c.id, note: 'Player declined — proceed with a normal roll.' };
  const waiter = challengeWaiters.get(c.id);
  if (waiter) { challengeWaiters.delete(c.id); waiter(res); }
  state.challenge = null;
  emit('challenge');
  return res;
}

// ── reads ────────────────────────────────────────────────────────────────────
export function getBoardState() {
  return {
    scene: state.scene,
    grid: { width: GRID_W, height: GRID_H, legend: '# wall · . floor · , rubble · ~ water · D door · L lava', rows: MAPS[state.scene.mapId].rows },
    tokens: state.tokens.map(t => ({ id: t.id, name: t.name, kind: t.kind, art: t.art, x: t.x, y: t.y, hp: t.hp, maxHp: t.maxHp, conditions: t.conditions })),
    combat: state.combat.active ? { active: true, round: state.combat.round, order: state.combat.order.map(id => findToken(id)?.name), current: findToken(state.combat.order[state.combat.turnIndex])?.name } : { active: false },
    activeBoosts: { ...state.boosts },
    party: state.party,
    recentLog: state.log.slice(-12).map(l => `[${l.type}] ${l.actor}: ${l.text}`),
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
    activeChallenge: state.challenge ? { exercise: state.challenge.exercise, reps: state.challenge.reps, progress: state.challenge.progress, status: state.challenge.status } : null,
    unspentBoosts: { ...state.boosts },
    availableExercises: allowedExercises(),
    coachNote: 'Offer ONLY exercises listed in availableExercises — the player chose them. Vary muscle groups; scale reps down if the player is slowing. Challenges must always stay optional.',
  };
}
