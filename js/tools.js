// ── Arcana Table · WebMCP surface ────────────────────────────────────────────
// Registers the game's actions as WebMCP tools via navigator/document.modelContext.
// Sensitive calls route through a player-approval queue; every call is written
// to the visible Agent Log. Combat tools register dynamically when combat starts.

import { state, findToken } from './state.js';
import * as A from './actions.js';
import { onChange, emit } from './actions.js';

const mc = () => (typeof document !== 'undefined' && document.modelContext)
             || (typeof navigator !== 'undefined' && navigator.modelContext)
             || null;

// native → the browser ships WebMCP · polyfill → our vendored shim is providing
// it · missing → no tool surface at all (manual DM panel still runs the game).
export function webmcpMode() {
  const ctx = mc();
  if (!ctx || typeof ctx.registerTool !== 'function') return 'missing';
  if (window.__arcanaNativeWebMCP) return 'native';
  return (ctx.__isWebMCPPolyfill || ctx.isWebMCPPolyfill) ? 'polyfill' : 'native';
}

export const agentState = { available: false, mode: 'missing', registered: [] };

// ── approval queue ───────────────────────────────────────────────────────────
let approvalSeq = 0;
const approvalWaiters = new Map();
export const pendingApprovals = [];   // rendered by ui.js

// Resolves 'ok' | 'denied' | 'timeout'. A judge who never notices the prompt
// should not watch the DM sit frozen — 45s and the turn moves on.
const APPROVAL_WINDOW_MS = 45_000;
function requestApproval(description) {
  if (state.settings.autoApprove) return Promise.resolve('ok');
  const id = ++approvalSeq;
  return new Promise(resolve => {
    pendingApprovals.push({ id, description });
    approvalWaiters.set(id, resolve);
    emit('approvals');
    setTimeout(() => { if (approvalWaiters.has(id)) settleApproval(id, false, true); }, APPROVAL_WINDOW_MS);
  });
}

export function settleApproval(id, approved, timedOut = false) {
  const i = pendingApprovals.findIndex(p => p.id === id);
  if (i >= 0) pendingApprovals.splice(i, 1);
  const w = approvalWaiters.get(id);
  approvalWaiters.delete(id);
  if (w) w(timedOut ? 'timeout' : approved ? 'ok' : 'denied');
  emit('approvals');
}

// ── agent log ────────────────────────────────────────────────────────────────
// One row per tool call, updated in place as it moves called → approval → done.
// (Pushing a row per state change made the log read as if every tool ran twice.)
function beginAgent(tool, args) {
  const entry = { t: Date.now(), tool, args, status: 'called', note: '' };
  state.agentLog.push(entry);
  if (state.agentLog.length > 120) state.agentLog.shift();
  emit('agentLog');
  return entry;
}
function updateAgent(entry, status, note = '') {
  if (!entry) return;
  entry.status = status;
  entry.note = note;
  emit('agentLog');
}

// ── tool definitions ─────────────────────────────────────────────────────────
const obj = (properties, required = []) => ({ type: 'object', properties, required });
const str = d => ({ type: 'string', description: d });
const num = d => ({ type: 'number', description: d });

