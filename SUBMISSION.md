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

The build started as a board that *exposed* tools and expected you to bring
your own agent — and it was lifeless. You opened it and clicked buttons at
yourself. Putting a real DM in the seat, reachable through the same tools an
external agent would use, is what turned a protocol demo into a game.

## What it does

Arcana Table is a virtual tabletop with an AI Dungeon Master built in. Open the
live URL and you are playing in about four seconds: the DM sets the scene, you
type what you do, and it answers — narrating, moving tokens across a cel-shaded
battle map, lifting fog of war, spawning monsters, running initiative, and
rolling dice in the open where you can see them.

The DM is not privileged. It finds out what it can do by calling
`document.modelContext.getTools()` and acts by calling `executeTool()` — the
same public surface an outside ChatGPT or Claude agent uses, so an external
agent can take the co-DM seat through the identical contract. That is the
demonstration: the page doesn't assert its tool surface is real, it hands the
seat to an agent and lets you watch.

Its signature system is **Heroic Effort**: before a roll that matters, the
agent can stake a real exercise against the dice. Ten jumping jacks for +2.
Fifteen squats for advantage. Ten push-ups and your next d20 is a guaranteed
**natural 20**. Challenges are always optional, the reps are counted on a big
tap/spacebar ring with a timer, and the reward applies automatically to your
next roll — publicly, in the on-screen dice tray.

## How WebMCP powers it

- **The built-in DM is a WebMCP client, not a shortcut.** `js/dm.js` reads the
  live registry with `getTools()`, translates it to function specs, and invokes
  everything through `executeTool()`. It cannot touch game state any other way.
  A ~120-line Cloudflare Worker holds the API key so none reaches a browser —
  origin-locked, size-capped, 40 req/min per IP.

- **21 tools** registered through `document.modelContext` / `navigator.modelContext`
  (18 always on, 3 more while combat runs, 1 more while a hero is bleeding out)
  — reads (`get_board_state`, `get_character_sheet`, `get_fitness_log`, all
  `readOnlyHint: true`), board actions (`move_token`, `add_token`, `reveal_area`,
  `set_scene`), game flow (`roll_dice`, `narrate`, `start_combat`, `award_loot`)
  and the Heroic Effort pair (`propose_challenge`, `resolve_challenge`).
- **Dynamic registration, the way the spec prescribes:** combat tools
  (`advance_turn`, `update_hp`, `apply_condition`) exist only while combat runs.
  Every tool is registered with an `AbortController` — `registerTool(def,
  { signal })` — and removed by `controller.abort()`, which fires `toolchange`
  so agents refresh. Our tests assert it against the live registry: `getTools()`
  returns 14, 17 during combat, 14 after.
- **No flag, no setup, for anyone:** the page vendors the MIT
  `@mcp-b/webmcp-polyfill`, so `document.modelContext` and all 21 tools are real
  in any modern browser. Judges just open the URL. Where WebMCP ships natively,
  that implementation wins and the badge honestly reads `native` vs `polyfill`.
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
cel-shaded cartoon art. A 44-assertion Playwright suite drives the tools
through the real `document.modelContext` — `getTools()`, `executeTool()`,
`readOnlyHint` on reads, the registry growing and shrinking with combat, both
approval outcomes, and a full push-ups-to-natural-20 loop.

## Challenges we ran into

Making agent power feel safe and fun at a game table: the answer was approval
gates on destructive calls, public dice, and the visible Agent Log. Also a
classic: a CSS class collision (`.challenge`) that made the story log eat the
screen — caught by screenshot testing.

## Accomplishments we're proud of

A stranger with a WebMCP browser can play a real 10-minute dungeon with zero
instructions — and the moment the agent offers push-ups for a natural 20, every
playtester stood up.

## What's next

Webcam rep counting (MediaPipe Pose, fully client-side), voice narration,
multiplayer parties, and AI-generated campaign art from our ComfyUI pipeline.

---

# Demo video script (< 3:00, with audio)

**0:00–0:20 — The problem.** Face to camera: "Fifty million people want to
play D&D. Almost none of them want to be the Dungeon Master. And nobody —
nobody — wants to do push-ups alone. Arcana Table fixes both."

**0:20–0:40 — Meet the table.** Screen: the board, DM already speaking. "No
setup, no flag — just this URL, and a Dungeon Master already running the game."
Type a line, let it answer and move a token. "Seventeen tools, registered right
in the browser. And that DM has no back door — it's calling the same
`document.modelContext` your agent would." Point at the Agent Log lighting up.

**0:40–1:50 — Live play (the core).** Agent narrates, reveals the crypt,
spawns a dragon, starts combat (call out: "combat tools just registered —
they only exist during combat"). Agent tries to damage your character →
approval toast appears → click ✓. "Every dangerous move waits for my
permission." Then the money shot: agent calls propose_challenge — "The dragon
rears back… ten push-ups, and your next strike is a natural twenty."
**Do the push-ups on camera.** Tap the ring, complete it, roll — NAT 20
animation, sparks. React honestly.

**1:50–2:20 — Under the hood.** Quick code peek: the `registerTool(def,
{ signal })` call, `readOnlyHint`, `controller.abort()` removing the combat
tools, the approval gate inside `execute()`. Show `await
document.modelContext.getTools()` in the console returning 14, then 17 mid-
combat, then 14 again. "One action API — the agent and my mouse call the same
functions. It has no powers I don't."

**2:20–2:50 — Why it matters.** "Agents shouldn't just fill forms. WebMCP
lets them sit at the table with us — and lets us bring the one thing they
can't: a body. The agent brings the dungeon. You bring the muscle."

**2:50–3:00 — Close.** Logo, live URL, GitHub. "Arcana Table. Roll with your
whole self."

**Recording checklist:** OBS at 1080p, mic on, browser at 100% zoom, fresh
table state, agent prompt pre-typed, warm up before the push-ups take.
