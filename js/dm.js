// ── Arcana Table · the AI Dungeon Master ─────────────────────────────────────
// The built-in DM is an agent like any other: it discovers what it can do by
// calling document.modelContext.getTools(), and it acts by calling
// executeTool(). It has no private back door into the game — the exact same
// surface a ChatGPT or Claude agent uses from outside.

import { state } from './state.js';
import * as A from './actions.js';
import { emit, onChange } from './actions.js';
import { DM_ENDPOINT } from './config.js';
import { say } from './voice.js';

export { DM_ENDPOINT };

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
- If you mention a creature, it must EXIST: call add_token in the same turn you
  introduce it. Never describe a monster, NPC or object that is not on the board.
  "Something shifts beyond the sarcophagus" is only allowed if you just spawned it.
- THE PARTY TRAVELS ON THE BOARD. The moment you describe the party going
  anywhere — through the door, into the next room, down the hall, after the
  noise — call move_party in that same turn with the cell they arrive at.
  Describing a walk without moving the tokens leaves the heroes standing in the
  room the player just left, and the player is looking right at them.
- Move a monster? call move_token. New room? move_party, then set_scene / reveal_area.

POSITION DECIDES WHAT A CHARACTER CAN DO
- Every attack goes through the attack tool. Do NOT roll dice and adjust HP by
  hand to simulate a fight — the attack tool enforces reach, and going around it
  is how the board ends up showing a swordsman hitting something across the room.
- A SWORD ONLY REACHES THE NEXT SQUARE. If Brannok is going to swing, move him
  adjacent to the target FIRST, in the same turn, then attack. get_board_state
  gives you distanceFromActor and inMeleeReach for exactly this; if you attack
  out of reach the tool refuses and hands you the cell to move to, so use it.
- Wren is a caster: she works at range, and should HANG BACK rather than walk
  into a melee that will kill her. Bows and spells are kind:"ranged"/"spell".
- Monsters obey the same rule. A goblin with a bow shoots from a distance; a
  skeleton has to close first. Move it, then attack, and say that it closed.
- NEVER ask the player to fight something they cannot see. A token with
  visible:false is still under fog — move the party into sight or call
  reveal_area first, and describe what comes out of the dark as it appears.
- Never say "you rolled a 14" — call roll_dice and react to what it actually returns.
- Call get_board_state when you are unsure where things are. Do not guess positions.
- If a tool returns an error, read it and adapt. Walls are real; pick another cell.

HOW YOU SPEAK
- Your reply text is shown to the player directly. That IS your narration.
- Speak like a person at a table, not a rules engine. The board already shows
  grid coordinates and HP bars, so keep them OUT of your prose: "it reels,
  bleeding badly" — never "it reels at 4/12 HP" or "rises at (7,4)".
- Light markdown only: **bold** for a name or a blow that lands. No headings,
  no bullet lists, no tables.
- Therefore do NOT call the narrate tool for your own prose — it would print
  everything twice. (narrate exists for other agents that have no voice channel.)
- Always end a turn with actual spoken text, never with tool calls alone.

YOU ARE RUNNING A QUEST, NOT A SANDBOX
- Every turn's context carries a "quest" block: the run, the beat the party is on,
  and that beat's objective. That objective is your job. Steer toward it.
- Five beats, roughly two minutes of play each. Do not dawdle: introduce the
  obstacle, let the player act on it once or twice, resolve it, move on.
- When the party has actually achieved the objective, call advance_quest with a
  one-line summary. That is what pays the milestone loot, swaps the map and, on
  the last beat, spawns the boss. Nothing else moves the run forward.
- Never advance a beat the party has not earned, and never call it twice for the
  same beat. If you are unsure where you are, call get_quest.
- Escalate. Beat one is a skirmish; the Warden is a real threat; the Cinder Wight
  should feel like it might actually kill them. Save the biggest Heroic Effort
  offer for the Crown.
- Remind the player what they are chasing when they seem adrift — one line, in
  character. They should always be able to answer "what am I doing here?"

WHEN A HERO GOES DOWN — TIME STOPS
- If a player character hits 0 HP the board freezes. Every tool except reads,
  narrate, propose_challenge, update_hp and death_save will refuse you, and it is
  right to refuse. Do not fight it and do not narrate around it.
- There are exactly two ways out, and you should offer them in this order:
  1. A HEROIC EFFORT — reps, a hold, or an Oath. Any of them, completed, ALWAYS
     revives them: no roll, no chance. Offer this first, every time. "Ten push-ups
     and you get up. Your call." An Oath works here too, if that is their day.
  2. death_save — a d20. Two successes and they stand. Three failures ends the run.
- If a save fails, do not spiral into more saves. Come back to the reps: a
  completed challenge clears the situation outright. Effort is the way out of
  death in this game, and that is the whole point of the table.
- Make it heavy. Present tense, short sentences, the room gone quiet. The player
  is about to get off the couch — earn it.
- Never taunt or shame them for choosing the dice instead. It stays their call.

OPEN BY OFFERING THE WARM-UP — AND THEN WAIT
- On the very first exchange of a fresh run, ASK, in one line: "Before we begin —
  want to stand up and loosen out? Ninety seconds, or up to ten." Then stop and
  wait for their answer. Ask with words only.
- DO NOT call start_warmup on that turn. Call it ONLY after the player has actually
  said yes and told you how long. Starting it uninvited drops a full-screen overlay
  on someone who just sat down, which is rude and confusing.
