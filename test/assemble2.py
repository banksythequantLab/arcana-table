#!/usr/bin/env python3
"""Assemble the Arcana Table demo — second cut.

What changed from assemble.py, and why:

  * The footage offsets come from screens/video2/marks.json, stamped by
    record2.mjs as each beat happened. The first cut's offsets were tuned by
    eye against an older bed, which is exactly how "the words do not always
    match the screen" happens.
  * The Dungeon Master's own voice is in the mix. record2.mjs saved every
    /speak MP3 with the second it began playing; each one is laid under the
    footage at that same second, and ducked under Derek's narration with a
    sidechain compressor so the two voices never fight.
  * Nothing is silent. Each narration line starts ON the title card that
    introduces it and runs on into the footage, so the cards carry speech.

Video bed = cards + footage + the architecture model. Voice = Derek (narration)
+ the DM (diegetic). The push-up slate is Derek's own footage, as before.
"""
import subprocess, pathlib, json, sys

HERE  = pathlib.Path(__file__).parent
VO    = HERE / 'vo'
CARD  = HERE / 'screens/cards'
BED   = HERE / 'screens/video2'
MODEL = HERE / 'screens/diagram/model.mp4'
PUSHUPS = HERE / '../media/pushups.mp4'
LOWER   = HERE / 'screens/cards/lower-third.png'
PUSHUP_CROP = 'crop=1700:956:150:124'
BUILD = HERE / 'build2'; BUILD.mkdir(exist_ok=True)
W, H, FPS = 1280, 720, 30

def run(args):
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode:
        print('FFMPEG FAIL:', ' '.join(str(a) for a in args[:12]), '\n', r.stderr[-900:]); sys.exit(1)

def dur(p):
    r = subprocess.run(['ffprobe','-v','error','-show_entries','format=duration',
                        '-of','csv=p=0',str(p)], capture_output=True, text=True)
    return float(r.stdout.strip())

# ── the bed: Playwright writes a variable-rate webm; make it a constant-rate mp4
webm = next(BED.glob('*.webm'))
FOOT = BUILD / 'bed.mp4'
if not FOOT.exists() or FOOT.stat().st_mtime < webm.stat().st_mtime:
    print('transcoding bed…')
    run(['ffmpeg','-y','-loglevel','error','-i',str(webm),'-r',str(FPS),'-an',
         '-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p',
         '-vf',f'scale={W}:{H}',str(FOOT)])
FOOT_LEN = dur(FOOT)

M = json.loads((BED / 'marks.json').read_text())
marks, dmclips = M['marks'], M['dm']
VOS = {p.stem: dur(p) for p in sorted(VO.glob('*.wav'))}
print('marks:', json.dumps(marks))
print('vo:', json.dumps({k: round(v, 1) for k, v in VOS.items()}))
print('footage:', round(FOOT_LEN, 1), 's ·', len(dmclips), 'DM clips')

def at(key, fallback, lead=0.0):
    """A mark, less a little lead-in so the beat lands after the cut, not on it."""
    t = marks.get(key)
    if t is None:
        print(f'  ! no mark "{key}" — using {fallback}s'); t = fallback
    return max(0.0, t - lead)

