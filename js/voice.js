// ── Arcana Table · speech ────────────────────────────────────────────────────
// You talk, the DM talks back. This exists because of Heroic Effort: nobody
// can type mid-burpee, so the table has to work with your hands on the floor.
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
};

let recog = null;
let onFinal = null;
let audio = null;
let restartTimer = null;

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
    voice.partial = interim || final;
    emit('voice');
    if (final.trim()) {
      voice.partial = '';
      const heard = final.trim();
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
    // Hands-free: keep the ear open between turns, unless the DM is talking.
    if (voice.handsFree && !voice.speaking) {
      clearTimeout(restartTimer);
      restartTimer = setTimeout(() => startListening(onFinal), 350);
    }
  };
  return r;
}

export function startListening(cb) {
  if (!SR) { voice.error = 'This browser has no speech recognition — type instead.'; emit('voice'); return; }
  if (voice.listening) return;
  onFinal = cb || onFinal;
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
  voice.handsFree = false;
  voice.partial = '';
  if (recog && voice.listening) { try { recog.abort(); } catch { /* fine */ } }
  voice.listening = false;
  emit('voice');
}

export function toggleHandsFree(cb) {
  voice.handsFree = !voice.handsFree;
  if (voice.handsFree) startListening(cb); else stopListening();
  emit('voice');
}

// ── counting reps out loud ──────────────────────────────────────────────────
// Mid-burpee your hands are on the floor. Say the count, or "done".
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
  const line = String(text).replace(/\*\*/g, '').slice(0, 900);

  // Never talk over the player's own mic.
  const wasHandsFree = voice.handsFree;
  if (voice.listening) { try { recog.abort(); } catch { /* fine */ } }
  voice.speaking = true;
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
    voice.speaking = false;
    voice.handsFree = wasHandsFree;
    emit('voice');
    if (wasHandsFree) setTimeout(() => startListening(onFinal), 250);
  }
}

function playUrl(url) {
  return new Promise(resolve => {
    audio = new Audio(url);
    audio.onended = audio.onerror = () => resolve();
    audio.play().catch(() => resolve());   // autoplay blocked until first click
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

export function shutUp() {
  if (audio) { try { audio.pause(); } catch { /* fine */ } }
  try { window.speechSynthesis?.cancel(); } catch { /* fine */ }
  voice.speaking = false;
  emit('voice');
}
