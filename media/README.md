# Demo video assets

- **`arcana-table-demo-v2.mp4`** — **the submitted cut, 2:29.** Real gameplay
  against the live DM with the DM's own OpenAI TTS voice in the mix, ducked under
  Derek's narration; narration runs under every title card; every footage offset
  comes from event marks stamped during the recording (`test/record2.mjs` →
  `screens/video2/marks.json` → `test/assemble2.py`), so the picture matches the
  words by construction rather than by eye.
- **`arcana-table-demo.mp4`** — the first cut, 2:46, kept for reference. Real gameplay against
  the live DM, narrated in Derek's cloned voice (FreeClone / VoxCPM2), with
  Derek's own push-up footage at 1:25.
- **`arcana-screen.mp4`** — the raw 163s gameplay bed, no audio.
- **`pushups.mp4`** — the 10s Heroic Effort shot. The one piece of this video
  that could not be generated: someone actually doing the reps.
- **`voiceover/*.wav`** — the ten VO segments, individually, for re-cutting.
- **`cards/*.png`** — title cards at 1280×720.

## Rebuilding

```bash
cd test
node cards.mjs          # title cards, in the app's own CSS
node lower-third.mjs    # the transparent strip over the push-up shot
node record2.mjs        # fresh bed against the live DM — saves the DM's voice + event marks
python3 assemble2.py    # cut from the marks + both voices + mux → test/build2/
```

(`record.mjs` / `assemble.py` are the first cut's pipeline, kept for reference.
The DM is live and improvises; the beats the video depends on are forced through
the same tool surface the DM uses if it has not reached for them itself.)

Silence appears only under the four title cards — 13s of 166. The push-up
footage is narrated by `vo07_swap` ("not everyone can drop and give me ten"),
which is the line it was always meant to illustrate.

`assemble.py` uses `media/pushups.mp4` for the Heroic Effort beat when it is
present, and falls back to the `[ DROP YOUR PUSH-UP FOOTAGE HERE ]` placeholder
card when it is not, so the pipeline always builds. Every `footage_start` in
its `CUT` table is tuned to the current `arcana-screen.mp4`; re-record the bed
and those offsets need retuning against the new timings.
