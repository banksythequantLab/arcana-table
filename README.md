# 🎲 Arcana Table

**Play D&D with an AI co-DM — and do real push-ups for your natural 20s.**

Arcana Table is a WebMCP-powered virtual tabletop. Open it in a WebMCP-enabled
browser and your AI agent pulls up a chair as co-Dungeon-Master: it narrates,
moves tokens, reveals the dungeon, runs combat, and rolls dice — through
structured tools registered with `navigator.modelContext` / `document.modelContext`,
with every call visible in the on-screen Agent Log and sensitive calls gated
behind player approval.

And when a roll really matters, the agent can invoke **Heroic Effort**: it stakes
a real exercise against the dice. Ten jumping jacks for +2. Fifteen squats for
advantage. Five burpees and your next d20 is a **natural 20**. The agent brings
the dungeon; you bring the muscle.

Built for [The WebMCP Challenge](https://webmcp.devpost.com/) (Devpost, 2026).

## Try it

1. Open the live URL in a WebMCP-enabled browser:
   - **Chrome 146+**: enable `chrome://flags/#enable-webmcp-for-testing` (or use a build with WebMCP on), or
   - **ChatGPT's browser** with WebMCP support.
2. Ask your agent something like:
   > "You're my co-DM. Look at the board, set the scene, and run me through this dungeon. Offer me Heroic Effort challenges when rolls matter."
3. No agent? Everything works by hand from the **🎩 DM Panel** tab.

Console demo (works in any browser — same tool surface, no flag needed):

```js
arcana.tools()                                                    // list the registered tools
await arcana.call('get_board_state')
await arcana.call('narrate', { text: 'A cold wind snuffs your torch…' })
await arcana.call('add_token', { name: 'Snaggle', kind: 'monster', art: 'goblin', x: 11, y: 6, hp: 7 })
await arcana.call('start_combat')
await arcana.call('propose_challenge', { exercise: 'burpees', reps: 5, reward: 'nat20', reason: 'The dragon rears back!' })
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
- **Dynamic tool registration.** Combat tools exist only while combat runs
  (`registerTool`/`unregisterTool` on state change), keeping the agent's toolset
  matched to the game state.
- **Human-in-the-loop by construction.** Destructive calls (`remove_token`,
  PC damage via `update_hp`) suspend inside `execute()` until the player clicks
  ✓ Allow / ✗ Deny on the board. Denials return structured guidance, not errors.
- **Public dice.** Rolls animate on-screen for both players; earned boosts are
  consumed transparently and logged.
- **Feature detection, no hard dependency.** `document.modelContext ?? navigator.modelContext`,
  with a `window.arcana` shim exposing the identical tool surface for consoles and tests.

## Heroic Effort

| Challenge (agent-scaled) | Reward |
|---|---|
| ~10 jumping jacks | `bonus+2` next roll |
| ~15 squats | `advantage` |
| ~10 push-ups | `set10` — next d20 lands on 10 |
| ~20 push-ups or 5 burpees | `nat20` — the bard will sing of this |

Reps are counted by tap/spacebar (honor system, works everywhere). Challenges
are always optional, and the agent is instructed via tool descriptions to scale
stakes to the fiction and read `get_fitness_log` to vary muscle groups.

## Run locally

Static files, no build step:

```bash
npx serve .        # or: python3 -m http.server 8080
```

## Tests

```bash
cd test && npm install && node smoke.mjs
```

Drives the full tool surface headlessly through the `window.arcana` shim
(Playwright + bundled Chromium) and screenshots the board.

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
