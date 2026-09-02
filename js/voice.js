// ── Arcana Table · speech ────────────────────────────────────────────────────
// You talk, the DM talks back. This exists because of Heroic Effort: nobody
// can type mid-push-up, so the table has to work with your hands on the floor.
//
// Ears  : Web Speech API (SpeechRecognition) — on-device, free, no key.
// Voice : OpenAI TTS through our Worker, with the browser's own synth as an
//         instant fallback so the DM is never mute.

import { state } from './state.js';
import { emit } from './actions.js';
import { DM_ENDPOINT } from './config.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export const voice = {
  supported: !!SR,
  listening: false,
  speaking: false,
  handsFree: false,       // DM finishes → mic opens automatically
  partial: '',
  error: null,
  muted: false,
  echoesIgnored: 0,   // the DM's own voice, caught and dropped
};

let recog = null;
let onFinal = null;
let audio = null;
let restartTimer = null;

// ── not listening to ourselves ──────────────────────────────────────────────
// The mic and the speakers are in the same room, so hands-free had the DM
// hearing its own voice, transcribing it, and playing it back as the player's
// turn. Worse, mid-challenge it heard the DM say "ten push-ups" and counted ten
// reps. Three layers, because any one of them alone leaks:
//   1. the ear is shut before a word is spoken, and stays shut while speaking;
//   2. a tail after the audio ends, for the room echo that arrives late;
//   3. a check on what was actually heard — browser echo cancellation is not
//      perfect, and half a sentence of the DM's own line still gets through.
const ECHO_TAIL_MS = 700;
let quietUntil = 0;              // no transcript is trusted before this moment
const spokenLines = [];          // the DM's recent lines, normalised

const norm = t => String(t).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

function rememberSpoken(text) {
  const n = norm(text);
  if (n) spokenLines.push(n);
  while (spokenLines.length > 4) spokenLines.shift();
}

/** Did we just say this? Substring catches a clean capture; the four-word run
 *  catches the usual case, where only part of the line survives the speakers. */
function isEcho(heard) {
  const h = norm(heard);
  if (!h) return true;
  const words = h.split(' ');
  return spokenLines.some(line => {
    if (line.includes(h)) return true;
    for (let i = 0; i + 4 <= words.length; i++) {
      if (line.includes(words.slice(i, i + 4).join(' '))) return true;
    }
    return false;
  });
}

/** True while the DM is talking, or while the room is still ringing with it. */
export function inQuietPeriod() {
  return voice.speaking || Date.now() < quietUntil;
}

/** Milliseconds of quiet left — exposed so tests can say WHY the ear is shut. */
export function quietLeft() { return Math.max(0, quietUntil - Date.now()); }

// ── ears ────────────────────────────────────────────────────────────────────
function build() {
  if (!SR) return null;
  const r = new SR();
  r.lang = 'en-US';
  r.continuous = false;
  r.interimResults = true;
  r.maxAlternatives = 1;

  r.onresult = e => {
    let interim = '', final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t; else interim += t;
    }
    // Never show the DM's own words back as "heard".
    voice.partial = inQuietPeriod() ? '' : (interim || final);
    emit('voice');
    if (final.trim()) {
      voice.partial = '';
      const heard = final.trim();
      // This gate runs BEFORE handleChallengeSpeech on purpose: the DM saying
      // "ten push-ups" must never be counted as the player doing ten.
      if (inQuietPeriod() || isEcho(heard)) {
        voice.echoesIgnored++;
        emit('voice');
        return;
      }
      if (!handleChallengeSpeech(heard) && onFinal) onFinal(heard);
    }
  };

  r.onerror = e => {
    // "no-speech" and "aborted" are ordinary in hands-free listening.
    if (!['no-speech', 'aborted'].includes(e.error)) {
      voice.error = e.error === 'not-allowed'
        ? 'Microphone blocked — allow mic access to play by voice.'
        : `Mic error: ${e.error}`;
    }
    emit('voice');
  };

  r.onend = () => {
    voice.listening = false;
    emit('voice');
    // Hands-free: keep the ear open between turns, but never while the DM is
    // talking or while its last line is still hanging in the room.
    if (voice.handsFree) {
      clearTimeout(restartTimer);
      const wait = Math.max(350, quietUntil - Date.now());
      restartTimer = setTimeout(() => { if (!inQuietPeriod()) startListening(onFinal); }, wait);
    }
  };
  return r;
}

export function startListening(cb) {
  if (!SR) { voice.error = 'This browser has no speech recognition — type instead.'; emit('voice'); return; }
  if (voice.listening) return;
  onFinal = cb || onFinal;
  // Asked to listen mid-sentence (the player flips hands-free on while the DM
  // is talking): wait it out rather than opening the mic into the speakers.
  if (inQuietPeriod()) {
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => { if (!inQuietPeriod()) startListening(onFinal); },
                              Math.max(120, quietUntil - Date.now()));
    return;
  }
  recog = recog || build();
  voice.error = null;
  try {
    recog.start();
    voice.listening = true;
  } catch { /* already starting */ }
  emit('voice');
}

export function stopListening() {
  clearTimeout(restartTimer);
  voice.handsFree = false;      // stopping by hand always ends hands-free
  voice.partial = '';
  if (recog && voice.listening) { try { recog.abort(); } catch { /* fine */ } }
  voice.listening = false;
  emit('voice');
}

export function toggleHandsFree(cb) {
  setHandsFree(!voice.handsFree, cb);
}

/** Deterministic, so the intro can switch it ON without knowing the old state. */
export function setHandsFree(on, cb) {
  voice.handsFree = !!on && voice.supported;
  if (voice.handsFree) startListening(cb); else stopListening();
  emit('voice');
}