export const BASE_TOOLS = [
  {
    name: 'get_board_state',
    description: 'Read the full game board: scene, map grid with legend, all tokens with positions and HP, combat status, active Heroic Effort boosts, party loot, and the recent story log. Call this first, and again whenever you need fresh eyes on the table.',
    inputSchema: obj({}),
    annotations: { readOnlyHint: true },
    handler: () => A.getBoardState(),
  },
  {
    name: 'get_character_sheet',
    description: 'Read a character sheet: HP, AC, ability scores, conditions, inventory. Defaults to the first player character.',
    inputSchema: obj({ tokenId: str('Token id or name, e.g. "Brannok"') }),
    annotations: { readOnlyHint: true },
    handler: a => A.getCharacterSheet(a),
  },
  {
    name: 'get_fitness_log',
    description: 'Read the session workout log: total reps, reps per exercise, challenges completed, dice rewards earned, unspent boosts, and any challenge in progress. Use it to pace the player — vary muscle groups and scale reps to how they are doing.',
    inputSchema: obj({}),
    annotations: { readOnlyHint: true },
    handler: () => A.getFitnessLog(),
  },
  {
    name: 'get_quest',
    description: 'Read the run: which of the five beats the party is on, its objective, what is already done, what is still ahead, and whether a hero is down. Call this when you are unsure what the party should be doing — this is the destination the whole session is driving toward.',
    inputSchema: obj({}),
    annotations: { readOnlyHint: true },
    handler: () => A.getQuest(),
  },
  {
    name: 'advance_quest',
    description: 'Mark the current beat achieved and move the run to the next one. This pays out the milestone loot, swaps the map when the next beat is elsewhere, and on the final beat spawns the boss. Call it the moment the party has actually done what the objective asked — never before, and never twice for the same beat. Advancing past the last beat wins the run.',
    inputSchema: obj({ summary: str('One line on how the party pulled it off, in DM voice') }),
    handler: a => A.advanceQuest(a),
  },
  {
    name: 'roll_dice',
    description: 'Roll dice on the table, visibly, with animation. Formula like "d20", "2d6+3". Any earned Heroic Effort boosts (bonus, advantage, or a set die) apply automatically to a single d20 and are consumed. Rolls are public — no fudging.',
    inputSchema: obj({ formula: str('Dice formula, e.g. "d20" or "2d6+3"'), reason: str('What the roll is for, e.g. "Brannok attacks the goblin"') }, ['formula']),
    handler: a => A.rollDice(a),
  },
  {
    name: 'narrate',
    description: 'Speak as the Dungeon Master: describe rooms, voice NPCs, react to rolls. Text is posted to the story log the player reads. Keep it vivid and under ~60 words per call.',
    inputSchema: obj({ text: str('Narration text'), speaker: str('Optional speaker label, default "DM"') }, ['text']),
    handler: a => A.narrate(a),
  },
  {
    name: 'set_scene',
    description: 'Change the scene: switch the map ("dungeon" = Sunken Keep, "forest" = Whispering Glade, "crypt" = Ember Crypt), retitle it, set the mood line. Switching maps resets fog of war around the party.',
    inputSchema: obj({ mapId: { type: 'string', enum: ['dungeon', 'forest', 'crypt'], description: 'Which battle map' }, title: str('Scene title'), mood: str('One-line mood, shown under the title') }),
    handler: a => A.setScene(a),
  },
  {
    name: 'reveal_area',
    description: 'Clear fog of war in a circle. Use when the party gains sight of a new area.',
    inputSchema: obj({ x: num('Grid x (0-21)'), y: num('Grid y (0-13)'), radius: num('Cells, default 3, max 10') }, ['x', 'y']),
    handler: a => A.revealArea(a),
  },
  {
    name: 'move_token',
    description: 'Move a token to a grid cell (walls are rejected). The move animates on the board. Moving a PC also reveals fog around them.',
    inputSchema: obj({ tokenId: str('Token id or name'), x: num('Grid x (0-21)'), y: num('Grid y (0-13)') }, ['tokenId', 'x', 'y']),
    handler: a => A.moveToken(a),
  },
  {
    name: 'attack',
    description: 'Make one attack and resolve it: rolls to hit against the target\'s AC, applies damage, and lifts the fog around whatever was hit. REACH IS ENFORCED HERE — a melee attack must be adjacent (or within the attacker\'s reach) and will be REFUSED with the exact cell to move to if it is not; ranged and spell attacks work out to the attacker\'s range. Use this for every swing, shot and spell instead of rolling dice and adjusting HP by hand: it is what keeps the board honest, and any Heroic Effort boost the player earned is spent on the roll automatically.',
    inputSchema: obj({
      attackerId: str('Who is attacking — token id or name'),
      targetId: str('Who they are attacking — token id or name'),
      kind: { type: 'string', enum: ['melee', 'ranged', 'spell'], description: 'melee needs adjacency; ranged and spell work at the attacker\'s range' },
      damage: num('Damage on a hit. Omit for a sensible default (more on a critical).'),
      reason: str('What the attack is, in DM voice — "Brannok brings the longsword down"'),
    }, ['attackerId', 'targetId']),
    handler: a => A.attack(a),
  },
  {
    name: 'move_party',
    description: 'Move the WHOLE party to a grid cell in one call — use this whenever the players travel: through a door, into the next room, across the hall, following something. The leader lands on the cell, companions take open cells beside them, and the fog lifts around all of them. Walls are rejected. Prefer this over repeated move_token calls: if you describe the party going somewhere, call this in the same turn or the board will contradict you.',
    inputSchema: obj({
      x: num('Grid x (0-21)'), y: num('Grid y (0-13)'),
      who: str('Omit to move everyone. A token id or name moves only that hero.'),
    }, ['x', 'y']),
    handler: a => A.moveParty(a),
  },
  {
    name: 'add_token',
    description: 'Spawn a creature or object on the board. Art options: knight, wizard, goblin, skeleton, dragon, wolf, chest, villager.',
    inputSchema: obj({
      name: str('Display name, e.g. "Snaggle the Goblin"'),
      kind: { type: 'string', enum: ['monster', 'npc', 'object'], description: 'What it is' },
      art: { type: 'string', enum: ['knight', 'wizard', 'goblin', 'skeleton', 'dragon', 'wolf', 'chest', 'villager'], description: 'Token art' },
      x: num('Grid x'), y: num('Grid y'), hp: num('Hit points (also max HP unless maxHp given)'), maxHp: num('Max hit points'),
    }, ['name']),
    handler: a => A.addToken(a),
  },
  {
    name: 'remove_token',
    description: 'Remove a token from the board (defeated monster, opened chest). Clearing monsters and objects is immediate; removing a PLAYER CHARACTER requires the player\'s approval — that call waits for their ✓.',
    inputSchema: obj({ tokenId: str('Token id or name') }, ['tokenId']),
    // Consent protects the player's own pieces. Sweeping a dead goblin off the
    // board is bookkeeping — gating it just stalls the DM mid-scene.
    approval: a => {
      const t = findToken(a.tokenId);
      return (t && t.kind === 'pc') ? `Remove ${t.name} from the board` : null;
    },
    handler: a => A.removeToken(a),
  },
  {
    name: 'start_combat',
    description: 'Begin combat. Rolls initiative automatically (or pass an explicit order of token ids/names). While combat runs, the combat tools advance_turn, update_hp and apply_condition become available.',
    inputSchema: obj({ order: { type: 'array', items: { type: 'string' }, description: 'Optional initiative order (token ids or names)' } }),
    handler: a => A.startCombat(a),
  },
  {
    name: 'end_combat',
    description: 'End combat and clear initiative. The combat-only tools unregister.',
    inputSchema: obj({}),
    handler: () => A.endCombat(),
  },
  {
    name: 'award_loot',
    description: 'Grant treasure to the party: items and/or gold. Shows up in the party panel and story log.',
    inputSchema: obj({ items: { type: 'array', items: { type: 'string' }, description: 'Item names' }, gold: num('Gold pieces') }),
    handler: a => A.awardLoot(a),
  },
  {
    name: 'propose_challenge',
    description: 'HEROIC EFFORT — stake a real exercise against the dice. Offer this before a roll that matters: the player does the reps, the reward auto-applies to their next d20. Always optional; scale to the stakes (boss fight → 10 push-ups for nat20; minor check → a few jumping jacks for +2). ALWAYS check get_fitness_log first: offer ONLY from its availableExercises list for mode "reps", and ONLY from its availableHolds list for mode "hold" — those are the sets this player can actually do, and the two lists are not interchangeable. The call resolves when the player finishes or declines (or returns "pending" if they take longer than 90s — check back with get_fitness_log).',
    inputSchema: obj({
      mode: { type: 'string', enum: ['reps', 'hold'], description: 'reps = counted repetitions (default) · hold = a timed hold, e.g. a plank or a stretch' },
      // One enum for both modes; the handler checks the name against the list
      // for the mode actually chosen and says so plainly if they are crossed.
      exercise: { type: 'string', enum: [...A.EXERCISES, ...A.HOLDS], description: 'A rep exercise for mode "reps", or a hold for mode "hold"' },
      reps: num('Repetition count for mode "reps" (1-100). Keep it achievable: 5-25 for most people.'),
      seconds: num('Hold length in seconds for mode "hold" (5-300). 20-45s is a real hold for most people.'),
      reward: { type: 'string', enum: Object.keys(A.REWARDS), description: 'bonus+2 · bonus+5 · advantage · set10 (next d20 is a 10) · nat20 (next d20 is a natural 20)' },
      reason: str('Why fate demands sweat right now, in DM voice'),
    }, ['exercise', 'reward']),
    handler: a => A.proposeChallenge(a),
  },
  {
    name: 'propose_oath',
    description: 'OATH — the other way to pay. Stake something real in the room that this app cannot see: clearing the sink, twenty minutes of study, ten pages of reading, practising an instrument, one dreaded email. The table LOCKS for the minutes agreed — the board freezes, you wait, and the player confirms on their honour when they return. It pays exactly the same dice rewards as a Heroic Effort, and you must treat it as an equal, never a consolation prize. Reach for it when a player cannot or would rather not exercise, when they mention something they are avoiding, or simply to vary what the table asks of them. Keep the minutes honest: 5-25 for most things.',
    inputSchema: obj({
      label: str('The actual commitment, in their words: "clear the sink", "read 10 pages of the textbook"'),
      kind: { type: 'string', enum: A.OATH_KINDS, description: 'chores · study · reading · practice · admin · tidy' },
      minutes: num('How long the table waits (1-60). Match it to the real job.'),
      reward: { type: 'string', enum: Object.keys(A.REWARDS), description: 'Same rewards as a Heroic Effort' },
      reason: str('Why the fates accept this, in DM voice'),
    }, ['label', 'minutes', 'reward']),
    handler: a => A.proposeOath(a),
  },
  {
    name: 'start_warmup',
    description: 'Run the guided warm-up: standing stretches, head to ankle, each with a spoken cue and a timer that advances itself. Offer this ONCE at the very start of a run, before the first real beat — "before we begin, stand up" — and never interrupt a fight with it. Plans: 90s (6 stretches), 3min (12), 5min (20), 10min (20 at a slower hold). Finishing it grants +2 on the next roll. It needs no equipment and no floor.',
    inputSchema: obj({ plan: { type: 'string', enum: ['90s', '3min', '5min', '10min'], description: 'How long the player has' } }),
    handler: a => A.startWarmup(a),
  },
];

