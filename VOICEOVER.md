# Arcana Table — demo video voice-over

Two voices, deliberately:

- **DEREK (cloned via FreeClone/VoxCPM2)** — the narration. Your pitch, your voice.
- **THE DM (OpenAI TTS, "onyx", live from the app)** — heard diegetically, coming
  out of the product itself. Do not re-record these; they are captured from the
  running app so judges hear the real thing.

Runtime: **2:56**. Devpost caps at 3:00. Silence appears only under the
five title cards (11s of 176) — everywhere else Derek is talking.

---

## VO-01 · The problem — 0:00–0:18

> Fifty million people play tabletop RPGs. Almost none of them want to be the
> Dungeon Master. And nobody — nobody — wants to do push-ups alone.
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
> **[DM, live audio]** *"The Sentinel braces for your charge. Ten push-ups will turn
> your steel and resolve into a fierce edge — but you may decline and trust the dice."*

> Ten push-ups. For a guaranteed twenty.
>
> My hands are on the floor, so I'm not typing — I just count out loud, and the
> table hears me.

*On screen: YOU doing the reps on camera, counting aloud. Ring fills to the count.*

> **[after the reps]** Natural twenty.

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
  and let yourself be out of breath on "natural twenty." The breathlessness IS the
  pitch. Ten push-ups, not burpees — the demo should be something you can finish
  cleanly on camera and still speak afterwards.
- Leave 0.5s of clean air at the head and tail of each take; makes the mux easy.
- Record dry and close-mic'd. FreeClone clones the timbre, not the room.


---

## VO-07 · Swapping goals for muscle — over the push-up footage

> Now, not everyone can drop and give me ten. Some days your shoulder is shot.
> And some days the thing standing between you and the boss fight isn't a boss
> fight. It's a sink full of dishes.

*On screen: Derek's own push-up footage, then back to the board.*
*This is the line that footage was always for.*

---

## VO-08 · The Oath

> So the table takes that too. Swear an Oath. Ten minutes on the thing you have
> been avoiding. The board locks, the Dungeon Master waits, and you come back to
> the exact same natural twenty.

*On screen: the Oath card — "clear the sink full of dishes" — sworn, then the
locked table with the clock running.*

---

## VO-09 · Micro-bursts

> Which is better than either one. You are not doing chores any more. You are
> spending five minutes to buy a dice roll. Clean the house in micro bursts
> between fights, and by the time the Crown is yours, the kitchen is done too.
> Swap goals for muscle, or muscle for goals. The table only asks that you spend
> something real.

*On screen: back in play after the Oath — combat resumes, the quest rail advances.*

---

All three cloned on the house stack: FreeClone + VoxCPM2 on Johnson:8300,
`POST /api/clone` with `derek-voice.wav` as the reference. Regenerate with
`D:\arcana-vo\gen.py`.


---

## VO-10 · Whose mind it is — after the WebMCP section

> And the mind behind that Dungeon Master is OpenAI. Every turn goes to GPT
> through a small Cloudflare Worker that holds the key, so it never touches
> your browser.

*On screen: the "The DM runs on OpenAI" card, then the agent log filling with
tool calls — including the DM hitting a wall and picking another cell.*
