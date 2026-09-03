# Arcana Table: RPG with an AI DM — do push-ups for natural 20s

*Paste-ready for the Devpost form, one section per header. Trim to taste.*

**Tagline:** Play D&D with an AI Dungeon Master built in — and do real push-ups for your natural 20s.

---

## Inspiration

Two problems nobody has solved: everyone wants to play tabletop RPGs but nobody wants to run them, and everyone wants to exercise but the couch is winning. WebMCP let us fuse them — an agent that improvises the dungeon, and a mechanic where the dice reward real, physical effort. The agent brings the dungeon; you bring the muscle.

The build started as a board that *exposed* tools and expected you to bring your own agent, and it was lifeless: you opened it and clicked buttons at yourself. Putting a real Dungeon Master in the seat — reachable through the same WebMCP tools an external agent would use — is what turned a protocol demo into a game. The page doesn't just claim its tool surface is real; the built-in DM is the proof.

## What it does

Open the URL and you're playing in about four seconds. An AI Dungeon Master (OpenAI, function calling, its own OpenAI TTS voice) sets the scene; you say or type what you do; it answers on a cel-shaded battle map — narrating, moving tokens, lifting fog of war, spawning monsters, running initiative, rolling dice in the open. Click the map and the party walks there. A five-beat quest, *The Ember Crown*, gives the session a destination and an ending: each beat cleared levels the party and pays loot, a banked boon, and a full rest; the fifth ends with the Cinder Wight.

The signature system is **Heroic Effort**. Before a roll that matters, the DM stakes something real against the dice, and it comes in four shapes that all pay off the same price ladder: **reps** (ten push-ups for +5, twenty-five for a natural 20, counted on a tap ring or out loud in hands-free mode); **a timed hold** (a thirty-second plank, the ring counts itself down); **a task list** (three small asks on one card — tick off what you did, all three is +6, two of three is +4); or **an Oath** — something real in the room the page cannot see: clear the sink, twenty minutes of study, the email you're dodging. The table locks for the minutes agreed and you confirm on your honour when you're back. The Oath pays exactly the same as push-ups, and the player picks which currency the table may charge in — **Anything · Reps · Holds · Oaths only** — so the whole game is playable with no physical capability at all.

If a hero hits 0 HP, time stops. The board freezes, almost every tool refuses to act — the DM's included — and there are two ways out: a d20 death save, or a completed Heroic Effort, which *always* works. In this game, effort is the way out of death. That's the argument the whole project makes.

## How we built it

Vanilla JavaScript, zero build step, a canvas-rendered board, state in localStorage, and one ~200-line Cloudflare Worker that holds the OpenAI key so none ever reaches a browser (origin-locked, size-capped, rate-limited per IP). The page vendors the MIT `@mcp-b/webmcp-polyfill`, so `document.modelContext` is real in any modern browser — no flag, no setup — and where a browser ships WebMCP natively, that wins and the badge says so.

**25 tools** are registered through `document.modelContext`: 21 always on, 3 more while combat runs (`advance_turn`, `update_hp`, `apply_condition`), and `death_save` only while a hero is bleeding out. Dynamic registration is done the way the spec prescribes — every tool carries an `AbortController`, and `controller.abort()` removes it and fires `toolchange`. Reads carry `readOnlyHint`. Destructive calls (removing a token, damaging a player character) suspend inside `execute()` until the player approves them, with a 45-second timeout so a distracted judge never leaves the DM frozen.

The DM loop is ~180 lines: read the live registry with `getTools()`, translate it to OpenAI function specs, send the conversation to the Worker, run whatever tool calls come back through `executeTool()`, feed the results in, repeat up to seven hops, then speak. That loop *is* the integration — OpenAI supplies the judgement, WebMCP supplies the hands. The **🎩 DM Panel** tab is a live inspector for the same registry: every tool `getTools()` reports, with its JSON Schema rendered as a form that calls `executeTool()`. Same door, same Agent Log.