# ── the cut ──────────────────────────────────────────────────────────────────
# Every card is followed by the shot its narration runs over, and the shot is
# shortened by the card's length so (card + shot) == the narration exactly.
# (kind, source, length, footage_start)
v = VOS
CUT = [
    ('card',  'open',   2.0,                                   None),
    ('shot',  None,     v['vo01_problem'] + v['vo02_whatitis'] - 2.0, at('table', 5.0, 0.4)),
    ('card',  'webmcp', 4.5,                                   None),
    ('model', None,     v['vo03a_nobackdoor'] + v['vo03b_contract'] - 4.5, 0.4),
    ('card',  'heroic', 2.0,                                   None),
    ('shot',  None,     v['vo04_heroic'] - 2.0,                at('challenge_offer', 120.0, 0.8)),
    ('slate', 'burpees',10.0,                                  None),
    ('shot',  None,     (v['vo07_swap'] - 10.0) + v['vo04b_payoff'], at('nat20', 160.0, 1.6)),
    ('card',  'oath',   2.0,                                   None),
    ('shot',  None,     v['vo08_oath'] - 2.0,                  at('oath_offer', 200.0, 0.6)),
    # vo09 is split: the Oath answered (the DM's own line, "the dishes are
    # sworn — and the oath answers") and then the task list for "micro bursts".
    ('shot',  None,     8.0,                                   at('oath_kept', 238.0, -12.5)),
    ('shot',  None,     v['vo09_micro'] - 8.0,                 at('tasklist', 230.0, 1.0)),
    ('model', None,     v['vo10_brain'],                       28.0),
    # Starts on the DM's "water surges around your boots" line and runs through
    # combat starting and the log filling.
    ('shot',  None,     v['vo05_hood'],                        at('hall', 66.0, 0.9)),
    ('card',  'close',  v['vo06_close'] + 0.5,                 None),
]

parts, timeline, cursor = [], [], 0.0
for i, (kind, src, length, start) in enumerate(CUT):
    out = BUILD / f'{i:02d}.mp4'
    if kind == 'slate' and PUSHUPS.exists():
        vf = f'{PUSHUP_CROP},scale={W}:{H},eq=saturation=0.92:contrast=1.06'
        if LOWER.exists():
            run(['ffmpeg','-y','-loglevel','error','-i',str(PUSHUPS),'-i',str(LOWER),
                 '-filter_complex',f'[0:v]{vf}[v];[v][1:v]overlay=0:0',
                 '-t',f'{length:.3f}','-r',str(FPS),'-an','-c:v','libx264','-preset','veryfast',
                 '-crf','20','-pix_fmt','yuv420p',str(out)])
        else:
            run(['ffmpeg','-y','-loglevel','error','-i',str(PUSHUPS),'-vf',vf,
                 '-t',f'{length:.3f}','-r',str(FPS),'-an','-c:v','libx264','-preset','veryfast',
                 '-crf','20','-pix_fmt','yuv420p',str(out)])
        src = 'pushups'
    elif kind == 'model':
        run(['ffmpeg','-y','-loglevel','error','-stream_loop','-1','-i',str(MODEL),
             '-ss',f'{start:.3f}','-t',f'{length:.3f}','-r',str(FPS),'-an',
             '-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p',
             '-vf',f'scale={W}:{H}',str(out)])
        src = 'model'
    elif kind in ('card', 'slate'):
        run(['ffmpeg','-y','-loglevel','error','-loop','1','-i',str(CARD/f'{src}.png'),
             '-t',f'{length:.3f}','-r',str(FPS),'-c:v','libx264','-preset','veryfast',
             '-crf','20','-pix_fmt','yuv420p','-vf',f'scale={W}:{H}',str(out)])
    else:
        s = min(start, max(FOOT_LEN - length - 0.1, 0))
        run(['ffmpeg','-y','-loglevel','error','-i',str(FOOT),
             '-ss',f'{s:.3f}','-t',f'{length:.3f}','-r',str(FPS),'-an',
             '-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p',
             '-vf',f'scale={W}:{H}',str(out)])
        timeline.append((cursor, s, length))          # (video time, footage time, len)
        start = s
    parts.append(out)
    print(f'  {i:02d} {kind:5} {src or "footage":8} {length:6.1f}s' + (f'  @bed {start:.1f}s' if kind == 'shot' else ''))
    cursor += length
TOTAL = cursor

listing = BUILD / 'parts.txt'
listing.write_text(''.join(f"file '{p.name}'\n" for p in parts))
silent = BUILD / 'video_silent.mp4'
run(['ffmpeg','-y','-loglevel','error','-f','concat','-safe','0','-i',str(listing),'-c','copy',str(silent)])