export const COMBAT_TOOLS = [
  {
    name: 'advance_turn',
    description: 'Advance to the next combatant in initiative order. Announces whose turn it is.',
    inputSchema: obj({}),
    handler: () => A.advanceTurn(),
  },
  {
    name: 'update_hp',
    description: 'Apply damage (negative delta) or healing (positive delta) to a token. Damaging a player character requires the player\'s approval — the call waits for their ✓.',
    inputSchema: obj({ tokenId: str('Token id or name'), delta: num('HP change: -6 = 6 damage, +4 = heal 4') }, ['tokenId', 'delta']),
    approval: a => {
      const t = findToken(a.tokenId);
      return (t && t.kind === 'pc' && Number(a.delta) < 0) ? `Deal ${-a.delta} damage to ${t.name}` : null;
    },
    handler: a => A.updateHp(a),
  },
  {
    name: 'apply_condition',
    description: 'Add or remove a condition on a token (poisoned, stunned, blessed…). Shows as pips under the token.',
    inputSchema: obj({ tokenId: str('Token id or name'), condition: str('Condition name'), remove: { type: 'boolean', description: 'true to remove it' } }, ['tokenId', 'condition']),
    handler: a => A.applyCondition(a),
  },
];

// Only exists while a hero is bleeding out. Registers on the way down and
// aborts on the way back up, so the registry itself tells the story.
export const DOWNED_TOOLS = [
  {
    name: 'death_save',
    description: 'Roll a death save for the hero who is down. 10 or better is a success (two successes and they are up); under 10 is a failure, and three failures ends the run. A natural 20 puts them straight back on their feet. Before you spend a save on the dice, remember the other option: a completed Heroic Effort ALWAYS revives them. Offer the reps first — that is the point of this table.',
    inputSchema: obj({}),
    handler: () => A.deathSave(),
  },
];

