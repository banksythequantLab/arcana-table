# 🎲 Arcana Table

**Play D&D with an AI co-DM — and do real push-ups for your natural 20s.**

Arcana Table is a WebMCP-powered virtual tabletop with an **AI Dungeon Master
built in**. Open the URL, type what you do, and the DM answers — narrating,
moving tokens, revealing the dungeon, running combat, and rolling public dice
through structured tools registered on `document.modelContext`. Every call
shows in the on-screen Agent Log, and destructive ones wait for your ✓.

**The DM has no special powers.** It discovers what it can do by calling
`document.modelContext.getTools()` and acts by calling `executeTool()` — the
exact surface an outside ChatGPT or Claude agent uses. So an external agent can
take the co-DM seat too, through the same contract. The page doesn't just claim
its tools are real; the built-in DM is the proof.

And when a roll really matters, the agent can invoke **Heroic Effort**: it stakes
a real exercise against the dice. Ten jumping jacks for +2. Fifteen squats for
advantage. Ten push-ups and your next d20 is a **natural 20**. The agent brings
the dungeon; you bring the muscle.

Built for [The WebMCP Challenge](https://webmcp.devpost.com/) (Devpost, 2026).

## Try it

1. **Just open the live URL — in any modern browser.** The page ships the
   vendored [`@mcp-b/webmcp-polyfill`](https://github.com/WebMCP-org/npm-packages)
   (MIT), so `document.modelContext` and all 17 tools are real even where the
   browser hasn't implemented WebMCP yet. No flags, no setup. Where the browser
   *does* ship WebMCP natively, the native implementation wins and the badge
   says `WebMCP native` instead of `polyfill`.
2. **Just start playing.** The built-in DM opens the scene. Type what you do —
   *"I push the iron door open and listen"* — and it answers on the board.
3. **Or bring your own agent.** In a WebMCP-capable agent browser, point your
   agent at the page: *"You're my co-DM. Read the board, set the scene, and run
   me through this dungeon. Offer Heroic Effort when a roll matters."* It drives
   the identical 17 tools.
4. **Or run it yourself.** The **🎩 DM Panel** tab does everything the tools do,
   by hand — the game never depends on a network call.

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
| `remove_token` | Take a token off the board | ⚠ waits for player approval |
| `start_combat` / `end_combat` | Initiative on/off | **dynamically registers/unregisters** the combat tools |
| `advance_turn` | Next combatant | combat-only |
| `update_hp` | Damage / healing | combat-only · PC damage waits for approval |
| `apply_condition` | poisoned, stunned, blessed… | combat-only |
| `award_loot` | Items + gold | |
| `propose_challenge` | **Heroic Effort**: stake exercise vs. dice reward | resolves when the player finishes or declines |

Design choices worth noting:

- **One action API, two hands on the table.** Tools and UI buttons call the same
  `actions.js` functions — the manual DM panel is proof the agent has no secret powers.
- **Dynamic tool registration, done the spec way.** Combat tools exist only
  while combat runs. Each tool is registered with an `AbortController` —
  `registerTool(def, { signal })` — and unregistered by `controller.abort()`,
  which is how the WebMCP spec removes tools and fires `toolchange` so agents
  refresh. The test suite asserts this against the live registry: `getTools()`
  returns 14, then 17 once combat starts, then 14 again when it ends.
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
| ~15 squats | `advantage` |
| ~15 crunches | `set10` — next d20 lands on 10 |
| ~10 push-ups | `nat20` — the bard will sing of this |

Reps are counted by tap, spacebar, or **out loud** — hands-free mode listens for
your count or a plain "done", because you cannot press a key mid-push-up.

Challenges are always optional, and the DM must call `get_fitness_log` and offer
**only** from `availableExercises` — the pool the player chose in settings.
Bodies differ; a challenge you physically cannot do is not a challenge, it is a
wall. Default pool: push-ups, crunches, jumping jacks, squats.

## The built-in DM

`js/dm.js` is a ~180-line agent loop, and it is deliberately unprivileged:

1. `getTools()` on the live registry → translated into OpenAI function specs.
2. Conversation + tools → `worker/` (a ~120-line Cloudflare Worker) → OpenAI.
   The Worker holds the API key so no key ever reaches a browser; it is
   origin-locked, size-capped, and rate-limited to 40 requests/min per IP.
3. Tool calls come back → executed via `executeTool()` → results fed back →
   loop, up to 6 hops, then the DM speaks.

The DM is prompted to never narrate a roll it didn't actually make, to offer
Heroic Effort only when a roll matters, to read `get_fitness_log` so it varies
muscle groups and eases off, and to accept a denied approval without arguing.

If the Worker is unconfigured or unreachable it returns a friendly message and
the table stays fully playable from the DM panel. See `worker/README.md`.

## Run locally

Static files, no build step:

```bash
npx serve .        # or: python3 -m http.server 8080
```

## Tests

```bash
cd test && npm install && node smoke.mjs
```

44 assertions, Playwright + Chromium. Drives the full tool surface **through the
real `document.modelContext`** — enumerating tools with `getTools()`, invoking
them with `executeTool()`, asserting `readOnlyHint` on the read tools, and
proving the combat toolset registers and unregisters (14 → 17 → 14) — plus the
approval Allow *and* Deny paths and a complete push-ups-to-natural-20 loop.

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