# ── Derek's narration: continuous, starting on each card ─────────────────────
ORDER = ['vo01_problem','vo02_whatitis','vo03a_nobackdoor','vo03b_contract','vo04_heroic',
         'vo07_swap','vo04b_payoff','vo08_oath','vo09_micro','vo10_brain','vo05_hood','vo06_close']
apieces = []
for j, name in enumerate(ORDER):
    out = BUILD / f'a{j:02d}.wav'
    run(['ffmpeg','-y','-loglevel','error','-i',str(VO/f'{name}.wav'),
         '-ar','48000','-ac','2','-af','loudnorm=I=-17:TP=-1.5:LRA=11',str(out)])
    apieces.append(out)
tail = BUILD / 'a_tail.wav'
run(['ffmpeg','-y','-loglevel','error','-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000','-t','0.5',str(tail)])
apieces.append(tail)
alist = BUILD / 'audio.txt'
alist.write_text(''.join(f"file '{p.name}'\n" for p in apieces))
narration = BUILD / 'narration.wav'
run(['ffmpeg','-y','-loglevel','error','-f','concat','-safe','0','-i',str(alist),'-c','copy',str(narration)])

# ── the DM's voice, at the seconds its words appeared on screen ──────────────
placed = []
for c in dmclips:
    for (vt, ft, ln) in timeline:
        if ft <= c['t'] < ft + ln:
            placed.append((vt + (c['t'] - ft), BED / c['file'], c['text']))
            break
print(f'{len(placed)} of {len(dmclips)} DM lines fall inside a shot:')
for t, f, txt in placed: print(f'   {t:6.1f}s  {txt[:64]}')

dmtrack = BUILD / 'dm.wav'
if placed:
    inputs, filters, labels = [], [], []
    for k, (t, f, _) in enumerate(placed):
        inputs += ['-i', str(f)]
        ms = int(t * 1000)
        filters.append(f'[{k}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={ms}|{ms}[d{k}]')
        labels.append(f'[d{k}]')
    filters.append(''.join(labels) + f'amix=inputs={len(placed)}:normalize=0:dropout_transition=0,apad=whole_dur={TOTAL:.3f},atrim=0:{TOTAL:.3f}[dm]')
    run(['ffmpeg','-y','-loglevel','error',*inputs,'-filter_complex',';'.join(filters),
         '-map','[dm]','-ar','48000','-ac','2',str(dmtrack)])
else:
    run(['ffmpeg','-y','-loglevel','error','-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000',
         '-t',f'{TOTAL:.3f}',str(dmtrack)])

# ── mix: the DM ducks under Derek, then both under the picture ───────────────
mixed = BUILD / 'mix.wav'
run(['ffmpeg','-y','-loglevel','error','-i',str(dmtrack),'-i',str(narration),
     '-filter_complex',
     # DM at a touch under full, compressed by the narration; narration on top.
     '[0:a]volume=1.0[dm];[1:a]asplit=2[nar][key];'
     '[dm][key]sidechaincompress=threshold=0.03:ratio=3:attack=60:release=700:makeup=1[dmduck];'
     '[dmduck][nar]amix=inputs=2:normalize=0:dropout_transition=0,alimiter=limit=0.95[out]',
     '-map','[out]','-ar','48000','-ac','2',str(mixed)])

final = BUILD / 'arcana-table-demo-v2.mp4'
run(['ffmpeg','-y','-loglevel','error','-i',str(silent),'-i',str(mixed),
     '-map','0:v','-map','1:a','-c:v','copy','-c:a','aac','-b:a','160k','-shortest',
     '-movflags','+faststart',str(final)])
print(f'\nvideo {dur(silent):.1f}s · narration {dur(narration):.1f}s · final {dur(final):.1f}s → {final}')
if dur(final) > 180: print('  ! OVER THREE MINUTES — Devpost caps at 3:00')
