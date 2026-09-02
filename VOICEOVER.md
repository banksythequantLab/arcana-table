# Arcana Table — demo video voice-over

Two voices, deliberately:

- **DEREK (cloned via FreeClone/VoxCPM2)** — the narration. Your pitch, your voice.
- **THE DM (OpenAI TTS, "onyx", live from the app)** — heard diegetically, coming
  out of the product itself. Do not re-record these; they are captured from the
  running app so judges hear the real thing.

Total target: **2:45**. Devpost caps at 3:00.

---

## VO-01 · The problem — 0:00–0:18

> Fifty million people play tabletop RPGs. Almost none of them want to be the
> Dungeon Master. And nobody — nobody — wants to do burpees alone.
>
> So I built a table where an AI runs the game… and your body rolls the dice.

*On screen: cold open on the board, torchlight, tokens. No UI chrome yet.*

---

## VO-02 · What it is — 0:18–0:40

> This is Arcana Table. It's a web page. You open it, and a Dungeon Master is
> already there, waiting. No install, no plugin, no flag to enable — just a URL.
>
> I talk to it. It talks back. And everything it says, it makes true on the board
> in front of me.

*On screen: type/speak a turn, DM replies, tokens move, fog lifts.*
*Let one DM line play out loud in the clear — that's the product's own voice.*

---

## VO-03 · The WebMCP part — 0:40–1:10

> Here's the part I care about. That Dungeon Master has no back door.
>
> The page publishes seventeen tools through WebMCP — `document.modelContext`.
> The DM finds out what it can do by calling `getTools`, and it acts by calling
> `executeTool`. Exactly the same contract your own agent would use from outside.
>
> So this isn't a demo *claiming* its tool surface is real. It hands an agent the
> seat and lets you watch. Every call it makes scrolls right there in the log.

*On screen: Agent Log filling with get_board_state, add_token, roll_dice.*
*Cut to console: `await document.modelContext.getTools()` → 14 … then 17 in combat.*

---

## VO-04 · Heroic Effort — 1:10–2:00

> And when a roll really matters, the DM can stake something the dice can't give it.

*Beat. Let the DM's own voice carry the offer — do not talk over it:*
> **[DM, live audio]** *"The Sentinel braces for your charge. Ten squats will turn
> your steel and resolve into a fierce edge — but you may decline and trust the dice."*

> Ten squats. For a plus five.
>
> My hands are on the floor, so I'm not typing — I just count out loud, and the
> table hears me.

*On screen: YOU doing the reps on camera, counting aloud. Ring fills to the count.*

> **[after the reps]** Nineteen, plus five. Twenty-four.

*On screen: dice tray — d20 [19] +5⚡ = 24 — then the damage landing.*

> The agent brought the dungeon. I brought the muscle.

---

## VO-05 · Under the hood — 2:00–2:25

> Combat tools only exist while combat is running — registered with an
> AbortController, dropped when the fight ends, exactly the way the spec says to.
> Damage to my character waits for my approval. The dice roll in the open where I
> can see them.
>
> One action layer. The agent and my own mouse call the same functions. It has no
> powers I don't.

*On screen: the approval toast; the tool table in the README.*

---

## VO-06 · Close — 2:25–2:45

> Agents shouldn't just fill in our forms. WebMCP lets them sit down at the table
> with us — and lets us bring the one thing they never will.
>
> Arcana Table. Roll with your whole self.

*On screen: logo, live URL, github link. Hold.*

---

## Recording notes

- Read VO-01 slower than feels natural; it's the hook.
- VO-04 is the one that wins the round. Don't perform the reps — actually do them,
  and let yourself be out of breath on "nineteen, plus five." The breathlessness
  IS the pitch.
- Leave 0.5s of clean air at the head and tail of each take; makes the mux easy.
- Record dry and close-mic'd. FreeClone clones the timbre, not the room.