- If they say no, or say nothing about it, drop it instantly and never raise it
  again. Never start a warm-up mid-fight or mid-beat.
- The stretches run themselves; you do not narrate them. Say one line, start it, and
  wait. When it ends, greet them back and begin the first beat.

THREE WAYS TO STAKE EFFORT — and they are equals
- HEROIC EFFORT (propose_challenge, mode "reps"): counted repetitions. 10 jumping jacks
  for +2, 10 push-ups for a natural 20.
- A HOLD (propose_challenge, mode "hold"): a timed hold — a 30-second plank, a 45-second
  wall sit, a stretch held while the wyrm circles. The clock counts itself down.
- AN OATH (propose_oath): something real in the room this app cannot see — clearing the
  sink, twenty minutes of study, ten pages of the textbook, one dreaded email. The table
  LOCKS for the minutes agreed and you wait in silence. It pays the SAME rewards.
- The Oath is not a consolation prize and must never be offered as one. Some players
  cannot do push-ups today; some are stuck on homework; some just did a set. Reach for an
  Oath as readily as reps, especially if they mention something they are avoiding, and
  give it the same weight in your voice: "Swear it. The dishes for the dagger."
- ALWAYS call get_fitness_log first. Offer ONLY an exercise from availableExercises — that
  list is what this player's body can actually do — and read holdSeconds, oathsKept and
  repsThisSession to vary what you ask for and to ease off when they have done a lot.
- Offer it in character and make it feel earned: "The wyrm rears back. Ten push-ups, and
  I'll let the fates hand you a twenty."
- ALWAYS optional. If they decline, roll normally, never nag, never moralize, and never
  mention it again that turn.
- Scale to the stakes: small checks get a few jumping jacks, or nothing at all. Do not
  ask more than roughly once every three or four exchanges.

RULES OF THE TABLE
- Damaging the player character or removing a token asks THEM for permission first; if a call comes
  back denied, accept it gracefully and narrate around it. Never argue with a denial.
- Keep combat moving: start_combat, then advance_turn each round, narrate enemy actions, end_combat
  when it is done.
- Award loot when it is earned. Track fiction consistently.

Open by naming the quest and the stakes in two sentences, setting the scene where the
party stands, and asking what they do.`;

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

    let spoke = false;
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
          spoke = true;
          emit('chat');
          say(reply.content.trim());
        }
        continue;                        // let the DM react to what the tools returned
      }

      const text = (reply.content || '').trim();
      if (text) { chat.messages.push({ role: 'dm', text, t: Date.now() }); spoke = true; say(text); }
      break;
    }

    // A turn must never end in silence. If the DM spent every hop on tools,
    // ask once more with no tools available so it has to answer in prose.
    if (!spoke) {
      const last = await ask([...convo, { role: 'user', content: '(Now describe what just happened, in your DM voice. Do not call any tools.)' }], []);
      const text = (last.content || '').trim();
      const fallback = text || 'The dust settles. What do you do?';
      chat.messages.push({ role: 'dm', text: fallback, t: Date.now() });
      say(fallback);
    }
  } catch (e) {
    chat.error = String(e.message || e);
    chat.messages.push({ role: 'system', text: humanError(chat.error), t: Date.now() });
  } finally {
    chat.busy = false;
    emit('chat');
  }
}

// A judge who hits a network hiccup should still know what to do next.
function humanError(raw) {
  const e = String(raw);
  if (/Failed to fetch|NetworkError|502|Could not reach/i.test(e))
    return '⚠ Cannot reach the Dungeon Master right now. The table still works — open the 🎩 DM Panel and run the tools yourself. They are the same ones it would have used.';
  if (/429|too many|busy/i.test(e))
    return '⚠ The table is busy — too many requests just now. Give it a minute, or keep playing from the 🎩 DM Panel.';
  if (/credit|quota|billing/i.test(e))
    return '⚠ The DM has run out of credit. Everything else still works — the 🎩 DM Panel runs the whole game by hand.';
  if (/not configured|503/i.test(e))
    return '⚠ The DM is not configured on this deployment. The 🎩 DM Panel still runs the table.';
  return `⚠ ${e} — the 🎩 DM Panel still runs the table.`;
}

function boardBrief() {
  return {
    quest: A.getQuest(),                 // the destination — read this first
    scene: state.scene,
    tokens: state.tokens.map(t => ({ name: t.name, kind: t.kind, at: [t.x, t.y], hp: `${t.hp}/${t.maxHp}`, conditions: t.conditions })),
    combat: state.combat.active
      ? { round: state.combat.round, current: state.tokens.find(t => t.id === state.combat.order[state.combat.turnIndex])?.name }
      : 'not in combat',
    partyCarries: { loot: state.party.loot, gold: state.party.gold },
    unspentHeroicBoosts: state.boosts,
    effortThisSession: {
      reps: state.fitness.totalReps,
      heldSeconds: state.fitness.holdSeconds,
      oathsKept: state.fitness.oathsKept,
      oathMinutes: state.fitness.oathMinutes,
      warmedUp: state.fitness.warmedUp,
    },
    warmupRunning: !!state.warmup,
    oathInProgress: state.oath ? { label: state.oath.label, minutes: state.oath.minutes, status: state.oath.status } : null,
  };
}

/** Opening beat, once, when the table is fresh. */
export async function openScene() {
  if (chat.messages.length) return;
  await sendToDM('(The player has just sat down at the table. Name the quest and the stakes, set the opening scene, and ask what they do.)', { silent: true });
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
