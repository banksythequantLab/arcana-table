# Demo video assets

- **`arcana-table-demo.mp4`** — the assembled cut, 2:13. Real gameplay against
  the live DM, narrated in Derek's cloned voice (FreeClone / VoxCPM2).
- **`arcana-screen.mp4`** — the raw 67s gameplay bed, no audio.
- **`voiceover/*.wav`** — the seven VO segments, individually, for re-cutting.
- **`cards/*.png`** — title cards at 1280×720.

## The one shot left to film

At **1:21–1:31** there is a slate reading *"[ DROP YOUR PUSH-UP FOOTAGE HERE ]"*.
Drop 10 seconds of yourself doing the reps and counting out loud over it — that
is the beat the whole video is built around, and it is the only thing that
cannot be generated.

```bash
ffmpeg -i arcana-table-demo.mp4 -i pushups.mp4 -filter_complex \
  "[1:v]scale=1280:720,setpts=PTS-STARTPTS+81.7/TB[b];[0:v][b]overlay=enable='between(t,81.7,91.7)'" \
  -c:a copy arcana-table-final.mp4
```

Rebuild the whole cut after changing anything: `python3 test/assemble.py`
