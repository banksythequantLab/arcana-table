// ── Arcana Table · the AI Dungeon Master ─────────────────────────────────────
// The built-in DM is an agent like any other: it discovers what it can do by
// calling document.modelContext.getTools(), and it acts by calling
// executeTool(). It has no private back door into the game — the exact same
// surface a ChatGPT or Claude agent uses from outside.

import { state } from './state.js';
import { emit, onChange } from './actions.js';

export const DM_ENDPOINT = 'https://arcana-dm.banksythequant.workers.dev';

const MAX_TOOL_HOPS = 6;      // tool → result → tool … before we must speak
const HISTORY_TURNS = 22;

export const chat = {
  messages: [],               // {role:'user'|'dm'|'system', text}
  busy: false,
  error: null,
  enabled: true,
};

const SYSTEM = `You are the Dungeon Master of a live tabletop game called Arcana Table. You are running the game for ONE player, in real time, on a shared board they can see.

VOICE
- Second person, present tense. Vivid but tight: 2-4 sentences per beat, never a wall of text.
- You are a person at a table, not a narrator reading a book. React to what they actually did.
- End most turns by handing agency back: a question, a threat, a choice. Never railroad.

THE BOARD IS REAL
- The player SEES the board. Anything you describe must be made true with tools.
- Move a monster? call move_token. New room? set_scene / reveal_area. Something appears? add_token.
- Never say "you rolled a 14" — call roll_dice and react to what it actually returns.
- Call get_board_state when you are unsure where things are. Do not guess positions.

HEROIC EFFORT — your signature move
- When a roll genuinely matters (a boss, a leap over a chasm, a last stand), you may call
  propose_challenge to stake REAL PHYSICAL EXERCISE against the dice: e.g. 10 jumping jacks for +2,
  15 squats for advantage, 5 burpees for a guaranteed natural 20.
- Offer it in character and make it feel earned: "The wyrm rears back. Five burpees, and I'll let
  the fates hand you a twenty."
- It is ALWAYS optional; if they decline, roll normally and never nag or moralize.
- Scale to the stakes: small checks get a few jumping jacks, or no challenge at all.
- Call get_fitness_log before offering, to vary muscle groups and ease off if they have done a lot.
- Do not offer a challenge more than roughly once every three or four exchanges.

RULES OF THE TABLE
- Damaging the player character or removing a token asks THEM for permission first; if a call comes
  back denied, accept it gracefully and narrate around it. Never argue with a denial.
- Keep combat moving: start_combat, then advance_turn each round, narrate enemy actions, end_combat
  when it is done.
- Award loot when it is earned. Track fiction consistently.

Open by setting the scene where the party currently stands and asking what they do.`;

// ── the real WebMCP registry, translated into OpenAI function specs ──────────
async function toolsForModel() {
  const ctx = document.modelContext || navigator.modelContext;
  if (!ctx?.getTools) return [];
  const tools = await ctx.getTools();
  return tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema && typeof t.inputSchema === 'object'
        ? t.inputSchema
        : { type: 'object', properties: {} },
    },
  }));
}

async function runTool(name, args) {
  const ctx = document.modelContext || navigator.modelContext;
  const tool = (await ctx.getTools()).find(t => t.name === name);
  if (!tool) return { error: `No tool named ${name} is registered right now.` };
  // This polyfill takes the input as a JSON string; native takes an object.
  const out = await ctx.executeTool(tool, JSON.stringify(args ?? {}));
  try { return typeof out === 'string' ? JSON.parse(out) : out; }
  catch { return { result: String(out) }; }
}

function transcript() {
  return chat.messages.slice(-HISTORY_TURNS).map(m => ({
    role: m.role === 'dm' ? 'assistant' : m.role,
    content: m.text,
  }));
}

async function ask(messages, tools) {
  const res = await fetch(DM_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages, tools }),
  });
  const data = await res.json().catch(() => ({ error: 'The DM sent something unreadable.' }));
  if (!res.ok) throw new Error(data.error || `DM unavailable (${res.status})`);
  return data;
}

/** Send a player turn (or an opening beat) and let the DM act on the board. */
export async function sendToDM(playerText, { silent = false } = {}) {
  if (chat.busy) return;
  chat.busy = true; chat.error = null;
  if (playerText && !silent) chat.messages.push({ role: 'user', text: playerText, t: Date.now() });
  emit('chat');

  try {
    const tools = await toolsForModel();
    const convo = [
      { role: 'system', content: SYSTEM },
      { role: 'system', content: `Current board state:\n${JSON.stringify(boardBrief(), null, 1)}` },
      ...transcript(),
    ];
    if (playerText && silent) convo.push({ role: 'user', content: playerText });

    for (let hop = 0; hop <= MAX_TOOL_HOPS; hop++) {
      const reply = await ask(convo, tools);

      if (reply.tool_calls?.length) {
        convo.push({ role: 'assistant', content: reply.content || null, tool_calls: reply.tool_calls });
        for (const call of reply.tool_calls) {
          let args = {};
          try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* model slip */ }
          const result = await runTool(call.function.name, args);
          convo.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(result).slice(0, 4000),
          });
        }
        if (reply.content?.trim()) {
          chat.messages.push({ role: 'dm', text: reply.content.trim(), t: Date.now() });
          emit('chat');
        }
        continue;                        // let the DM react to what the tools returned
      }

      const text = (reply.content || '').trim();
      if (text) chat.messages.push({ role: 'dm', text, t: Date.now() });
      break;
    }
  } catch (e) {
    chat.error = String(e.message || e);
    chat.messages.push({ role: 'system', text: `⚠ ${chat.error}`, t: Date.now() });
  } finally {
    chat.busy = false;
    emit('chat');
  }
}

function boardBrief() {
  const b = {
    scene: state.scene,
    tokens: state.tokens.map(t => ({ name: t.name, kind: t.kind, at: [t.x, t.y], hp: `${t.hp}/${t.maxHp}`, conditions: t.conditions })),
    combat: state.combat.active
      ? { round: state.combat.round, current: state.tokens.find(t => t.id === state.combat.order[state.combat.turnIndex])?.name }
      : 'not in combat',
    unspentHeroicBoosts: state.boosts,
    repsThisSession: state.fitness.totalReps,
  };
  return b;
}

/** Opening beat, once, when the table is fresh. */
export async function openScene() {
  if (chat.messages.length) return;
  await sendToDM('(The player has just sat down at the table. Set the opening scene where they stand and ask what they do.)', { silent: true });
}

/** A player action taken on the board deserves a DM reaction. */
let nudgeTimer = null;
export function watchBoardForPlayerMoves() {
  onChange(what => {
    if (what !== 'player-move' || chat.busy || !chat.messages.length) return;
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(() => {
      const last = state.log[state.log.length - 1];
      if (last) sendToDM(`(The player just did this on the board: ${last.actor} ${last.text} — react briefly.)`, { silent: true });
    }, 700);
  });
}