// ── registration ─────────────────────────────────────────────────────────────
// Per the WebMCP spec, a tool is unregistered by aborting the AbortSignal it
// was registered with — that fires `toolchange` so agents refresh their list.
const registered = new Map();   // name → AbortController

// The only writes allowed while a hero is down: say something, roll the save,
// offer the reps, or heal them. Everything else waits.
const FROZEN_OK = new Set(['death_save', 'propose_challenge', 'propose_oath', 'narrate', 'update_hp']);
// An Oath locks the table just as hard: the player is out of the room.
const OATH_OK = new Set(['narrate']);

function wrap(def) {
  return {
    name: def.name,
    description: def.description,
    inputSchema: def.inputSchema,
    annotations: def.annotations || { readOnlyHint: false },
    execute: async (input) => {
      const entry = beginAgent(def.name, input);
      try {
        // While a hero is down the board is frozen. Reads still work, and so do
        // the two things that can end it — a death save, or real reps.
        // The player is away keeping an Oath. Nothing happens until they return.
        if (A.oathActive() && !OATH_OK.has(def.name) && !def.annotations?.readOnlyHint) {
          const left = Math.ceil(A.oathRemaining() / 1000);
          updateAgent(entry, 'error', 'the player is away keeping an Oath');
          return {
            error: `The player is away keeping an Oath: "${state.oath.label}". ${left}s left on the clock. The table waits — do not act, do not roll, and do not fill the silence. Say one short line if you must and then wait.`,
            oathActive: true, secondsLeft: left,
          };
        }
        if (A.timeStopped() && !FROZEN_OK.has(def.name) && !def.annotations?.readOnlyHint) {
          const msg = `Time has stopped: ${state.downed.name} is down (${state.downed.fails}/3 failures). Nothing else moves. Either call death_save, or — better — offer a Heroic Effort, because completed reps always put them back up.`;
          updateAgent(entry, 'error', 'frozen — a hero is down');
          return { error: msg, timeStopped: true, downed: state.downed.name };
        }
        if (def.approval) {
          const ask = def.approval(input || {});
          if (ask) {
            updateAgent(entry, 'awaiting-approval', ask);
            const verdict = await requestApproval(ask);
            if (verdict !== 'ok') {
              updateAgent(entry, 'denied', verdict === 'timeout' ? 'no answer — carried on without it' : '');
              return verdict === 'timeout'
                ? { denied: true, note: 'The player did not answer in time. Do not retry this call; carry the scene forward without it.' }
                : { denied: true, note: 'The player declined this action. Respect it and narrate around it.' };
            }
          }
        }
        const result = await def.handler(input || {});
        updateAgent(entry, result?.error ? 'error' : 'ok', result?.error || '');
        return result;
      } catch (e) {
        updateAgent(entry, 'error', String(e?.message || e));
        return { error: String(e?.message || e) };
      }
    },
  };
}

