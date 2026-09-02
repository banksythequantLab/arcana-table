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
agent can stake something real against the dice, and it has three shapes that
all pay identically.

- **Reps** — ten jumping jacks for +2, ten push-ups for a guaranteed **natural
  20**. Counted on a big tap/spacebar ring, or out loud in hands-free mode,
  because you cannot press a key mid-push-up.
- **A hold** — a thirty-second plank while the wyrm circles. The ring counts
  itself down; there is nothing to tap.
- **An Oath** — something real in the room the app cannot see: clear the sink,
  twenty minutes of study, ten pages of the textbook. The table **locks** for
  the minutes agreed, every write tool but `narrate` refuses, and the claim button stays
  disabled until the clock is actually served. The DM is instructed in as many
  words that an Oath is an equal, never a consolation prize, and to reach for
  one when a player mentions something they are avoiding.

**On the Oath having no verification.** It doesn't, deliberately, and the UI
says so to your face: *"On your honour. Nothing here can check, which is rather
the point."* We could have faked a check. We chose not to, for three reasons.

First, the thing being spent is not a claim, it is **time**. The board freezes
for the full duration and the claim button is disabled until the clock is
genuinely served — you cannot click through it, and there is nothing to do in
the meantime. Ten minutes of a locked game is a real cost whether or not the
dishes got done.

Second, verification would narrow the mechanic to the things a webcam can see.
Push-ups are checkable; reading ten pages, practising scales, and writing the
email you have been dreading are not. Those are exactly the commitments people
most need a reason to keep, and a verification requirement would have excluded
all of them.

Third, this is a single-player game against your own inertia. There is no
leaderboard and no opponent, so the only person a false claim defrauds is the
person making it — which is the same contract every habit tracker, food diary
and workout log already runs on. Cheating here is not an exploit; it is just
declining to play.

Runs open with an optional **guided warm-up**: twenty standing stretches, head
to ankle, each with a cue and a coaching note, on a timer that advances itself
with a breathing pacer underneath. Ninety seconds, three, five or ten minutes —
nothing needs a mat or the floor. Finishing it starts you warm: +2 on your first
roll.

A session is not an open sandbox. **The Ember Crown** is a five-beat quest across
the three maps, ending with the Cinder Wight. The DM is handed the current
objective in every turn's context and told to drive toward it; each beat cleared
pays a milestone, and clearing the fifth wins the run. A **five-beat rail sits
under the header** for the whole run — the beat you are on lit gold, the ones you
cleared green, the ones ahead dimmed, and the last one turning red when you reach
it — with the current objective spelled out beneath it,
so "what am I doing and how far in am I?" is answerable at a glance without
reading a word of the story log. Clearing the fifth beat shows a real ending
screen that counts the reps you actually did.

And you can go down. If a player character hits 0 HP, **time stops** — the board
freezes and almost every tool refuses to act, the DM's included. There are
three ways out and only one is certain: a d20 death save, three failures of which
ends the run; a heal that puts them back above zero; or a Heroic Effort, which
**always** works. No roll, no chance. In this game effort
is the way out of death, which is the argument the whole project is making.

## How WebMCP powers it

- **The built-in DM is a WebMCP client, not a shortcut.** `js/dm.js` reads the
  live registry with `getTools()`, translates it to function specs, and invokes
  everything through `executeTool()`. It cannot *change* game state any other way —
  every mutation is an `executeTool()` call.
  A ~200-line Cloudflare Worker holds the OpenAI API key so none reaches a
  browser — origin-locked, size-capped, 40 req/min per IP.

- **24 tools** registered through `document.modelContext` / `navigator.modelContext`
  (20 always on, 3 more while combat runs, 1 more while a hero is bleeding out)
  — reads (`get_board_state`, `get_character_sheet`, `get_fitness_log`, `get_quest`, all
  `readOnlyHint: true`), board actions (`move_party`, `move_token`, `add_token`,
  `reveal_area`, `set_scene`), the reach-enforcing `attack`, game flow (`roll_dice`, `narrate`, `start_combat`, `end_combat`,
  `remove_token`, `award_loot`)
  the quest tools (`get_quest`, `advance_quest`), and the effort tools
  (`propose_challenge` for reps and timed holds, `propose_oath` for real-world
  commitments, `start_warmup` for the guided stretch program).
