# Demo video assets

- **`arcana-table-demo.mp4`** — the assembled cut, 2:34. Real gameplay against
  the live DM, narrated in Derek's cloned voice (FreeClone / VoxCPM2), with
  Derek's own push-up footage at 1:25.
- **`arcana-screen.mp4`** — the raw 163s gameplay bed, no audio.
- **`pushups.mp4`** — the 10s Heroic Effort shot. The one piece of this video
  that could not be generated: someone actually doing the reps.
- **`voiceover/*.wav`** — the seven VO segments, individually, for re-cutting.
- **`cards/*.png`** — title cards at 1280×720.

## Rebuilding

```bash
cd test
node cards.mjs          # title cards, in the app's own CSS
node lower-third.mjs    # the transparent strip over the push-up shot
node record.mjs         # fresh gameplay bed against the live DM
python3 assemble.py     # cut + voice track + mux → test/build/
```

The cut carries one deliberately silent stretch after the push-up slate: the
voice-over predates Oaths and the warm-up, so a title card and the footage
carry those instead of the narration pretending to.

`assemble.py` uses `media/pushups.mp4` for the Heroic Effort beat when it is
present, and falls back to the `[ DROP YOUR PUSH-UP FOOTAGE HERE ]` placeholder
card when it is not, so the pipeline always builds. Every `footage_start` in
its `CUT` table is tuned to the current `arcana-screen.mp4`; re-record the bed
and those offsets need retuning against the new timings.