// ── counting reps out loud ──────────────────────────────────────────────────
// Mid-push-up your hands are on the floor. Say the count, or "done".
const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

function handleChallengeSpeech(heard) {
  const c = state.challenge;
  if (!c) return false;
  const said = heard.toLowerCase();

  if (c.status === 'offered') {
    if (/\b(yes|accept|deal|i accept|do it|bring it|let's go|lets go)\b/.test(said)) {
      import('./actions.js').then(A => A.acceptChallenge());
      return true;
    }
    if (/\b(no|decline|skip|pass|roll it|no thanks)\b/.test(said)) {
      import('./actions.js').then(A => A.declineChallenge());
      return true;
    }
    return true;                       // don't send chatter to the DM mid-offer
  }

  if (c.status === 'active') {
    if (/\b(done|finished|complete|that's it|thats it)\b/.test(said)) {
      import('./actions.js').then(A => A.completeChallenge());
      return true;
    }
    // Count whatever numbers we heard: "…eight, nine, ten"
    const spoken = said.match(/\b(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/g);
    if (spoken?.length) {
      const highest = Math.max(...spoken.map(w => NUMBER_WORDS[w] ?? parseInt(w, 10)).filter(n => !isNaN(n)));
      import('./actions.js').then(A => {
        const gap = Math.max(0, Math.min(highest, c.reps) - c.progress);
        if (gap > 0) A.tickChallenge(gap);
        else A.tickChallenge(spoken.length);
      });
      return true;
    }
    return true;
  }
  return false;
}

// ── voice ───────────────────────────────────────────────────────────────────
export async function say(text) {
  if (voice.muted || !text) return;
  const line = String(text).replace(/\*+/g, '').slice(0, 900);

  // Shut the ear BEFORE a word leaves the speakers. Order matters: abort()
  // fires onend asynchronously, and that handler decides whether to reopen the
  // mic by reading voice.speaking — so the flag has to be true first, or the
  // ear reopens straight into the DM's opening syllable.
  const wasHandsFree = voice.handsFree;
  voice.speaking = true;
  // NOT Infinity. voice.speaking is the real guard while a line is playing; this
  // is only a backstop, and an unreachable one strands the microphone forever if
  // the finally below is ever skipped — a page hidden mid-line, an audio element
  // that never fires ended, any throw on an unexpected path. A minute is longer
  // than any line and still self-heals.
  quietUntil = Date.now() + 60_000;
  rememberSpoken(line);
  clearTimeout(restartTimer);
  if (voice.listening) { try { recog.abort(); } catch { /* fine */ } }
  voice.listening = false;
  emit('voice');

  try {
    const r = await fetch(`${DM_ENDPOINT}/speak`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: line }),
    });
    if (!r.ok) throw new Error('tts');
    const url = URL.createObjectURL(await r.blob());
    await playUrl(url);
    URL.revokeObjectURL(url);
  } catch {
    await browserSpeak(line);          // the DM is never mute
  } finally {
    // The audio element has stopped, but the room has not: a short tail keeps
    // the last words (and their echo) out of the next transcript.
    voice.speaking = false;
    quietUntil = Date.now() + ECHO_TAIL_MS;
    voice.handsFree = wasHandsFree;
    emit('voice');
    if (wasHandsFree) {
      clearTimeout(restartTimer);
      restartTimer = setTimeout(() => { if (!inQuietPeriod()) startListening(onFinal); }, ECHO_TAIL_MS);
    }
  }
}

let endPlayback = null;    // lets shutUp() finish a line that is still playing

function playUrl(url) {
  return new Promise(resolve => {
    // Pausing an <audio> fires neither 'ended' nor 'error', so a plain
    // onended-only promise never settles when the player mutes mid-line — and
    // say()'s finally never runs, leaving the microphone shut for good. Hand
    // shutUp() a way to settle it.
    let done = false;
    const finish = () => { if (done) return; done = true; endPlayback = null; resolve(); };
    endPlayback = finish;
    audio = new Audio(url);
    audio.onended = audio.onerror = finish;
    audio.play().catch(finish);            // autoplay blocked until first click
  });
}

function browserSpeak(text) {
  return new Promise(resolve => {
    const synth = window.speechSynthesis;
    if (!synth) return resolve();
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95; u.pitch = 0.85;
    const preferred = synth.getVoices().find(v => /daniel|google uk english male|male/i.test(v.name));
    if (preferred) u.voice = preferred;
    u.onend = u.onerror = () => resolve();
    synth.speak(u);
  });
}

/** Browsers refuse audio until the player interacts. Call this from a real
 *  click so the DM's very first line is actually heard. */
export async function unlockAudio() {
  try {
    const a = new Audio();
    a.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQxAADB8AhSmxhIIEVCSiJrDCQBTcu3UrAIwUdkRgQbFAZC1CQEwTJ9mjRvBA4UOLD8nKVOWfh+UlK3z/177OXrfOdKl7pyn3Xf//WreyTRUoAWgBgkOAd9gRsGA0EAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    a.volume = 0;
    await a.play();
    a.pause();
    return true;
  } catch { return false; }
}

export function shutUp() {
  if (audio) { try { audio.pause(); } catch { /* fine */ } }
  try { window.speechSynthesis?.cancel(); } catch { /* fine */ }
  if (endPlayback) endPlayback();      // let the awaiting say() run its finally
  voice.speaking = false;
  // Cutting the DM off mid-word still leaves that word in the room.
  quietUntil = Date.now() + ECHO_TAIL_MS;
  emit('voice');
}
