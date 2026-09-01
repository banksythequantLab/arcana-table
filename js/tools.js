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

export const agentState = { available: false, registered: [] };

// ── approval queue ───────────────────────────────────────────────────────────
let approvalSeq = 0;
const approvalWaiters = new Map();
export const pendingApprovals = [];   // rendered by ui.js

function requestApproval(description) {
  if (state.settings.autoApprove) return Promise.resolve(true);
  const id = ++approvalSeq;
  return new Promise(resolve => {
    pendingApprovals.push({ id, description });
    approvalWaiters.set(id, resolve);
    emit('approvals');
    setTimeout(() => { if (approvalWaiters.has(id)) settleApproval(id, false, true); }, 120_000);
  });
}

export function settleApproval(id, approved, timedOut = false) {
  const i = pendingApprovals.findIndex(p => p.id === id);
  if (i >= 0) pendingApprovals.splice(i, 1);
  const w = approvalWaiters.get(id);
  approvalWaiters.delete(id);
  if (w) w(approved && !timedOut);
  emit('approvals');
}

// ── agent log ────────────────────────────────────────────────────────────────
function logAgent(tool, args, status, note = '') {
  state.agentLog.push({ t: Date.now(), tool, args, status, note });
  if (state.agentLog.length > 120) state.agentLog.shift();
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
    description: 'Remove a token from the board (defeated monster, opened chest). Removing anything requires player approval — the call waits for their ✓.',
    inputSchema: obj({ tokenId: str('Token id or name') }, ['tokenId']),
    approval: a => `Remove ${a.tokenId} from the board`,
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
    description: 'HEROIC EFFORT — stake a real exercise against the dice. Offer this before a roll that matters: the player does the reps, the reward auto-applies to their next d20. Always optional; scale to the stakes (boss fight → burpees for nat20; minor check → a few jumping jacks for +2). Check get_fitness_log to vary muscle groups and pace them. The call resolves when the player finishes or declines (or returns "pending" if they take longer than 90s — check back with get_fitness_log).',
    inputSchema: obj({
      exercise: { type: 'string', enum: A.EXERCISES, description: 'Which exercise' },
      reps: num('Repetition count (1-100). Keep it achievable: 5-25 for most people.'),
      reward: { type: 'string', enum: Object.keys(A.REWARDS), description: 'bonus+2 · bonus+5 · advantage · set10 (next d20 is a 10) · nat20 (next d20 is a natural 20)' },
      reason: str('Why fate demands sweat right now, in DM voice'),
    }, ['exercise', 'reps', 'reward']),
    handler: a => A.proposeChallenge(a),
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

// ── registration ─────────────────────────────────────────────────────────────
const registered = new Map();   // name → true (guard double-registration)

function wrap(def) {
  return {
    name: def.name,
    description: def.description,
    inputSchema: def.inputSchema,
    annotations: def.annotations || { readOnlyHint: false },
    execute: async (input) => {
      logAgent(def.name, input, 'called');
      try {
        if (def.approval) {
          const ask = def.approval(input || {});
          if (ask) {
            logAgent(def.name, input, 'awaiting-approval', ask);
            const ok = await requestApproval(ask);
            if (!ok) { logAgent(def.name, input, 'denied'); return { denied: true, note: 'The player declined this action. Respect it and narrate around it.' }; }
          }
        }
        const result = await def.handler(input || {});
        logAgent(def.name, input, result?.error ? 'error' : 'ok', result?.error || '');
        return result;
      } catch (e) {
        logAgent(def.name, input, 'error', String(e?.message || e));
        return { error: String(e?.message || e) };
      }
    },
  };
}

async function registerSet(defs) {
  const ctx = mc();
  for (const def of defs) {
    if (registered.has(def.name)) continue;
    registered.set(def.name, true);
    if (ctx) { try { await ctx.registerTool(wrap(def)); } catch (e) { console.warn('registerTool failed:', def.name, e); } }
    agentState.registered.push(def.name);
  }
  emit('agent');
}

async function unregisterSet(defs) {
  const ctx = mc();
  for (const def of defs) {
    if (!registered.has(def.name)) continue;
    registered.delete(def.name);
    if (ctx && typeof ctx.unregisterTool === 'function') { try { await ctx.unregisterTool(def.name); } catch (e) { /* older builds */ } }
    agentState.registered = agentState.registered.filter(n => n !== def.name);
  }
  emit('agent');
}

export async function initTools() {
  agentState.available = !!mc();
  await registerSet(BASE_TOOLS);

  // dynamic combat toolset
  let combatWas = state.combat.active;
  if (combatWas) await registerSet(COMBAT_TOOLS);
  onChange(() => {
    if (state.combat.active !== combatWas) {
      combatWas = state.combat.active;
      combatWas ? registerSet(COMBAT_TOOLS) : unregisterSet(COMBAT_TOOLS);
    }
  });

  // ── dev shim: same tools, callable from the console or tests ──────────────
  const all = () => [...BASE_TOOLS, ...(state.combat.active ? COMBAT_TOOLS : [])];
  window.arcana = {
    tools: () => all().map(t => t.name),
    call: async (name, args = {}) => {
      const def = [...BASE_TOOLS, ...COMBAT_TOOLS].find(t => t.name === name);
      if (!def) return { error: `No tool named "${name}". Tools: ${all().map(t => t.name).join(', ')}` };
      if (COMBAT_TOOLS.includes(def) && !state.combat.active) return { error: `"${name}" is only available during combat. Call start_combat first.` };
      return wrap(def).execute(args);
    },
  };
  emit('agent');
}