- **Dynamic registration, the way the spec prescribes:** combat tools
  (`advance_turn`, `update_hp`, `apply_condition`) exist only while combat runs.
  Every tool is registered with an `AbortController` — `registerTool(def,
  { signal })` — and removed by `controller.abort()`, which fires `toolchange`
  so agents refresh. The same pattern registers `death_save` only while a hero
  is at 0 HP. Our tests assert it against the live registry: `getTools()` returns
  20, then 23 during combat, then 20 again — and 24 when a hero drops mid-fight,
  because `death_save` joins the combat set.
- **No flag, no setup, for anyone:** the page vendors the MIT
  `@mcp-b/webmcp-polyfill`, so `document.modelContext` and the full 24-tool
  surface are real in any modern browser — 20 registered at rest, the rest
  appearing with combat and with a downed hero. Judges just open the URL. Where WebMCP ships natively,
  that implementation wins and the badge honestly reads `native` vs `polyfill`.
- **Human-in-the-loop by construction:** destructive calls (removing a token,
  damaging a player character) suspend inside `execute()` — for up to 45 seconds, after which the call
  resolves as denied and the DM is told to carry on without it — until the player
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

## Built with

- **OpenAI** — the Dungeon Master's mind and its voice. Every turn is a Chat
  Completions call with function calling (`gpt-5.6-luna`), where the functions
  are the page's live WebMCP tools translated into OpenAI function specs. The
  Worker passes OpenAI's own `model` field straight back, so you can confirm
  which model actually answered without taking our word for it:

  ```bash
  curl -s -X POST https://arcana-dm.dj-b02.workers.dev \
    -H 'content-type: application/json' \
    -H 'origin: https://arcana-table.pages.dev' \
    -d '{"messages":[{"role":"user","content":"Reply with the single word: ready"}],"tools":[]}'
  # {"content":"ready","tool_calls":[],"finish_reason":"stop","model":"gpt-5.6-luna"}
  ``` The
  DM's spoken lines are OpenAI TTS (`gpt-4o-mini-tts`, voice *fable*). The model
  is doing the actual game-mastering: choosing what to spawn, when to escalate,
  when to ask for push-ups, and when to accept the dishes instead.
