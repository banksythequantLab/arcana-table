#!/usr/bin/env python3
"""Assemble the Arcana Table demo video.

Video bed = title cards (rendered in the app's own style) + real gameplay
footage. Audio = Derek's cloned voice-over. One slot is deliberately left
empty with a placeholder card: the push-up shot only he can film.
"""
import subprocess, pathlib, json, sys

HERE = pathlib.Path(__file__).parent
VO   = HERE / 'vo'
CARD = HERE / 'screens/cards'
FOOT = HERE / 'screens/video/arcana-screen.mp4'
# The animated "how it works" model, recorded by diagram.mjs.
MODEL = HERE / 'screens/diagram/model.mp4'
# The one shot no harness can produce: Derek actually doing the reps. When it
# is present the slate becomes that footage under a lower-third; when it is
# not, the placeholder card stands in so the pipeline still builds.
PUSHUPS = HERE / '../media/pushups.mp4'
LOWER   = HERE / 'screens/cards/lower-third.png'
PUSHUP_CROP = 'crop=1700:956:150:124'      # tighten the room, keep him whole
BUILD = HERE / 'build'; BUILD.mkdir(exist_ok=True)
W, H, FPS = 1280, 720, 30

def run(args):
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode:
        print('FFMPEG FAIL:', ' '.join(args[:9]), '\n', r.stderr[-700:]); sys.exit(1)

def dur(p):
    r = subprocess.run(['ffprobe','-v','error','-show_entries','format=duration',
                        '-of','csv=p=0',str(p)], capture_output=True, text=True)
    return float(r.stdout.strip())

VOS = {p.stem: dur(p) for p in sorted(VO.glob('*.wav'))}
FOOT_LEN = dur(FOOT)
print('vo:', json.dumps(VOS, indent=1), '\nfootage:', round(FOOT_LEN,1), 's')

# ── the cut ─────────────────────────────────────────────────────────────────
# (kind, source, length, footage_start)   kind: card | shot | slate
CUT = [
    # footage_start values are tuned to the current screens/video bed:
    #  ~20s intro card · ~40s quest rail + opening · ~62-76s the warm-up
    #  ~99s the Oath offered and sworn · ~101-116s the table locked
    #  ~118-140s combat · ~145s the natural 20 on the new d20
    #
    # 'model' segments come from the architecture animation, not the bed.
    ('card',  'open',   2.0, None),
    ('shot',  None,     VOS['vo01_problem'] + VOS['vo02_whatitis'], 40.0),
    ('card',  'webmcp', 4.5, None),
    # The model earns real screen time: it is the clearest statement the project
    # makes, and a card alone cannot make it.
    ('model', None,     VOS['vo03a_nobackdoor'] + VOS['vo03b_contract'], 0.4),
    ('card',  'heroic', 2.0, None),
    ('shot',  None,     VOS['vo04_heroic'], 78.0),
    ('slate', 'burpees',10.0, None),
    ('shot',  None,     (VOS['vo07_swap'] - 10.0) + VOS['vo04b_payoff'], 142.5),
    ('card',  'oath',   2.0, None),
    ('shot',  None,     VOS['vo08_oath'], 96.0),
    ('shot',  None,     VOS['vo09_micro'], 106.0),
    # Back to the model, resting on the OpenAI and Worker boxes.
    ('model', None,     VOS['vo10_brain'], 28.0),
    ('shot',  None,     VOS['vo05_hood'], 44.0),
    ('card',  'close',  VOS['vo06_close'] + 0.5, None),
]

parts = []
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
        s = start % max(FOOT_LEN - 1, 1)
        # loop the bed if a VO line outruns the remaining footage
        run(['ffmpeg','-y','-loglevel','error','-stream_loop','-1','-i',str(FOOT),
             '-ss',f'{s:.3f}','-t',f'{length:.3f}','-r',str(FPS),'-an',
             '-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p',
             '-vf',f'scale={W}:{H}',str(out)])
    parts.append(out)
    print(f'  {i:02d} {kind:5} {src or "footage":8} {length:6.1f}s')

# ── video track ─────────────────────────────────────────────────────────────
listing = BUILD / 'parts.txt'
listing.write_text(''.join(f"file '{p.name}'\n" for p in parts))
silent = BUILD / 'video_silent.mp4'
run(['ffmpeg','-y','-loglevel','error','-f','concat','-safe','0','-i',str(listing),
     '-c','copy',str(silent)])

# ── voice track: same order, silence under the cards ────────────────────────
ORDER = [
    ('sil', 2.0), ('vo', 'vo01_problem'), ('vo', 'vo02_whatitis'),
    ('sil', 4.5), ('vo', 'vo03a_nobackdoor'), ('vo', 'vo03b_contract'),
    ('sil', 2.0), ('vo', 'vo04_heroic'),
    ('vo', 'vo07_swap'),                            # over the push-up slate
    ('vo', 'vo04b_payoff'),
    ('sil', 2.0), ('vo', 'vo08_oath'),
    ('vo', 'vo09_micro'),
    ('vo', 'vo10_brain'),                           # over the model again
    ('vo', 'vo05_hood'), ('vo', 'vo06_close'),
    ('sil', 0.5),
]
apieces = []
for j, item in enumerate(ORDER):
    out = BUILD / f'a{j:02d}.wav'
    if item[0] == 'sil':
        run(['ffmpeg','-y','-loglevel','error','-f','lavfi','-i',
             'anullsrc=channel_layout=mono:sample_rate=24000','-t',f'{item[1]:.3f}',str(out)])
    else:
        run(['ffmpeg','-y','-loglevel','error','-i',str(VO/f'{item[1]}.wav'),
             '-ar','24000','-ac','1','-af','loudnorm=I=-17:TP=-1.5:LRA=11',str(out)])
    apieces.append(out)

alist = BUILD / 'audio.txt'
alist.write_text(''.join(f"file '{p.name}'\n" for p in apieces))
voice = BUILD / 'voice.wav'
run(['ffmpeg','-y','-loglevel','error','-f','concat','-safe','0','-i',str(alist),
     '-c','copy',str(voice)])

print('video bed:', round(dur(silent),1), 's | voice:', round(dur(voice),1), 's')

# ── mux ─────────────────────────────────────────────────────────────────────
final = HERE / 'build/arcana-table-demo.mp4'
run(['ffmpeg','-y','-loglevel','error','-i',str(silent),'-i',str(voice),
     '-c:v','copy','-c:a','aac','-b:a','192k','-shortest',str(final)])
print('\nDONE →', final, round(dur(final),1), 's')
