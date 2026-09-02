# Checks

```bash
npm install
npm test          # every suite, in order — 167 assertions
```

Playwright drives a real headless Chromium against the real page. Nothing is
mocked except the network: the DM is either stubbed at the route level or, in
`live.mjs` and `playtest.mjs`, pointed at the actual Worker.

## The suites — `npm test` runs all six

| | | |
|---|---|---|
| `smoke.mjs` | 93 | The whole game through the tool surface: the real `document.modelContext`, `getTools()` / `executeTool()`, dynamic registration in and out of combat, both approval paths, a complete push-ups-to-natural-20 loop, all three effort modes, the warm-up, the quest, and the frozen board when a hero drops. |
| `a11y.mjs` | 9 | Keyboard-only entry, accessible names, a visible focus ring, the canvas text alternative, the live region on the log, and the dice animation collapsing under `prefers-reduced-motion`. |
| `reach.mjs` | 18 | Position is a rule: a melee attack out of range is refused with the cell to move to, spells work at distance and are bounded too, and attacking or starting a fight lifts the fog on what you are fighting. |
| `fixes.mjs` | 23 | Bugs a player actually hit, each with the check that would have caught it — the warm-up spanning the body rather than circling the neck, holds not being validated against the reps list, the party moving as one, and a walk lighting its whole corridor. |
| `echo.mjs` | 10 | Hands-free not hearing itself. Installs a fake `SpeechRecognition` and replays the real failure: the DM's own line fed back while speaking, again as a late fragment, and again as "ten push-ups" during a live challenge. The only coverage this path has — headless Chromium has no speech recognition, so every other suite types. |
| `inspector.mjs` | 14 | The DM Panel is the live registry, not a rack of buttons: it lists exactly what `getTools()` returns, follows it in and out of combat, and its schema-built forms really do go through `executeTool` and reach the Agent Log. |

## Checks you run by hand

- `npm run gate` — audio autoplay under Chrome's real `document-user-activation-required` policy, proving the intro click is what unlocks the DM's voice.
- `npm run mobile` — screenshots the phone layout at 390×844 and reports whether anything overflows.
- `npm run live` — plays the **deployed** build against the real Worker, gate to first tool call. Byte-compare the files against pages.dev first; a site that loads but does not play is exactly what the other suites cannot catch.
- `npm run playtest` — a real conversation with the live DM. Not deterministic, so not part of `npm test`; it is how the behavioural bugs got found.

## Not tests

These render the demo video and its assets, and are kept here because they drive
the same headless browser:

`record.mjs` (the gameplay bed) · `cards.mjs` (title cards) · `diagram.mjs` (the
animated architecture model) · `lower-third.mjs` (the strip over the push-up
footage) · `warm.mjs` (warm-up capture) · `assemble.py` (ffmpeg cut list).
