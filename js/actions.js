// ── Arcana Table · actions ───────────────────────────────────────────────────
// Every game mutation is a named action. The UI buttons call these; the WebMCP
// tools call these. One API, two hands on the table.

import {
  state, save, findToken, isWalkable, GRID_W, GRID_H, MAPS, QUEST,
  DEATH_SAVE_DC, DEATH_SAVE_FAILS, STRETCHES, WARMUP_PLANS, OATH_KINDS,
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
  if (t.hp === 0) {
    if (t.kind === 'pc') { goDown(t); }
    else logStory('combat', 'DM', `${t.name} is defeated!`);
  }
  // Healing a downed hero back above zero puts them on their feet.
  if (t.hp > 0 && state.downed?.tokenId === t.id) return { ...standUp(`${t.name} is pulled back from the edge.`), hp: t.hp };
  emit();
  return { ok: true, token: t.id, hp: t.hp, maxHp: t.maxHp, down: t.hp === 0, timeStopped: !!state.downed };
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

export function proposeChallenge({ exercise, reps, reward, reason = '', mode = 'reps', seconds }) {
  if (state.challenge) return { error: 'A challenge is already in progress — resolve it first.' };
  if (state.oath) return { error: 'The player is away keeping an Oath. Wait for them.' };
  mode = mode === 'hold' ? 'hold' : 'reps';
  exercise = String(exercise || '').toLowerCase();
  const allowed = allowedExercises();
  if (!EXERCISES.includes(exercise)) return { error: `Unknown exercise "${exercise}". Choose: ${allowed.join(', ')}.` };
  if (!allowed.includes(exercise)) {
    return { error: `This player has not enabled "${exercise}". Offer one of: ${allowed.join(', ')}.` };
  }
  if (mode === 'hold') {
    seconds = Math.max(5, Math.min(300, Math.round(seconds || 30)));
    reps = seconds;                          // the ring fills once per second
  } else {
    reps = Math.max(1, Math.min(100, Math.round(reps || 10)));
  }
  if (!REWARDS[reward]) return { error: `Unknown reward "${reward}". Choose: ${Object.keys(REWARDS).join(', ')}.` };

  const id = `chal-${++challengeSeq}-${Date.now().toString(36)}`;
  state.challenge = { id, mode, exercise, reps, seconds: mode === 'hold' ? seconds : null, reward, reason, progress: 0, status: 'offered', startedAt: null };
  const ask = mode === 'hold' ? `${seconds}s ${exercise}` : `${reps} ${exercise}`;
  logStory('challenge', 'DM', `💪 HEROIC EFFORT: ${ask} → ${REWARDS[reward].label}. ${reason}`);
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
  const waiter = challengeWaiters.get(c.id);
  if (waiter) { challengeWaiters.delete(c.id); waiter(res); }
  state.challenge = null;
  emit('challenge');
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
  label = String(label || '').trim().slice(0, 90);
  if (!label) return { error: 'Say what the Oath actually is, e.g. "clear the sink" or "read 10 pages".' };
  kind = OATH_KINDS.includes(String(kind).toLowerCase()) ? String(kind).toLowerCase() : 'chores';
  minutes = Math.max(1, Math.min(60, Math.round(minutes || 10)));
  if (!REWARDS[reward]) return { error: `Unknown reward "${reward}". Choose: ${Object.keys(REWARDS).join(', ')}.` };

  const id = `oath-${++oathSeq}-${Date.now().toString(36)}`;
  state.oath = { id, label, kind, minutes, reward, reason, status: 'offered', startedAt: null, endsAt: null };
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

export function startWarmup({ plan = '90s' } = {}) {
  if (!WARMUP_PLANS[plan]) return { error: `Unknown plan "${plan}". Choose: ${Object.keys(WARMUP_PLANS).join(', ')}.` };
  if (state.warmup) return { error: 'A warm-up is already running.' };
  const p = WARMUP_PLANS[plan];
  state.warmup = { planId: plan, index: 0, hold: p.hold, count: p.count, remaining: p.hold, paused: false, startedAt: Date.now() };
  logStory('challenge', 'DM', `🤸 Warm-up — ${p.label}, ${p.count} stretches. Stand up.`);
  clearInterval(warmTimer);
  warmTimer = setInterval(tickWarmup, 1000);
  prologueBeat(0);                       // give the board something to do at once
  emit('warmup');
  return { ok: true, plan, stretches: p.count, holdSeconds: p.hold, totalSeconds: p.count * p.hold, first: STRETCHES[0].name };
}

// While you stretch, the game should not sit frozen. Each stretch advances a
// silent prologue on the board behind the card: the torches find another
// stretch of wall, the party walks in, the keep wakes up around you.
const PROLOGUE = [
  'Torchlight finds the first of the flooded steps.',
  'Brannok shoulders the door and it gives, grinding on wet stone.',
  'Wren lights a second torch from the first. The hall opens ahead.',
  'Black water laps at your boots. Something has been through here.',
  'A dropped shield, rusted through. Older than this week.',
  'The passage bends. Further in, the water is still moving.',
  'Wren checks her pack without being asked. She has done this before.',
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
  return { ok: true, now: STRETCHES[w.index].name };
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
  const s = STRETCHES[w.index] || STRETCHES[STRETCHES.length - 1];
  return { ...s, index: w.index, of: w.count, remaining: w.remaining, hold: w.hold, paused: w.paused };
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

  q.completed.push({ id: beat.id, title: beat.title, at: Date.now(), summary: String(summary || '').slice(0, 240) });
  logStory('quest', 'DM', `✦ ${beat.title} — complete. ${summary}`.trim());
  if (beat.reward) awardLoot(beat.reward);

  q.beatIndex++;
  const next = QUEST.beats[q.beatIndex];
  if (!next) {
    q.status = 'won';
    q.finishedAt = Date.now();
    endCombat();
    logStory('quest', 'DM', `👑 ${QUEST.name} is yours. The marshes cool. The run is won.`);
    emit('quest');
    return { ok: true, questComplete: true, status: 'won', totalReps: state.fitness.totalReps, loot: state.party.loot, gold: state.party.gold };
  }

  if (next.mapId !== state.scene.mapId) setScene({ mapId: next.mapId });
  logStory('quest', 'DM', `✦ Next: ${next.title} — ${next.objective}`);
  const spawned = next.boss ? addToken({ ...next.boss, kind: 'monster', maxHp: next.boss.hp }) : null;
  emit('quest');
  return {
    ok: true, beat: next.id, title: next.title, objective: next.objective,
    beatNumber: q.beatIndex + 1, of: QUEST.beats.length,
    bossSpawned: spawned?.token?.name || null,
    note: next.boss ? 'This is the final beat. Play it like one.' : undefined,
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
    timeStopped: timeStopped(),
    downed: state.downed ? { name: state.downed.name, successes: state.downed.saves, failures: state.downed.fails, of: DEATH_SAVE_FAILS } : null,
    note: q.status === 'active'
      ? 'Drive play toward current.objective. When the party has achieved it, call advance_quest — that is what moves the story and pays the milestone.'
      : `The run is ${q.status}.`,
  };
}

export function resetQuest() {
  state.quest = { beatIndex: 0, status: 'active', completed: [], startedAt: Date.now() };
  state.downed = null;
  emit('quest');
  return { ok: true, ...getQuest() };
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
    quest: getQuest(),
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
    activeChallenge: state.challenge
      ? { mode: state.challenge.mode, exercise: state.challenge.exercise, reps: state.challenge.reps, seconds: state.challenge.seconds, progress: state.challenge.progress, status: state.challenge.status }
      : null,
    activeOath: state.oath
      ? { label: state.oath.label, minutes: state.oath.minutes, status: state.oath.status, secondsLeft: Math.ceil(oathRemaining() / 1000) }
      : null,
    warmup: state.warmup ? currentStretch() : null,
    unspentBoosts: { ...state.boosts },
    availableExercises: allowedExercises(),
    oathKinds: OATH_KINDS,
    coachNote: [
      'Three ways to stake effort, and they are equals — never treat the Oath as the lesser option.',
      'reps: countable, tapped or counted out loud. hold: a timed hold, the ring counts itself down.',
      'oath: something real in the room the app cannot see. It locks the table for the minutes agreed.',
      'Offer ONLY exercises listed in availableExercises — the player chose them.',
      'Vary muscle groups; scale down if they are slowing. Everything here is always optional.',
    ].join(' '),
  };
}
