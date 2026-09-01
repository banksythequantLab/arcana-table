# Arcana Table

Play D&D with an AI co-DM — and do real push-ups for your natural 20s.

**The agent brings the dungeon. You bring the muscle.**

Arcana Table is a virtual tabletop for the WebMCP Challenge: an agent narrates, moves tokens, reveals fog, spawns monsters, runs initiative, and rolls public dice. You can optionally stake real exercise against the next roll (Heroic Effort). The game is fully playable from the DM panel even when WebMCP is not present.

## Why WebMCP

Agents should not scrape the DOM of a battle map. WebMCP lets this page publish a real contract: named tools, JSON Schema inputs, and an Allow/Deny gate for destructive moves. People and agents sit at the same table. The agent is a co-DM. You still own the body in the chair — the dice, the reps, the veto.

## How it is implemented

- React 19 + TypeScript + Vite SPA. No custom backend. State lives in memory and localStorage.
- One action layer in src/game/actions.ts is called by both the DM panel and every WebMCP tool. Tools never fork game rules.
- useWebMCP from the usewebmcp package registers tools on document.modelContext.registerTool (navigator.modelContext remains a fallback).
- Feature detection: document.modelContext ?? navigator.modelContext. Native vs polyfill vs missing drives the badge. Missing WebMCP still plays via the DM panel, with a hint to enable chrome://flags/#enable-webmcp-testing or open in the ChatGPT in-app browser.
- initializeWebMCPPolyfill from @mcp-b/webmcp-polyfill is called so tools exist in Playwright and in browsers without the flag. The badge still reports native vs polyfill.
- JSON Schema input schemas. Read tools set annotations.readOnlyHint.
- Dynamic combat tools: advance_turn, update_hp, and apply_condition pass enabled=combatActive to useWebMCP, so they register only while initiative is running.
- Approval gates: remove_token and damaging player HP pause on Allow/Deny UI. Deny returns structured guidance (not an exception) so the agent can continue.
- Agent Log streams every tool call. Public rolls animate in the dice tray. Natural 20s spark.

## The 17 tools

Reads (readOnlyHint): get_board_state, get_character_sheet, get_fitness_log

Board: move_token, add_token, remove_token, reveal_area, set_scene

Flow: roll_dice, narrate, start_combat, award_loot

Heroic Effort: propose_challenge, resolve_challenge

Combat-only: advance_turn, update_hp, apply_condition

Heroic Effort (optional): 10 jumping jacks = +2, 15 squats = advantage, 5 burpees = guaranteed natural 20. Big tap / Spacebar ring plus timer. Reward auto-applies to the next roll in the dice tray.

First load is a ready 10-minute crypt: one fighter (Rowan Emberstride) with a 5e-ish sheet, fogged rooms, and an ember wyrm that can spawn. Scenes: village, crypt, dragon-lair.

Original cel-shaded cartoon art (SVG/CSS only). No Wizards of the Coast trademarks.

## Run locally

Requirements: Node 20+.

    npm install
    npm run dev

Open http://127.0.0.1:5173

Scripts: dev, build, preview, test.

    npm run build
    npm test

## Test with an agent

### ChatGPT in-app browser

Open the deployed or tunneled URL inside ChatGPT. The page registers tools on document.modelContext. Paste the co-DM prompt below and ask it to run the crypt.

### Chrome 149+ flag

1. Visit chrome://flags/#enable-webmcp-testing and enable it.
2. Relaunch Chrome.
3. Open the table. The badge should read WebMCP connected when native.
4. Point a WebMCP-capable agent at the page.

## Copy-paste co-DM prompt

You are the co-DM for Arcana Table, a virtual tabletop. Use the page tools instead of guessing the DOM.

Start in the crypt (ten-minute dungeon). Read get_board_state and get_character_sheet first. Narrate in short, punchy scenes. Reveal fog as the hero advances. You may spawn an Ember Wyrm with add_token (kind dragon) or switch to dragon-lair with set_scene.

Roll in public with roll_dice. Combat: start_combat, then use advance_turn / update_hp / apply_condition (those three exist only while combat runs).

Destructive tools (remove_token, damaging the hero HP) wait for the player to Allow or Deny. If denied, you receive guidance — do not treat it as a crash. Offer optional Heroic Effort: propose_challenge with jumping-jacks, squats, or burpees. Never demand exercise. Award loot when it is earned.

## License

MIT. See LICENSE.

## What is next (not in v1)

These are explicitly out of scope for this build:

- MediaPipe pose detection so reps count from a webcam
- Voice in / voice out for the co-DM
- Multiplayer / shared table sessions
