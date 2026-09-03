# Checks

```bash
npm install
npm test          # every suite, in order — 427 assertions
```

Playwright drives a real headless Chromium against the real page. Nothing is
mocked except the network: the DM is either stubbed at the route level or, in
`live.mjs` and `playtest.mjs`, pointed at the actual Worker.

## The suites — `npm test` runs all eleven

| | | |
|---|---|---|
| `smoke.mjs` | 96 | The whole game through the tool surface: the real `document.modelContext`, `getTools()` / `executeTool()`, dynamic registration in and out of combat, both approval paths, a complete push-ups-to-natural-20 loop, all three effort modes, the warm-up, the quest, and the frozen board when a hero drops. |
| `a11y.mjs` | 11 | Keyboard-only entry, accessible names, a visible focus ring, the canvas text alternative, the live region on the log, and the dice animation collapsing under `prefers-reduced-motion`. |
| `reach.mjs` | 61 | Position is a rule: a melee attack out of range is refused with the cell to move to, spells work at distance and are bounded too, Mira's fireball bursts on a cluster and never on the party, and attacking or starting a fight lifts the fog. Also: what you kill actually leaves the board (and the initiative order, without skipping anyone); monsters take their own turns the moment initiative reaches them; a swing paints a real arc on the canvas — checked in PIXELS, on a reduced-motion page so the torch flicker cannot fake it; and `set_scene` can no longer switch maps, because a DM once walked the party into the glade that way and the beat never paid. |
| `fixes.mjs` | 25 | Bugs a player actually hit, each with the check that would have caught it — the warm-up spanning the body rather than circling the neck, holds not being validated against the reps list, the party moving as one, and a walk lighting its whole corridor. |
| `echo.mjs` | 15 | Hands-free not hearing itself. Installs a fake `SpeechRecognition` and replays the real failure: the DM's own line fed back while speaking, again as a late fragment, and again as "ten push-ups" during a live challenge. The only coverage this path has — headless Chromium has no speech recognition, so every other suite types. |
| `variety.mjs` | 46 | Three more player reports: every monster looking identical, the table almost never asking for exercise, and a reward that ignored the size of the ask. Covers the bestiary, the per-token variation, the offer pacing clock, the effort/reward ladder, and name-matching surviving what speech recognition actually returns. Also the roll gate: two rolls with nothing staked and `roll_dice` refuses once, naming the offer to make first — and never twice in a row, so it cannot wedge a game. |
| `walk.mjs` | 10 | Clicking the map walks the party there — the first thing every player tries, and until now the only way to move anything was to drag a token. Also the board's only PIXEL check: a scope bug once made every monster vanish from the canvas while all 196 assertions still passed, because nothing asserted the board had drawn anything. |
| `milestone.mjs` | 51 | Clearing a beat pays, visibly and more each time — loot, a banked boon, a short rest to full — with a banner that names all three. Also that no timer is a trap: a running hold, a 25-minute Oath and a ten-minute warm-up can each be left at any point, and the Cinder Wight has its own art at twice the size. |
| `tasks.mjs` | 51 | A task list instead of one ultimatum: 2-3 small asks on one card, each priced off the same ladder as a single challenge, tick off what you did — all three is +6, two of three is +4. Checks partial credit pays exactly what was ticked, that it never pays advantage or a natural 20, that the effort preference still gates it, and that it counts as staking something for the roll clock. |
| `oath.mjs` | 47 | The player picks which currency the table may charge in — reps, holds, Oaths, or anything — and the TOOLS enforce it, so a model cannot drift back to push-ups by turn forty. Covers all four settings both ways, the refusal carrying the call to make instead, the preference surviving a reload, and the deliberate absence of a `set_effort_preference` tool: an agent that can widen what it may ask of a body is not a preference, it is a suggestion. |
| `inspector.mjs` | 14 | The DM Panel is the live registry, not a rack of buttons: it lists exactly what `getTools()` returns, follows it in and out of combat, and its schema-built forms really do go through `executeTool` and reach the Agent Log. |

## Checks you run by hand

- `npm run gate` — audio autoplay under Chrome's real `document-user-activation-required` policy, proving the intro click is what unlocks the DM's voice.
- `npm run mobile` — screenshots the phone layout at 390×844 and reports whether anything overflows.
- `npm run live` — plays the **deployed** build against the real Worker, gate to first tool call. Byte-compare the files against pages.dev first; a site that loads but does not play is exactly what the other suites cannot catch.
- `npm run playtest` — a real conversation with the live DM. Not deterministic, so not part of `npm test`; it is how the behavioural bugs got found.
- `npm run fullrun` — drives thirteen player turns at the live DM and reports how far the run actually got: beats cleared, map swaps, party level, every tool error. Takes about ten minutes and costs real API calls, which is why it is not in `npm test` — but it is the only thing that exercises `advance_quest` past the first beat, and it is what caught the DM spending nine exchanges on one beat of five.

## Not tests

These render the demo video and its assets, and are kept here because they drive
the same headless browser:

`record.mjs` (the gameplay bed) · `cards.mjs` (title cards) · `diagram.mjs` (the
animated architecture model) · `lower-third.mjs` (the strip over the push-up
footage) · `warm.mjs` (warm-up capture) · `assemble.py` (ffmpeg cut list).
