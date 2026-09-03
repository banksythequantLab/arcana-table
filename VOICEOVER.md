# Arcana Table — demo video voice-over

**This is the shooting script as actually spoken in the submitted video.**
Runtime **2:39** (second cut, `media/arcana-table-demo-v2.mp4`). Devpost caps at 3:00.

**Second cut, Sep 3.** Same narration audio, new picture and mix: the DM's own
TTS voice is now in the video at the seconds its lines appeared on screen, the
narration runs under the title cards instead of silence, and every footage
offset is derived from event marks recorded with the bed (`test/record2.mjs`,
`test/assemble2.py`). The DM speaks alone twice — its opening line over the
warm-up before the narration begins, and "the dishes are cleared, and the oath
answers" over the Oath being kept. **VO-09 (micro-bursts) is cut**, and VO-05 is
trimmed at the pause after the tool names: the last third of the narration was
the wordiest, and it rambled. The "twenty one tools" line is now accurate again by
coincidence: 21 is the number registered at rest (25 in total).

Two voices, deliberately:

- **DEREK** — the narration, in his own voice and with his consent: he is the
  sole author of this project and the speaker in the reference recording. Cloned
  on our own GPU stack (FreeClone + VoxCPM2 on Johnson, `POST /api/clone` with
  `derek-voice.wav` as the reference). Regenerate with `D:\arcana-vo\gen.py` /
  `gen2.py` / `gen3.py`. No other person's voice appears in the video.
- **THE DM** — OpenAI TTS (`gpt-4o-mini-tts`, voice *fable*), heard diegetically,
  coming out of the running product. Never re-recorded; it is captured live.

Silence appears only under the title cards. Everything else is narrated.

---

## 1 · Title card *(2s, silent)*

> **Arcana Table**
> Play D&D with an AI co-DM — and do real push-ups for your natural 20s.

---

## 2 · VO-01 — The problem  ·  16.7s

> Fifty million people play tabletop RPGs. Almost none of them want to be the
> Dungeon Master. And nobody — nobody — wants to do push-ups alone.
>
> So I built a table where an AI runs the game… and your body rolls the dice.

## 3 · VO-02 — What it is  ·  17.8s

> This is Arcana Table. It's a web page. You open it, and a Dungeon Master is
> already there, waiting. No install, no plugin, no flag to enable — just a URL.
>
> I talk to it. It talks back. And everything it says, it makes true on the board
> in front of me.

*On screen for 2 and 3: the quest rail, the DM's opening beat, the player typing,
and the guided warm-up running.*

---

## 4 · Title card — "How it works" *(4.5s, silent)*

> **HOW IT WORKS**
> **24 tools on `document.modelContext`**
> The built-in DM calls `getTools()` and `executeTool()` — the same contract your
> agent would use.

## 5 · VO-03a — No back door  ·  9.5s

> **Note on the tool count.** The recorded audio says "twenty one tools", which
> was true when it was cut. The build now registers **24** (20 base + 3 combat +
> `death_save`), because `move_party` and the reach-enforcing `attack` were both
> added after playtests. The video therefore under-claims by three, which is the
> harmless direction. Do not edit the spoken
> lines below to say 23 unless the audio is re-cut — this file is the transcript
> of what was actually recorded.


> Here's the part I care about. That Dungeon Master has no back door. The page
> publishes twenty one tools through WebMCP, on document dot modelContext.

## 6 · VO-03b — The contract  ·  15.9s

> The DM finds out what it can do by calling getTools, and it acts by calling
> executeTool. That is the whole interface. It is exactly the same contract your
> own agent would use from outside, so an outside agent can take the co-DM seat
> through the identical two calls.

## 7 · VO-03c — Watch it  ·  8.4s

> So this isn't a demo claiming its tool surface is real. It hands an agent the
> seat and lets you watch. Every call it makes scrolls right there in the log.

