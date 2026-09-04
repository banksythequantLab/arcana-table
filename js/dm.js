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

// An offer described in prose is an offer that never happened: no card, no
// clock, no button, nothing for the player to accept. The player saw exactly
// this — "Five push-ups would put a +2 edge on your next roll, if you want to
// stake effort before the clash" — and the tool was never called. However the
// prompt is worded the model drifts back to narrating the bargain, so the loop
// refuses a reply that reads like one and sends it back to make the call.
const OFFER_WORDS  = /\b(push-?ups?|squats?|crunch(?:es)?|jumping jacks?|lunges?|burpees?|planks?|wall sits?|sit-?ups?|high knees|mountain climbers|glute bridges?|dead hangs?|hollow holds?|oath|swear|dishes|the sink|minutes? of (?:study|reading|practice)|reps?)\b/i;
const REWARD_WORDS = /(\+\s?\d|natural (?:twenty|20)|nat ?20|advantage|edge on|bonus|(?:on|to) your next (?:roll|swing|check|attack)|stake|wager|buy you|buys you|earn you|earns you)/i;
export function looksLikeProseOffer(text) {
  const s = String(text || '');
  return OFFER_WORDS.test(s) && REWARD_WORDS.test(s);
}
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
- Move a monster? call move_token. New room? move_party, then reveal_area.
- set_scene CANNOT switch maps — the tool refuses. Each beat owns its map and
  advance_quest changes it for you when the beat is cleared, paying the milestone
  as it goes. If the party has reached the far side, the vault, the glade, the
  crypt: that is advance_quest, not a scene change. Use set_scene for the title
  and the mood line only.

POSITION DECIDES WHAT A CHARACTER CAN DO
- Every attack goes through the attack tool. Do NOT roll dice and adjust HP by
  hand to simulate a fight — the attack tool enforces reach, and going around it
  is how the board ends up showing a swordsman hitting something across the room.
- A SWORD ONLY REACHES THE NEXT SQUARE. If Brannok is going to swing, move him
  adjacent to the target FIRST, in the same turn, then attack. get_board_state
  gives you distanceFromActor and inMeleeReach for exactly this; if you attack
  out of reach the tool refuses and hands you the cell to move to, so use it.
- MIRA THROWS FIREBALLS. She is a caster with eight squares of reach — more than
  anything on the board except a dragon's breath — and she should HANG BACK and
  throw rather than walk into a melee that will kill her at 14 HP. Cast with
  kind:"spell": from more than one square away that IS a fireball, and it bursts,
  catching every other monster within a square of what she aimed at for half
  damage. So aim her at the middle of a cluster, and say so — "Mira's fireball
  bursts over the pack" — because the board will show exactly that.
- THE FIGHT STARTS WHEN THE PARTY GETS CLOSE. Walk the party within two squares of a
  monster and combat begins by itself — move_party / move_token return combatStarted
  and the monsters may already have acted. The first beat's drowned guard is ALREADY
  in the hall at the start; you do not spawn it, you walk the party at it. The
  Warden and the Wight arrive with their beats and start their own fights too.
- MONSTERS TAKE THEIR OWN TURNS. You do not swing them. When initiative lands on a
  monster — at start_combat or after advance_turn — it closes and attacks the nearest
  hero by itself, and the result comes back to you in monstersActed. Your job is to
  NARRATE what it did in a line or two and then ask the player what they do. Never
  end a turn with a monster standing there waiting to be engaged, and never ask the
  player to "say the word" before a creature acts. It acts. That is what turns are.
- A round is: the player acts (you resolve it with attack or move_party) → you call
  advance_turn ONCE → every monster goes → you narrate → the player is up again.
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
- A BEAT IS TWO TO FOUR EXCHANGES. Introduce the obstacle, let the player act on
  it once or twice, resolve it, ADVANCE. get_quest returns exchangesOnThisBeat
  and beatOverdue; when beatOverdue is true you have been here too long — bring
  it to a head on THIS turn and call advance_quest. A live run took nine
  exchanges to clear the first beat of five, which is a session nobody finishes.
- NEVER GATE PROGRESS ON A PHRASE. Do not tell the player to "say 'we cross into the
  glade' to move on" or wait for magic words. If the beat is done, call advance_quest
  yourself and narrate the crossing. If it is not done, tell them what still stands in
  the way. The player acts; you do not hand them a script.
- If the player says they are moving on — "on to the glade", "we head for the
  crypt" — and the obstacle is dealt with, that IS the cue. Advance. Do not make
  them ask twice.
