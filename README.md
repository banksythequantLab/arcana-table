# 🎲 Arcana Table

**Play D&D with an AI co-DM — and do real push-ups for your natural 20s.**

Arcana Table is a WebMCP-powered virtual tabletop with an **AI Dungeon Master
built in**. Open the URL, type what you do, and the DM answers — narrating,
moving tokens, revealing the dungeon, running combat, and rolling public dice
through structured tools registered on `document.modelContext`. Every call
shows in the on-screen Agent Log, and destructive ones wait for your ✓.

**The DM's mind is OpenAI; its hands are WebMCP.** Every turn is an OpenAI
chat completion with function calling, where the functions are this page's live
WebMCP tools translated into OpenAI function specs — and the voice it answers in
is OpenAI TTS. The model does the actual game-mastering: what to spawn, when to
escalate, when to ask for ten push-ups and when to take the dishes instead.

**But it has no special powers.** It discovers what it can do by calling
`document.modelContext.getTools()` and acts by calling `executeTool()` — the
exact surface an outside ChatGPT or Claude agent uses. So an external agent can
take the co-DM seat too, through the same contract. The page doesn't just claim
its tools are real; the built-in DM is the proof.

And when a roll really matters, the agent can stake something real against the
dice. **Heroic Effort** has three shapes and they all pay the same:

- **Reps** — ten jumping jacks for +2, ten push-ups for a natural 20.
- **A hold** — a 30-second plank while the wyrm circles. The clock counts itself.
- **An Oath** — something in the room this app cannot see: clear the sink, twenty
  minutes of study, ten pages of the textbook. The table **locks** for the time
  agreed, the DM waits in silence, and you confirm on your honour when you get
  back. Nothing here can verify it, which is rather the point.

The Oath is not a consolation prize, and the DM is told so in as many words.
Some players cannot do push-ups today. Some are stuck on homework. The table
takes either.

Runs open with an optional **warm-up** — twenty standing stretches, head to
ankle, each with its own cue and a timer that advances itself. 90 seconds, 3, 5,
or 10 minutes. Nothing needs a mat or a floor, and finishing it starts you warm:
+2 on your first roll.

## The run has an ending

A session is not an open sandbox. **The Ember Crown** is a five-beat quest — two
in the Sunken Keep, two in the Whispering Glade, and the Cinder Wight in the
Ember Crypt — and the DM is handed the current objective in every turn's context
and told to drive toward it. Each beat cleared pays a milestone. Clearing the
fifth wins the run.

And you can go down. If a player character hits 0 HP **time stops**: the board
freezes and almost every tool refuses to act, including for the DM. There are
exactly two ways out — a d20 death save, three failures of which ends the run,
or a Heroic Effort, which **always** works. No roll, no chance. In this game
effort is the way out of death, which is the argument the whole project is
making.