async function registerSet(defs) {
  const ctx = mc();
  for (const def of defs) {
    if (registered.has(def.name)) continue;
    const controller = new AbortController();
    registered.set(def.name, controller);
    if (ctx) {
      try {
        await ctx.registerTool(wrap(def), { signal: controller.signal });
      } catch (e) {
        console.warn('registerTool failed:', def.name, e);
      }
    }
    agentState.registered.push(def.name);
  }
  emit('agent');
}

async function unregisterSet(defs) {
  for (const def of defs) {
    const controller = registered.get(def.name);
    if (!controller) continue;
    registered.delete(def.name);
    try { controller.abort(); } catch (e) { /* already gone */ }
    agentState.registered = agentState.registered.filter(n => n !== def.name);
  }
  emit('agent');
}

export async function initTools() {
  agentState.mode = webmcpMode();
  agentState.available = agentState.mode !== 'missing';
  await registerSet(BASE_TOOLS);

  // dynamic combat toolset
  let combatWas = state.combat.active;
  if (combatWas) await registerSet(COMBAT_TOOLS);
  // dynamic downed toolset — death_save only exists while someone is bleeding out
  let downWas = !!state.downed;
  if (downWas) await registerSet(DOWNED_TOOLS);
  onChange(() => {
    if (state.combat.active !== combatWas) {
      combatWas = state.combat.active;
      combatWas ? registerSet(COMBAT_TOOLS) : unregisterSet(COMBAT_TOOLS);
    }
    if (!!state.downed !== downWas) {
      downWas = !!state.downed;
      downWas ? registerSet(DOWNED_TOOLS) : unregisterSet(DOWNED_TOOLS);
    }
  });

  // ── dev shim: same tools, callable from the console or tests ──────────────
  const all = () => [
    ...BASE_TOOLS,
    ...(state.combat.active ? COMBAT_TOOLS : []),
    ...(state.downed ? DOWNED_TOOLS : []),
  ];
  window.arcana = {
    tools: () => all().map(t => t.name),
    call: async (name, args = {}) => {
      const def = [...BASE_TOOLS, ...COMBAT_TOOLS, ...DOWNED_TOOLS].find(t => t.name === name);
      if (!def) return { error: `No tool named "${name}". Tools: ${all().map(t => t.name).join(', ')}` };
      if (COMBAT_TOOLS.includes(def) && !state.combat.active) return { error: `"${name}" is only available during combat. Call start_combat first.` };
      if (DOWNED_TOOLS.includes(def) && !state.downed) return { error: `"${name}" is only available while a hero is down.` };
      return wrap(def).execute(args);
    },
    resetQuest: () => A.resetQuest(),
    // The warm-up runs on a wall clock, so tests need to step it by hand.
    currentStretch: () => A.currentStretch(),
    skipStretch: () => A.skipStretch(),
    finishWarmup: (o) => A.finishWarmup(o || { early: true }),
  };
  window.__st = state;                 // tests reach in to fast-forward clocks
  emit('agent');
}