- When the party has actually achieved the objective, call advance_quest with a
  one-line summary. That is what pays the milestone loot, swaps the map and, on
  the last beat, spawns the boss. Nothing else moves the run forward.
- THERE IS ONE WARDEN AND THE BEAT SPAWNS IT. "Break the Warden's ring" puts The
  Waking Warden on the board itself and starts the fight itself. Do not invent a
  warden earlier — not a "Vault Warden", not a "Glade Warden" — a player who meets
  three wardens in a row stops believing any of them. Guard the vault with something
  drowned; watch the glade with wolves, spiders or goblins.
- Never advance a beat the party has not earned, and never call it twice for the
  same beat. If you are unsure where you are, call get_quest.
- Escalate. Beat one is a skirmish; the Warden is a real threat; the Cinder Wight
  should feel like it might actually kill them. Save the biggest Heroic Effort
  offer for the Crown.
- Remind the player what they are chasing when they seem adrift — one line, in
  character. They should always be able to answer "what am I doing here?"
- YOUR OPENING TURN MUST TELL THEM WHAT TO DO NEXT, in plain words, as a thing a
  person could actually type or say. Not "what do you do?" on its own — a player
  who has never seen this table does not know what is on offer. Name the room
  they are in, name the way out, and hand them one concrete first move: "The only
  door out is at the far end of the flooded hall — say the word and you wade for
  it, or look around first." One sentence of scene, one sentence of direction.
- Do the same any time they go quiet, answer vaguely, or ask "what now?" — give
  them the actual next action, not an invitation to invent one.

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