Built for [The WebMCP Challenge](https://webmcp.devpost.com/) (Devpost, 2026).

## Try it

1. **Just open the live URL — in any modern browser.** The page ships the
   vendored [`@mcp-b/webmcp-polyfill`](https://github.com/WebMCP-org/npm-packages)
   (MIT), so `document.modelContext` and all 24 tools are real even where the
   browser hasn't implemented WebMCP yet. No flags, no setup. Where the browser
   *does* ship WebMCP natively, the native implementation wins and the badge
   says `WebMCP native` instead of `polyfill`.
2. **Just start playing.** The built-in DM opens the scene. Type what you do —
   *"I push the iron door open and listen"* — and it answers on the board.
3. **Or bring your own agent.** In a WebMCP-capable agent browser, point your
   agent at the page: *"You're my co-DM. Read the board, set the scene, and run
   me through this dungeon. Offer Heroic Effort when a roll matters."* It drives
   the identical 24 tools.
4. **Or run it yourself.** The **🎩 DM Panel** tab is a live inspector for the
   registry: every tool `getTools()` reports, with its schema rendered as a form
   that calls `executeTool()`. Same door the DM uses, same Agent Log. The game
   never depends on a network call.

Console demo (works in any browser — same tool surface, no flag needed):

```js
arcana.tools()                                                    // list the registered tools
await arcana.call('get_board_state')
await arcana.call('narrate', { text: 'A cold wind snuffs your torch…' })
await arcana.call('add_token', { name: 'Snaggle', kind: 'monster', art: 'goblin', x: 11, y: 6, hp: 7 })
await arcana.call('start_combat')
await arcana.call('propose_challenge', { exercise: 'push-ups', reps: 10, reward: 'nat20', reason: 'The dragon rears back!' })
await arcana.call('roll_dice', { formula: 'd20', reason: 'Attack the dragon' })
```

## The WebMCP surface

| Tool | Purpose | Notes |
|---|---|---|
| `get_board_state` | Scene, map grid + legend, tokens, combat, boosts, recent log | `readOnlyHint` |
| `get_character_sheet` | HP/AC/abilities/conditions/inventory | `readOnlyHint` |
| `get_fitness_log` | Reps, exercises, rewards earned, active challenge | `readOnlyHint` — lets the agent pace the workout |
| `roll_dice` | Animated, public dice rolls; Heroic boosts auto-apply | |
| `narrate` | DM voice into the story log | |
| `set_scene` | Swap between 3 battle maps, set title/mood | resets fog |
| `reveal_area` | Clear fog of war | |
| `move_token` | Animated movement, wall-aware | PCs reveal fog as they move |
| `add_token` | Spawn monsters/NPCs/objects | 8 art options |
| `remove_token` | Take a token off the board | ⚠ removing a PC waits for player approval |
| `start_combat` / `end_combat` | Initiative on/off | **dynamically registers/unregisters** the combat tools |
| `advance_turn` | Next combatant | combat-only |
| `update_hp` | Damage / healing | combat-only · PC damage waits for approval |
| `apply_condition` | poisoned, stunned, blessed… | combat-only |
| `award_loot` | Items + gold | |
| `propose_challenge` | **Heroic Effort**: reps or a timed hold vs. a dice reward | resolves when the player finishes or declines |
| `propose_oath` | Stake a real-world task — chores, study, reading | **locks the table** for the minutes agreed |
| `start_warmup` | Guided standing stretches: 90s / 3 / 5 / 10 min | finishing grants +2 next roll |
| `get_quest` | The run: which of the five beats, its objective, what is done | `readOnlyHint` — the DM's destination |
| `advance_quest` | Mark a beat achieved: pays the milestone, swaps the map, spawns the boss | clearing the last beat wins the run |
| `death_save` | Roll for a hero at 0 HP | **only registered while someone is down** |

Design choices worth noting:

- **One action API, two hands on the table.** Tools and UI buttons call the same
  `actions.js` functions — the DM Panel inspector is proof the agent has no secret powers:
  it drives the live registry, so there is no second surface to hide anything in.
- **Dynamic tool registration, done the spec way.** Combat tools exist only
  while combat runs. Each tool is registered with an `AbortController` —
  `registerTool(def, { signal })` — and unregistered by `controller.abort()`,
  which is how the WebMCP spec removes tools and fires `toolchange` so agents
  refresh. The test suite asserts this against the live registry: `getTools()`
  returns 18, then 21 once combat starts, then 18 again when it ends — and 22
  the moment a hero drops, because `death_save` exists only while someone is
  bleeding out.
- **Human-in-the-loop by construction.** Destructive calls (`remove_token`,
  PC damage via `update_hp`) suspend inside `execute()` until the player clicks
  ✓ Allow / ✗ Deny on the board. Denials return structured guidance, not errors.
- **Public dice.** Rolls animate on-screen for both players; earned boosts are
  consumed transparently and logged.
- **Feature detection, no hard dependency.** `document.modelContext ?? navigator.modelContext`,
  reported honestly in the header as `native` / `polyfill` / none, with a
  `window.arcana` shim exposing the identical tool surface for consoles and tests.

## Heroic Effort

| Challenge (agent-scaled) | Reward |
|---|---|
| ~10 jumping jacks | `bonus+2` next roll |
| ~30s plank (a hold) | `bonus+2` |
| ~15 squats | `advantage` |
| 10 min of study (an Oath) | `advantage` |
| ~15 crunches | `set10` — next d20 lands on 10 |
| ~10 push-ups | `nat20` — the bard will sing of this |
| 20 min on the thing you're avoiding (an Oath) | `nat20` |

Reps are counted by tap, spacebar, or **out loud** — hands-free mode listens for
your count or a plain "done", because you cannot press a key mid-push-up. Holds
count themselves down; you are in a plank, not at a keyboard. Oaths run on wall
time and unlock their claim button only when the minutes are actually served.

Challenges are always optional, and the DM must call `get_fitness_log` and offer
**only** from `availableExercises` — the pool the player chose in settings.
Bodies differ; a challenge you physically cannot do is not a challenge, it is a
wall. Default pool: push-ups, crunches, jumping jacks, squats.

## The built-in DM

`js/dm.js` is a ~180-line agent loop, and it is deliberately unprivileged:

1. `getTools()` on the live registry → translated into OpenAI function specs.
2. Conversation + tools → `worker/` (a ~200-line Cloudflare Worker) → **OpenAI**
   (`gpt-5.6-luna`, Chat Completions with function calling). The Worker holds the
   API key so no key ever reaches a browser; it is origin-locked, size-capped,
   and rate-limited to 40 requests/min per IP. The DM's spoken voice is OpenAI
   TTS (`gpt-4o-mini-tts`, *onyx*) through the same Worker.
3. Tool calls come back → executed via `executeTool()` → results fed back →
   loop, up to 6 hops, then the DM speaks.

The DM is prompted to never narrate a roll it didn't actually make, to offer
Heroic Effort only when a roll matters, to read `get_fitness_log` so it varies
muscle groups and eases off, and to accept a denied approval without arguing.

If the Worker is unconfigured or unreachable it returns a friendly message and
the table stays fully playable from the DM panel. See `worker/README.md`.

### Bring your own key

The hosted Worker is rate-limited to 40 req/min per IP. To play without touching
that quota, either use the **🎩 DM Panel** inspector, which runs the whole game with zero
API calls, or point the app at your own Worker:

```bash
cd worker
wrangler secret put OPENAI_API_KEY     # your key, your account
wrangler deploy                        # then set DM_ENDPOINT in js/config.js
```

The model lives in `wrangler.toml` under `[vars] MODEL`, so you can swap the
DM's brain without touching code. You can confirm which model actually answered
— the Worker returns OpenAI's own `model` field, not our config:

```bash
curl -s -X POST https://arcana-dm.dj-b02.workers.dev \
  -H 'content-type: application/json' \
  -H 'origin: https://arcana-table.pages.dev' \
  -d '{"messages":[{"role":"user","content":"Reply with the single word: ready"}],"tools":[]}'
# {"content":"ready","tool_calls":[],"finish_reason":"stop","model":"gpt-5.6-luna"}
```

## Run locally

Static files, no build step:

```bash
npx serve .        # or: python3 -m http.server 8080
```

## Tests

```bash
cd test && npm install && node smoke.mjs
```

93 assertions, Playwright + Chromium. Drives the full tool surface **through the
real `document.modelContext`** — enumerating tools with `getTools()`, invoking
them with `executeTool()`, asserting `readOnlyHint` on the read tools, and
proving the dynamic toolsets register and unregister (16 → 19 → 16, and 20 while
a hero is down) — plus the approval Allow *and* Deny paths, a complete
push-ups-to-natural-20 loop, all three effort modes (reps, a self-counting hold,
and an Oath that locks the board until its clock runs out), the guided warm-up,
a five-beat run walked to victory, and the frozen board that only effort or a
death save can unfreeze.

## Art pipeline

Current tokens/tiles are hand-drawn SVG placeholders in the target style:
**cel-shaded cartoon fantasy — flat colors, chunky dark outlines, single
highlight, big readable silhouettes.** Final art is batch-generated with a
ComfyUI pipeline using prompts like:

> `cel-shaded cartoon fantasy goblin, flat colors, bold dark outline, simple
> shading, chibi proportions, centered, plain background, game token`

Drop PNGs into `assets/tokens/` and map them in `js/art.js`.

## License

MIT — see [LICENSE](LICENSE).