- **WebMCP** — `document.modelContext` / `navigator.modelContext`, with the
  vendored [`@mcp-b/webmcp-polyfill`](https://github.com/WebMCP-org/npm-packages)
  (MIT) so the surface is real in any browser, no flag required.
- **Cloudflare** — Workers holds the OpenAI key server-side, origin-locked and
  rate-limited, so no key ever reaches a browser; Pages serves the static app.
- **Vanilla JS**, zero build step — a canvas battle map (3 maps, fog of war),
  state in localStorage, cel-shaded art, hand-drawn SVG tokens.
- **Web Speech API** for hands-free play, because you cannot press a key
  mid-push-up.

## Accessibility and reach

Not decoration. The first three below are held in place by a 9-assertion
Playwright probe (`test/a11y.mjs`), so they cannot quietly rot; the last two are
design commitments in the code rather than assertions:

- **Playable by keyboard alone.** The intro gate takes focus and dismisses on
  Enter; every visible control has an accessible name; Tab reaches the "what do
  you do" input; `:focus-visible` draws a gold ring that is never suppressed.
- **The board is never the only channel.** The canvas carries a text
  alternative, and the story log is an `aria-live="polite"` region, so every
  scene change, roll and blow is announced. A screen-reader player follows the
  game through the log the same way a sighted player follows the map.
- **`prefers-reduced-motion` is honoured for real.** Torch flicker, token bob,
  screen shake, turn pulse and the entire dice tumble collapse to nothing — the
  d20 skips straight to its result rather than spinning. The dice case is asserted
  in a real reduced-motion browser context rather than declared in a media query;
  the canvas effects are gated on the same `matchMedia` check in `js/board.js`.
- **Bodies differ, and the table adapts.** `state.settings.exercisePool` is the
  set of exercises this player has enabled, and the DM is forbidden from asking
  for anything outside it. Someone who cannot do push-ups today gets crunches,
  or a timed hold, or an **Oath** — which needs no physical capability at all
  and pays exactly the same. This is the accessibility argument the whole
  Heroic Effort design is built around.
- **Mobile.** Two breakpoints (860px and 560px). At phone width the quest rail
  collapses to numbered beats, the panel fills the screen instead of leaving
  dead space, the warm-up goes full-screen, and inputs are 16px so iOS does not
  zoom on focus. Checked at 390×844 by `test/mobile.mjs`, which screenshots the
  phone layout and reports whether anything overflows.

## How we built it

Vanilla JS single-page app, zero build step, no backend beyond a ~200-line
Cloudflare Worker that proxies OpenAI — a canvas-rendered grid board (3 maps,
fog of war, drag-and-drop tokens), state in localStorage, cel-shaded cartoon
art. A 213-assertion Playwright suite drives the tools through the real
`document.modelContext` — `getTools()`, `executeTool()`, `readOnlyHint` on
reads, the registry growing and shrinking with combat and with a downed hero,
both approval outcomes, all three effort modes, the guided warm-up, and a
five-beat run walked to victory.

The DM loop itself is ~180 lines: read the live registry with `getTools()`,
translate it into OpenAI function specs, send the conversation to the Worker,
execute whatever tool calls come back through `executeTool()`, feed the results
in, and repeat up to seven passes before it must speak. That loop is the whole
integration — OpenAI supplies the judgement, WebMCP supplies the hands.

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

# Demo video

**2:53.** The full spoken script, as actually recorded, is in
[`VOICEOVER.md`](VOICEOVER.md).

Narration is Derek's own voice, cloned with his consent on our own GPU stack
(FreeClone + VoxCPM2) — he is the sole author of this project and the speaker in
the reference recording. No other person's voice appears in the video.
The Dungeon Master's lines are OpenAI TTS captured live from the running app —
never re-recorded, so what you hear is the product's own voice. Silence appears
only under the title cards.

The one shot that could not be generated is in there too: ten real push-ups,
filmed, cut in under the line *"not everyone can drop and give me ten."*

Rebuild it with:

```bash
cd test
node cards.mjs        # title cards, rendered in the app's own CSS
node diagram.mjs      # the animated architecture model
node lower-third.mjs  # the strip over the push-up footage
node record.mjs       # a fresh gameplay bed against the live DM
python3 assemble.py   # cut + voice track + mux
```

## Running it yourself / bring your own key

The hosted Worker is rate-limited to 40 requests per minute per IP, which is
roomy for one person playing and tight against abuse. If a judge hits that
ceiling, or wants sustained play without touching our quota, there are two
paths and neither needs anything from us:

**Play without spending any more of the quota.** The opening scene costs one
DM call and one TTS call; after that, The 🎩 **DM Panel** tab is a live inspector for
the WebMCP registry, not a rack of hand-wired buttons. It reads `getTools()` off
`document.modelContext`, renders each tool's description and `readOnlyHint`, and
builds a form from that tool's own JSON Schema. Submitting the form calls
`executeTool()` — the identical path the AI DM and any external agent take — and
the call lands in the same Agent Log. So you can play the whole game by hand, but
the more useful property is what it demonstrates: the list you are driving IS the
list the DM holds. There is no private surface to compare it against, because the
DM has none. Watch the rows appear and vanish when a fight starts and ends.

**Or point it at your own key**, about three commands:

```bash
cd worker
wrangler secret put OPENAI_API_KEY     # your key, in your account, never ours
wrangler deploy                        # note the workers.dev URL it prints
# then set DM_ENDPOINT in js/config.js to that URL and serve the folder
```

`wrangler.toml` keeps the model in `[vars] MODEL`, so you can swap the DM's
brain without touching code. The Worker self-heals up to two rounds of parameter
disagreements between model families, so a different model usually just works.

## Links

- **Live:** https://arcana-table.pages.dev
- **Code:** https://github.com/banksythequantLab/arcana-table
- **Tests:** `cd test && npm install && npm test` — 213 assertions across eight
  suites against the real `document.modelContext`, including the 9 accessibility
  checks above. `test/README.md` says what each suite covers.