A **435-assertion Playwright suite** across eleven files drives all of this through the real `document.modelContext` in headless Chromium — the registry growing and shrinking with combat, both approval outcomes, every effort mode, a five-beat run walked to victory, and pixel checks on the canvas, because we once shipped a scope bug that blanked every monster while all 196 assertions still passed.

## Challenges we ran into

The hard problem wasn't wiring tools; it was that a language model is a wonderful storyteller and an unreliable referee. We watched the same failure four times: a rule stated clearly in the system prompt held for a few turns and then drifted. The DM was told to stake effort often — it didn't. Told to move the board when the party moved — it narrated the walk and left the tokens standing. Told not to switch maps with `set_scene` — it walked the party into the glade that way, never called `advance_quest`, and the beat that pays never cleared.

Every one of those got fixed the same way, and it became the design principle of the project: **if it matters, the tool enforces it.** Reach is checked by `attack` — a sword swung from across the room is refused with the cell to move to. Pacing is enforced by the dice — two rolls with nothing staked and `roll_dice` refuses once and names the offer to make first. The map only changes through `advance_quest`. Monsters take their own turns the moment initiative reaches them. The player's effort preference gates the effort tools themselves, and there is deliberately *no* WebMCP tool to change it — an agent that can widen what it may ask of your body isn't holding a preference, it's holding a suggestion.

The other challenge was hands-free play hearing itself: the DM's own voice fed straight back into speech recognition as the player's turn. Three layers of echo suppression, and a test suite that installs a fake `SpeechRecognition` to replay the exact failure, because headless Chromium has no microphone.

## Accomplishments that we're proud of

A stranger can open the URL and play a real ten-minute dungeon with zero instructions — and the moment the DM offers ten push-ups for a natural 20, every playtester stood up. That's the whole thesis, and it works.

The DM has no privileges. It discovers what it can do by calling `getTools()` and acts by calling `executeTool()`, exactly as a ChatGPT or Claude agent would from outside — so the page isn't asserting its tool surface is real, it's handing the seat to an agent and letting you watch every call land in the Agent Log.

And it's honest about what it can't check. The Oath has no verification, on purpose, and the card says so to your face: *"On your honour. Nothing here can check, which is rather the point."* We could have faked a webcam check. Verification would have narrowed the mechanic to what a camera can see — and reading ten pages, practising scales, and writing the dreaded email are exactly the commitments people most need a reason to keep.

## What we learned

Mechanism beats adjective. Every time we tried to fix an agent's behaviour with better prose, it worked for a while. Every time we exposed a counter, a refusal, or a gate, it stayed fixed. That reshaped how we think about WebMCP tool design: a tool isn't just a capability you hand an agent, it's the place where the *rules* live, and a well-designed refusal — one that names what went wrong and hands back the call to make instead — is worth more than a paragraph of instructions.

We also learned that tests can pass while the game is broken. All 196 assertions were green the day a scope bug made every monster vanish from the canvas; a screenshot caught it. Now the suite samples pixels, and we don't trust a feature we haven't watched.

And we learned that accessibility isn't a mode you bolt on. Once the Oath existed and paid the same as push-ups, "can't exercise" stopped being a reason not to play — it became a setting.

## What's next for Arcana Table

Webcam rep counting with MediaPipe Pose, fully client-side, so push-ups count themselves — while keeping the Oath exactly as unverifiable as it is. Multiplayer parties sharing one DM. Campaign art generated per-run from our ComfyUI pipeline. And an external-agent showcase: the same dungeon run end to end by a Claude or ChatGPT browser agent through the identical 25 tools, recorded side by side with the built-in DM, because that comparison is what WebMCP makes possible.

---

**Built with:** JavaScript, HTML5 Canvas, WebMCP (`document.modelContext`, `@mcp-b/webmcp-polyfill`), OpenAI Chat Completions with function calling, OpenAI TTS, Web Speech API, Cloudflare Workers, Cloudflare Pages, Playwright.

**Try it:** https://arcana-table.pages.dev · **Source:** https://github.com/banksythequantLab/arcana-table