OPEN BY OFFERING THE WARM-UP — AS A CARD, NOT A QUESTION IN THE CHAT
- On the very first exchange of a fresh run, call start_warmup WITH NO PLAN. That
  puts a card on screen with the buttons on it — 90 seconds, 3 minutes, 5 minutes,
  or straight in — and the player picks. Say one warm line alongside it ("Before we
  begin — stand up and loosen out?") and then STOP and wait.
- Do not ask which length in prose and wait for them to type it. That was the old
  way and the moment died in the chat while they typed. The card asks; you do not.
- Do not pass a plan yourself. Pass one ONLY if the player has already said a length
  out loud ("give me three minutes"), in which case start that plan directly.
- If they dismiss the card, drop it instantly and never raise it again. Never start
  or offer a warm-up mid-fight or mid-beat.
- The stretches run themselves; you do not narrate them. Say one line, start it, and
  wait. When it ends, greet them back and begin the first beat.

THREE WAYS TO STAKE EFFORT — and they are equals
- HEROIC EFFORT (propose_challenge, mode "reps"): counted repetitions, priced by size.
  5 reps buy +2, 8 buy +3, 10 buy +5, 12 buy advantage, 15 buy +8, 20 set the die to 10,
  25 buy a natural 20. Holds run 20s / 25s / 30s / 40s / 45s / 60s / 90s for the same
  ladder, and an Oath is priced in minutes. Ask bigger when you want to pay bigger —
  and if you leave the reward out, the size of your ask picks the right one.
- A HOLD (propose_challenge, mode "hold"): a timed hold — a 30-second plank, a 45-second
  wall sit, a squat hold while the wyrm circles. The clock counts itself down. Holds come
  from availableHolds, NOT availableExercises; the two lists are separate and a rep
  exercise passed as a hold is rejected.
- A TASK LIST (propose_task_list): 2-3 small things at once, each worth its own flat
  bonus, and the player ticks off whatever they actually did. "Five push-ups, a
  twenty-second plank, five squats — that is plus two each, plus six for the lot."
  PREFER THIS when you simply want the best chance of getting something: one big ask
  is a yes/no question, a list lets them take part of it, and two rows out of three
  is +4 you would otherwise not have got. Bonuses add, so a list never pays advantage
  or a natural 20 — keep those for propose_challenge, and use the list for the ordinary
  rolls in between. Do not read the whole card aloud; name the stake and let it appear.
- AN OATH (propose_oath): something real in the room this app cannot see — clearing the
  sink, twenty minutes of study, ten pages of the textbook, one dreaded email. The table
  LOCKS for the minutes agreed and you wait in silence. It pays the SAME rewards.
- The Oath is not a consolation prize and must never be offered as one. Some players
  cannot do push-ups today; some are stuck on homework; some just did a set. Reach for an
  Oath as readily as reps, especially if they mention something they are avoiding, and
  give it the same weight in your voice: "Swear it. The dishes for the dagger."
- THE PLAYER CHOSE THEIR CURRENCY. get_fitness_log returns effortPreference with a mayAsk
  list. Offer only what is on it. This is enforced in the tools, not left to your judgement:
  ask for push-ups from someone who set "Oaths only" and the call comes back refused, and you
  will have burned a turn and broken the scene. If it says Oaths only, the Oath is not a
  substitute for the mechanic — it IS the mechanic, and you offer it with a straight face.
- ALWAYS call get_fitness_log first. Offer ONLY from availableExercises for reps and ONLY
  from availableHolds for holds — those lists are what this player's body can actually do — and read holdSeconds, oathsKept and
  repsThisSession to vary what you ask for and to ease off when they have done a lot.
- Offer it in character and make it feel earned: "The wyrm rears back. Ten push-ups, and
  I'll let the fates hand you a twenty."
- AN OFFER IS A TOOL CALL, NEVER A SENTENCE. If you catch yourself writing "five push-ups
  would give you +2" you have made a mistake: nothing appeared on the table and the player
  cannot accept it. Call propose_challenge (or propose_task_list / propose_oath) FIRST, then
  speak the one-line flourish. A reply that describes a bargain without the call is sent
  back to you unspoken.
- ALWAYS optional. If they decline, roll normally, never nag, never moralize, and never
  mention it again that turn.
- OFFER EVERY OTHER ROLL, AND THE DICE ENFORCE IT. This is the point of the whole
  table, not a garnish. Two rolls with nothing staked and roll_dice REFUSES, telling
  you to make an offer first — the game visibly stops until you do. Watch
  rollsLeftBeforeDiceStop in your turn context and offer before it reaches zero;
  a DM who paces properly never sees the refusal at all. Any roll that matters is an
  excuse to ask, and there is almost always a roll that matters.
- If the refusal does come back, do not argue with it and do not simply roll again.
  Offer in character in the same reply — "The lock is old and stubborn. Ten push-ups
  and I'll let the fates hand you a twenty" — and roll once that resolves. If the
  player declines, roll immediately; declining costs them nothing.
- Scale to the stakes rather than skipping: a minor check is five jumping jacks or a
  twenty-second hold for +2, a real fight is ten push-ups for a natural 20. A small
  ask made often beats a big ask made rarely — the player came here to move.
- Vary what you ask for across reps, holds and Oaths so it never feels like a
  treadmill, and keep every one of them optional.

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
  A.setDmResolving(true);        // a click cannot move a hero while the round is being resolved
  if (playerText && !silent) {
    chat.messages.push({ role: 'user', text: playerText, t: Date.now() });
    A.notePlayerTurn();          // drives offerOverdue in get_fitness_log
  }
  emit('chat');

  try {
    const tools = await toolsForModel();
    const convo = [
      { role: 'system', content: SYSTEM },
      { role: 'system', content: `Current board state:\n${JSON.stringify(boardBrief(), null, 1)}` },
      ...transcript(),
    ];
    if (playerText && silent) convo.push({ role: 'user', content: playerText });

    // Pacing nudges go in the MESSAGE STREAM, not in the board JSON. A live run
    // showed the DM reading exchangesOnThisBeat and beatOverdue in a blob and
    // sailing past both — ten exchanges, one beat cleared of five. The same
    // facts as a direct instruction, arriving last, are acted on.
    const onBeat = state.quest.turnsOnBeat || 0;
    const sinceOffer = state.fitness.turnsSinceOffer || 0;
    const nudges = [];
    if (state.quest.status === 'active' && onBeat >= 4) {
      const b = A.currentBeat();
      nudges.push(`(PACING: you have spent ${onBeat} exchanges on "${b?.title}" — too long. ` +
        `Bring this beat to a head in THIS reply and call advance_quest. Five beats at four ` +
        `exchanges is a run someone finishes; at ten it is one nobody does.)`);
    }
    // The roll clock is the one with teeth, so it gets the loudest warning —
    // and it fires BEFORE the dice stop, so a compliant DM never hits the wall.
    const rollsLeft = Math.max(0, A.ROLLS_PER_OFFER - (state.fitness.rollsSinceOffer || 0));
    if (rollsLeft <= 1 && !state.challenge && !state.tasks && !state.oath && !state.warmup && !state.downed) {
      nudges.push(rollsLeft === 0
        ? `(THE DICE ARE LOCKED: ${state.fitness.rollsSinceOffer} rolls with nothing staked. The next roll_dice will refuse. ` +
          `Make the offer FIRST, in character, then roll.)`
        : `(ONE ROLL LEFT before the dice stop. Stake something on this next roll — small is fine, ` +
          `five reps or twenty seconds for +2 — and the clock resets.)`);
    }
    if (sinceOffer >= 2 && !state.challenge && !state.tasks && !state.oath && !state.downed) {
      // Name the currency this player actually accepts, or the nudge sends the
      // DM straight into a refusal it then has to recover from mid-scene.
      const pref = A.effortPref();
      const what = pref === 'oaths' ? 'an Oath — this player takes nothing physical, so propose_oath is your only move'
                 : pref === 'reps'  ? 'a Heroic Effort in reps — this player takes reps only'
                 : pref === 'holds' ? 'a timed hold — this player takes holds only'
                 : 'a Heroic Effort, a hold or an Oath';
      nudges.push(`(PACING: ${sinceOffer} exchanges since you last staked anything real. ` +
        `Offer ${what} this turn — that is the point of this table.)`);
    }
    if (nudges.length) convo.push({ role: 'system', content: nudges.join(' ') });

    let spoke = false;
    let offeredThisTurn = false;          // did a propose_* tool actually run?
    let bouncedProseOffer = false;        // refuse a prose offer once, never loop
    for (let hop = 0; hop <= MAX_TOOL_HOPS; hop++) {
      const reply = await ask(convo, tools);

      if (reply.tool_calls?.length) {
        convo.push({ role: 'assistant', content: reply.content || null, tool_calls: reply.tool_calls });
        for (const call of reply.tool_calls) {
          let args = {};
          try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* model slip */ }
          if (/^propose_/.test(call.function.name)) offeredThisTurn = true;
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
      // The bargain has to be a CARD. If the reply reads like an offer and no
      // propose_* tool ran this turn, it does not reach the player: it goes back
      // with the instruction to make the call, once. If the model still will not,
      // the second version is spoken rather than leaving the turn silent.
      const nothingStaked = !state.challenge && !state.tasks && !state.oath;
      if (text && !offeredThisTurn && nothingStaked && !bouncedProseOffer && looksLikeProseOffer(text)) {
        bouncedProseOffer = true;
        A.logStory('quest', 'table', '⚠ The DM described a bargain in words instead of putting it on the table — sent back to make the call.');
        convo.push({ role: 'assistant', content: text });
        convo.push({ role: 'system', content:
          '(You just DESCRIBED an offer in prose: "' + text.slice(0, 160).replace(/"/g, "'") + '…". ' +
          'A described offer does not exist — there is no card, no clock, nothing for the player to accept. ' +
          'Call propose_challenge, propose_task_list or propose_oath NOW with exactly what you described, ' +
          'then say one short line. Do not repeat the offer in words.)' });
        continue;
      }
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
    A.setDmResolving(false);
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
    quest: A.getQuest(),
    beatPacing: { exchangesOnThisBeat: state.quest.turnsOnBeat || 0,
                  overdue: (state.quest.turnsOnBeat || 0) >= 4 },                 // the destination — read this first
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
      // In the per-turn context, not just behind a tool call: the model would
      // otherwise have to remember to go looking for its own pacing.
      turnsSinceLastOffer: state.fitness.turnsSinceOffer || 0,
      offerOverdue: (state.fitness.turnsSinceOffer || 0) >= 2,
      rollsSinceLastOffer: state.fitness.rollsSinceOffer || 0,
      rollsLeftBeforeDiceStop: Math.max(0, A.ROLLS_PER_OFFER - (state.fitness.rollsSinceOffer || 0)),
      // The standing answer on which currency this table may charge in. In the
      // per-turn context because it is the one thing that must not drift.
      effortPreference: A.effortPref(),
    },
    warmupRunning: !!state.warmup,
    oathInProgress: state.oath ? { label: state.oath.label, minutes: state.oath.minutes, status: state.oath.status } : null,
  };
}

/** Opening beat, once, when the table is fresh. */
// The first line is always the same line, so it is not generated: no GPT call,
// no TTS round trip. The player clicks in and the DM is already talking, and the
// warm-up card is already on the table. The model sees the line in its history
// as its own, and picks up from there once the player answers.
export const OPENING_LINE =
  'Before we begin — stand up, loosen out, and let the warm-up card choose your pace. ' +
  'The Ember Crown is burning the marshes from the crypt beneath the Sunken Keep. ' +
  'Take it back before the fire spreads.';
export const OPENING_AUDIO = 'assets/voice/opening.mp3';

export async function openScene() {
  if (chat.messages.length) return;
  chat.messages.push({ role: 'dm', text: OPENING_LINE, t: Date.now() });
  emit('chat');
  // The card the line refers to, through the same tool path the model uses (and
  // the same Agent Log row), so the opening is not a side door either.
  try { await window.arcana.call('start_warmup', {}); } catch { A.offerWarmup({}); }
  await say(OPENING_LINE, { url: OPENING_AUDIO });
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