*On screen for 5–7: an animated architecture model, drawn beat by beat —*
*You → the page → `document.modelContext` (all 21 tool names, with the combat and*
*downed tools in their own colours) → the board. Then the built-in DM (OpenAI GPT)*
*and an external agent (ChatGPT / Claude) wiring into the SAME registry through*
*the same two labelled arrows, with a pulse travelling the `executeTool()` wire*
*into the board. Closing line on the card: "The DM has no back door — if you can*
*watch the log, you can see everything it is allowed to do."*

---

## 8 · Title card — Heroic Effort *(2s, silent)*

> **THE SIGNATURE MOVE**
> **Heroic Effort**
> 10 jumping jacks → +2 · 15 squats → advantage · 10 push-ups → a natural 20

## 9 · VO-04 — Heroic Effort  ·  13.5s

> And when a roll really matters, the DM can stake something the dice can't give
> it. Ten push-ups. For a guaranteed twenty.
>
> My hands are on the floor, so I'm not typing — I just count out loud, and the
> table hears me.

*On screen: the DM's live offer, the rep ring filling.*

## 10 · VO-07 — Swapping goals for muscle  ·  11.3s

> Now, not everyone can drop and give me ten. Some days your shoulder is shot.
> And some days the thing standing between you and the boss fight isn't a boss
> fight. It's a sink full of dishes.

*On screen: Derek's own push-up footage, under a lower third reading*
*"💪 HEROIC EFFORT · NOT A CUTSCENE / 10 push-ups. / The table waits. Finish them*
*and the next d20 is a natural 20." with a NAT 20 PENDING badge.*

## 11 · VO-04b — The payoff  ·  7.4s

> Natural twenty. The agent brought the dungeon. I brought the muscle.

*On screen: the d20 landing gold — a drawn icosahedron, shockwave, spark burst.*

---

## 12 · Title card — the other way to pay *(2s, silent)*

> **THE OTHER WAY TO PAY**
> **Can't do push-ups today?**
> Swear an Oath instead — the dishes, ten pages, twenty minutes of study. The
> table locks until you're back, and it pays exactly the same.

## 13 · VO-08 — The Oath  ·  10.6s

> So the table takes that too. Swear an Oath. Ten minutes on the thing you have
> been avoiding. The board locks, the Dungeon Master waits, and you come back to
> the exact same natural twenty.

*On screen: the DM offering "clear the sink full of dishes — 10 min → NATURAL 20",*
*sworn, then the locked table with the clock running and the honour line:*
*"On your honour. Nothing here can check, which is rather the point."*

## 14 · VO-09 — Micro-bursts  ·  18.8s

> Which is better than either one. You are not doing chores any more. You are
> spending five minutes to buy a dice roll. Clean the house in micro bursts
> between fights, and by the time the Crown is yours, the kitchen is done too.
> Swap goals for muscle, or muscle for goals. The table only asks that you spend
> something real.

*On screen: the Oath clock running out, the reward banked, play resuming.*

---

## 15 · VO-10 — Whose mind it is  ·  9.4s

> And the mind behind that Dungeon Master is OpenAI. Every turn goes to GPT
> through a small Cloudflare Worker that holds the key, so it never touches your
> browser.

*On screen: back to the architecture model, resting on the OpenAI and Cloudflare
Worker boxes.*

## 16 · VO-05 — Under the hood  ·  20.7s

> Every one of those moves is a real tool call. Watch the log: `add_token`,
> `roll_dice`, `update_hp`, `advance_quest`. The registry itself changes shape as
> you play — combat starts and three more tools register; a hero drops and
> `death_save` appears, then aborts away when they get back up. That's the WebMCP
> spec's own `AbortController` pattern, not a trick.

*On screen: the Agent Log filling, the tool count climbing 18 → 21 → 22, including
the DM hitting a wall and picking another cell.*

---

## 17 · Closing card  ·  VO-06, 10.5s

> Arcana Table. An AI Dungeon Master with no special powers, twenty one WebMCP
> tools, and a mechanic that only pays if you actually get up.
>
> Roll with your whole self.

> **Roll with your whole self.**
> arcana-table.pages.dev · github.com/banksythequantLab/arcana-table
