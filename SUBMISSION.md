# Devpost submission — Arcana Table

*(Paste-ready. Trim to taste. Deadline: Thu Sep 3, 1:00 PM PDT.)*

## Tagline (one line)

Play D&D with an AI co-DM — and do real push-ups for your natural 20s.

## Inspiration

Two problems nobody has solved: everyone wants to play tabletop RPGs but nobody
wants to run them, and everyone wants to exercise but the couch is winning.
WebMCP let us fuse them: an agent that improvises the dungeon, and a mechanic
where the dice reward real, physical effort. The agent brings the dungeon; you
bring the muscle.

## What it does

Arcana Table is a virtual tabletop that any WebMCP-capable agent can co-run.
Open the live URL, tell your agent "you're my co-DM," and it starts playing —
narrating scenes, moving tokens across a cel-shaded battle map, revealing fog
of war, spawning monsters, running initiative, and rolling dice in the open.

Its signature system is **Heroic Effort**: before a roll that matters, the
agent can stake a real exercise against the dice. Ten jumping jacks for +2.
Fifteen squats for advantage. Five burpees and your next d20 is a guaranteed
**natural 20**. Challenges are always optional, the reps are counted on a big
tap/spacebar ring with a timer, and the reward applies automatically to your
next roll — publicly, in the on-screen dice tray.

## How WebMCP powers it

- **17 tools** registered through `document.modelContext` / `navigator.modelContext`
  — reads (`get_board_state`, `get_character_sheet`, `get_fitness_log`, all
  `readOnlyHint: true`), board actions (`move_token`, `add_token`, `reveal_area`,
  `set_scene`), game flow (`roll_dice`, `narrate`, `start_combat`, `award_loot`)
  and the Heroic Effort pair (`propose_challenge`, `resolve_challenge`).
- **Dynamic registration:** combat tools (`advance_turn`, `update_hp`,
  `apply_condition`) exist only while combat runs — registered on
  `start_combat`, unregistered on `end_combat`. The agent's toolset always
  mirrors the game state.
- **Human-in-the-loop by construction:** destructive calls (removing a token,
  damaging a player character) suspend inside `execute()` until the player
  clicks ✓ Allow / ✗ Deny on the board. Denials return structured guidance
  ("respect it and narrate around it"), not errors.
- **Agent as workout coach through a read tool:** `get_fitness_log` exposes
  reps per exercise and pace, and the tool descriptions instruct the agent to
  vary muscle groups and scale stakes to the fiction — pacing logic lives in
  the protocol surface itself.
- **Everything is visible:** every tool call streams into an on-screen Agent
  Log, and dice rolls animate publicly. No hidden agent actions, no fudged rolls.
- **One action API, two hands on the table:** WebMCP tools and the manual DM
  panel call the same action layer, so the app is fully playable with no agent
  at all — and the agent provably has no powers a human doesn't.

## How we built it

Vanilla JS single-page app, zero build step, zero backend — a canvas-rendered
grid board (3 maps, fog of war, drag-and-drop tokens), state in localStorage,
cel-shaded cartoon art. Feature detection keeps it working in any browser, and
a `window.arcana` console shim exposes the identical tool surface for demos
and tests. A 28-assertion Playwright suite drives every tool headlessly —
including the approval and denial paths and a full burpees-to-nat-20 loop.

## Challenges we ran into

Making agent power feel safe and fun at a game table: the answer was approval
gates on destructive calls, public dice, and the visible Agent Log. Also a
classic: a CSS class collision (`.challenge`) that made the story log eat the
screen — caught by screenshot testing.

## Accomplishments we're proud of

A stranger with a WebMCP browser can play a real 10-minute dungeon with zero
instructions — and the moment the agent offers burpees for a natural 20, every
playtester stood up.

## What's next

Webcam rep counting (MediaPipe Pose, fully client-side), voice narration,
multiplayer parties, and AI-generated campaign art from our ComfyUI pipeline.

---

# Demo video script (< 3:00, with audio)

**0:00–0:20 — The problem.** Face to camera: "Fifty million people want to
play D&D. Almost none of them want to be the Dungeon Master. And nobody —
nobody — wants to do burpees alone. Arcana Table fixes both."

**0:20–0:40 — Meet the table.** Screen: the board. "This is a virtual tabletop
that speaks WebMCP. Seventeen tools, registered right in the browser. Watch
what happens when I tell my agent it's my co-DM." Show the agent badge +
Agent Log.

**0:40–1:50 — Live play (the core).** Agent narrates, reveals the crypt,
spawns a dragon, starts combat (call out: "combat tools just registered —
they only exist during combat"). Agent tries to damage your character →
approval toast appears → click ✓. "Every dangerous move waits for my
permission." Then the money shot: agent calls propose_challenge — "The dragon
rears back… five burpees, and your next strike is a natural twenty."
**Do the burpees on camera.** Tap the ring, complete it, roll — NAT 20
animation, sparks. React honestly.

**1:50–2:20 — Under the hood.** Quick code peek: registerTool call,
readOnlyHint, the dynamic combat registration, the approval gate in execute().
"One action API — the agent and my mouse call the same functions. It has no
powers I don't."

**2:20–2:50 — Why it matters.** "Agents shouldn't just fill forms. WebMCP
lets them sit at the table with us — and lets us bring the one thing they
can't: a body. The agent brings the dungeon. You bring the muscle."

**2:50–3:00 — Close.** Logo, live URL, GitHub. "Arcana Table. Roll with your
whole self."

**Recording checklist:** OBS at 1080p, mic on, browser at 100% zoom, fresh
table state, agent prompt pre-typed, warm up before the burpees take.
