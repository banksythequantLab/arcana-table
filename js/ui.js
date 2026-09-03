// ── Arcana Table · UI panels ─────────────────────────────────────────────────
// Story log, party sheet, manual DM panel, agent log, approvals, dice overlay,
// and the Heroic Effort challenge modal (tap / spacebar rep counter).

import { state, QUEST } from './state.js';
import * as A from './actions.js';
import { onChange } from './actions.js';
import { agentState, pendingApprovals, settleApproval } from './tools.js';
import { chat, sendToDM, openScene } from './dm.js';
import { voice, startListening, stopListening, toggleHandsFree, setHandsFree, shutUp, unlockAudio } from './voice.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// The DM writes in light markdown. Escape first, then honour **bold** and
// *italic* only — anything else stays literal text.
const prose = s => esc(s)
  .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');

const QUEST_TITLES = QUEST.beats.map(b => b.title);

// Short enough to sit in one scrollable row; the full sentence is what gets
// sent, so the DM still receives a real turn rather than a fragment.
const STARTERS = [
  'Look around',
  'Search the room',
  'Draw my sword',
  'Head through the door',
];
const STARTER_TURNS = [
  'Look around and tell me what I see.',
  'I search the room for anything valuable.',
  'I draw my sword and advance carefully.',
  'We head through the door into the next room.',
];

function bindIntro() {
  const intro = $('#intro');
  if (!intro) return;

  // No speech recognition (Firefox, Safari) — do not offer what we cannot do.
  if (!voice.supported) {
    $('#intro-voice').hidden = true;
    $('#intro-type').textContent = 'Light the torches →';
    $('#intro-type').classList.remove('ghost');
    $('#intro-voice-note').textContent =
      'This browser has no speech recognition, so you will type your turns. The DM still speaks aloud.';
  }

  // Both buttons spend the same click: it is the gesture browsers require
  // before audio will play AND before the mic can be requested.
  const enter = async (handsFree) => {
    voice.muted = false;                 // the DM always talks; the mute button is right there
    await unlockAudio();
    intro.hidden = true;
    if (handsFree) setHandsFree(true, speakTurn);
    render();
    openScene();                         // now its first line will actually be heard
  };
  $('#intro-voice').onclick = () => enter(true);
  $('#intro-type').onclick  = () => enter(false);
}

function renderStarters() {
  const el = $('#starters');
  // Build once and only toggle visibility. (Emptying it while the DM was busy
  // opening the scene used to leave the row permanently blank.)
  if (!el.dataset.built) {
    el.dataset.built = '1';
    el.innerHTML = STARTERS.map((t, i) => `<button class="starter" data-i="${i}" type="button">${esc(t)}</button>`).join('');
    el.querySelectorAll('.starter').forEach(b => b.onclick = () => speakTurn(STARTER_TURNS[+b.dataset.i]));
  }
  el.hidden = chat.busy || chat.messages.some(m => m.role === 'user');
}

export function initUI() {
  bindTabs();
  bindDMPanel();
  bindChallengeModal();
  bindWarmup();
  bindOath();
  bindEffortPref();
  bindSay();
  bindIntro();
  onChange(render);
  render('all');
  state.tokens.filter(t => t.kind === 'pc').forEach(t => A.revealAround(t.x, t.y, 3));
}

// ── header + scene ───────────────────────────────────────────────────────────
function renderHeader() {
  $('#scene-title').textContent = state.scene.title;
  $('#scene-mood').textContent = state.scene.mood;
  const badge = $('#agent-badge');
  const n = agentState.registered.length;
  const MODES = {
    native:   { cls: 'on',  html: `● WebMCP native · ${n} tools live` },
    polyfill: { cls: 'on',  html: `● WebMCP ready · ${n} tools live <span class="hint" title="Your browser doesn't ship WebMCP yet, so this page installed the open-source polyfill — the tool surface is real and agents can use it. In a browser with native WebMCP, that implementation is used instead.">polyfill</span>` },
    missing:  { cls: 'off', html: `○ No tool surface — DM panel active <span class="hint" title="The WebMCP polyfill failed to load. The game is still fully playable from the DM panel tab.">?</span>` },
  };
  const m = MODES[agentState.mode] || MODES.missing;
  badge.className = 'badge ' + m.cls;
  badge.innerHTML = m.html;

  const boosts = [];
  // The level is permanent, so it sits in the header for the whole run.
  if ((state.party.level || 1) > 1) boosts.push(`⬆ LEVEL ${state.party.level}`);
  if (state.boosts.setRoll === 20) boosts.push('⚡ NAT 20 armed');
  else if (state.boosts.setRoll != null) boosts.push(`⚡ die set to ${state.boosts.setRoll}`);
  if (state.boosts.advantage) boosts.push('⚡ advantage');
  if (state.boosts.bonus) boosts.push(`⚡ +${state.boosts.bonus}`);
  $('#boosts').textContent = boosts.join('  ·  ');

  const c = state.combat;
  $('#combat-strip').hidden = !c.active;
  if (c.active) {
    const cur = state.tokens.find(t => t.id === c.order[c.turnIndex]);
    $('#combat-strip').innerHTML = `⚔ Round ${c.round} — <b>${esc(cur?.name || '?')}</b>'s turn` +
      `<button class="mini" id="btn-next-turn">Next turn ▸</button>`;
    $('#btn-next-turn').onclick = () => A.advanceTurn();
  }
}

// ── the table: DM speech + game events, interleaved in time ─────────────────
const ICONS = { narrate: '📜', roll: '🎲', action: '👣', combat: '⚔️', loot: '💰', scene: '🗺️', challenge: '💪' };

const norm = s => String(s).replace(/\s+/g, ' ').trim().slice(0, 120);

function renderLog() {
  const el = $('#story-log');
  // A DM that both speaks and calls narrate would print itself twice; show once.
  const spoken = new Set(chat.messages.filter(m => m.role === 'dm').map(m => norm(m.text)));
  const feed = [
    ...chat.messages.filter(m => m.text && m.text.trim())
      .map((m, i) => ({ kind: 'chat', m, t: m.t ?? (i * 1e-6) })),
    ...state.log.slice(-60)
      .filter(l => !(l.type === 'narrate' && spoken.has(norm(l.text))))
      .map(l => ({ kind: 'event', l, t: l.t })),
  ].sort((a, b) => a.t - b.t);

  el.innerHTML = feed.map(x => {
    if (x.kind === 'event') {
      const l = x.l;
      return `<div class="entry ${l.type}"><span class="ic">${ICONS[l.type] || '•'}</span><div><b>${esc(l.actor)}</b> ${esc(l.text)}</div></div>`;
    }
    const m = x.m;
    if (m.role === 'user') return `<div class="say you"><b>You</b> ${esc(m.text)}</div>`;
    if (m.role === 'system') return `<div class="say sys">${esc(m.text)}</div>`;
    return `<div class="say dm"><b>DM</b> ${prose(m.text)}</div>`;
  }).join('')
    + (chat.busy ? `<div class="say dm thinking"><b>DM</b> <span class="dots"><i></i><i></i><i></i></span></div>` : '')
    + (!chat.messages.length && !chat.busy ? `<div class="say sys">The table is set. Say what you do, and the Dungeon Master will answer.</div>` : '');
  scrollToLatest(el);
}

/** #story-log does not scroll — the tab pane around it does. Setting scrollTop
 *  on the log itself was a no-op, which is why the newest line kept landing
 *  below the fold while the DM was still writing it. */
function scrollToLatest(el) {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.scrollHeight > n.clientHeight + 1 && getComputedStyle(n).overflowY !== 'visible') {
      n.scrollTop = n.scrollHeight;
      return;
    }
  }
}

const speakTurn = text => {
  if (!text || chat.busy) return;
  $('#say').value = '';
  sendToDM(text);
  document.querySelector('.tab[data-pane="pane-story"]')?.click();
};

function bindSay() {
  const form = $('#say-row'), input = $('#say');
  form.addEventListener('submit', e => {
    e.preventDefault();
    speakTurn(input.value.trim());
  });

  $('#mic-btn').onclick = () => {
    shutUp();                                  // barge in on the DM if needed
    if (voice.listening) stopListening();
    else startListening(speakTurn);
  };
  $('#hands-free').onchange = () => { shutUp(); toggleHandsFree(speakTurn); };
  $('#mute-btn').onclick = () => { voice.muted = !voice.muted; if (voice.muted) shutUp(); render(); };
}

function renderSay() {
  const input = $('#say'), btn = $('#say-btn'), mic = $('#mic-btn');
  input.disabled = chat.busy;
  btn.disabled = chat.busy;
  btn.textContent = chat.busy ? '…' : '▶';
  input.placeholder = voice.listening ? (voice.partial || 'Listening…')
    : chat.busy ? 'The DM is thinking…' : 'What do you do? (or tap 🎤)';

  mic.classList.toggle('on', voice.listening);
  mic.textContent = voice.listening ? '🔴' : '🎤';
  mic.disabled = !voice.supported;
  mic.title = voice.supported ? (voice.listening ? 'Listening — click to stop' : 'Click to speak your turn')
                              : 'This browser has no speech recognition';
  $('#hands-free').checked = voice.handsFree;
  $('#hands-free').disabled = !voice.supported;
  const mute = $('#mute-btn');
  mute.textContent = voice.muted ? '🔇' : voice.speaking ? '🗣️' : '🔊';
  mute.classList.toggle('off', voice.muted);
  renderVoiceState();
}

// One always-visible line answering "what is it doing?" — the thing playtesters
// could not work out from a small mic button changing colour.
function renderVoiceState() {
  const el = $('#voice-state');
  if (!el) return;
  let cls = '', icon = '⌨', text = 'Type your turn, or tap 🎤 to speak it.';

  if (voice.error) {
    cls = 'problem'; icon = '⚠';
    text = voice.error + ' Typing still works.';
  } else if (chat.busy) {
    cls = 'thinking'; icon = '💭'; text = 'The Dungeon Master is thinking…';
  } else if (voice.speaking) {
    cls = 'speaking'; icon = '🗣'; text = voice.handsFree
      ? 'The DM is speaking — it will listen again the moment it stops.'
      : 'The DM is speaking.';
  } else if (voice.listening) {
    cls = 'listening'; icon = '🎙';
    text = voice.partial ? '' : (state.challenge?.status === 'active'
      ? 'Listening — count your reps out loud, or say "done".'
      : 'Listening — just say what you do.');
  } else if (voice.handsFree) {
    cls = 'listening'; icon = '🎙'; text = 'Hands-free is on — opening the mic…';
  } else if (!voice.supported) {
    text = 'This browser has no speech recognition — type your turn.';
  }

  el.className = 'voice-state ' + cls;
  el.innerHTML = `<span class="dot"></span><span>${icon}</span>` +
    (voice.partial ? `<span class="heard">“${esc(voice.partial)}”</span>` : `<span>${esc(text)}</span>`);
}

// ── party panel ──────────────────────────────────────────────────────────────
function renderParty() {
  const el = $('#party-panel');
  const pcs = state.tokens.filter(t => t.kind === 'pc');
  const others = state.tokens.filter(t => t.kind !== 'pc');
  const lvl = state.party.level || 1;
  el.innerHTML = `<div class="party-level">⬆ PARTY LEVEL ${lvl}${lvl > 1 ? ` · +${(lvl - 1) * 2} damage` : ''}</div>` +
    pcs.map(t => `
    <div class="pc-card">
      <div class="pc-head"><b>${esc(t.name)}</b><span>AC ${t.ac ?? '—'}</span></div>
      <div class="hp-row"><div class="hp-bar"><div style="width:${(t.hp / t.maxHp) * 100}%"></div></div><span>${t.hp}/${t.maxHp}</span></div>
      ${t.conditions.length ? `<div class="conds">${t.conditions.map(c => `<span class="cond">${esc(c)}</span>`).join('')}</div>` : ''}
      <div class="inv">${(t.inventory || []).map(esc).join(' · ') || '<i>empty pockets</i>'}</div>
    </div>`).join('')
    + `<div class="loot-card"><b>Party loot</b> — ${state.party.gold} gp<div>${state.party.loot.map(esc).join(' · ') || '<i>nothing yet</i>'}</div></div>`
    + (others.length ? `<div class="others"><b>On the board:</b> ${others.map(t => `${esc(t.name)} (${t.hp}/${t.maxHp})`).join(' · ')}</div>` : '');

  const f = state.fitness;
  const pref = A.effortPref();
  $('#fitness-panel').innerHTML = `
    <b>💪 Heroic Effort</b>
    <div class="fit-row"><span>${f.totalReps}</span> total reps · <span>${f.oathsKept}</span> Oaths kept</div>
    ${Object.entries(f.byExercise).map(([k, v]) => `<div class="fit-ex">${esc(k)} <b>${v}</b></div>`).join('') || '<div class="fit-ex"><i>No sweat spilled yet.</i></div>'}
    <div class="pref-label" id="pref-label">The table may ask me for</div>
    <div class="pref-row" role="radiogroup" aria-labelledby="pref-label">
      ${Object.entries(A.EFFORT_PREFS).map(([k, p]) => `
        <button type="button" class="pref${k === pref ? ' on' : ''}" data-pref="${k}"
                role="radio" aria-checked="${k === pref}" title="${esc(p.hint)}">${esc(p.label)}</button>`).join('')}
    </div>
    <div class="pref-hint">${esc(A.EFFORT_PREFS[pref].hint)}. Change it any time — the DM is held to it.</div>`;
}

// The fitness panel is redrawn wholesale on every fitness event, so the
// preference buttons cannot own their handlers. Delegate once, at boot.
function bindEffortPref() {
  $('#fitness-panel').addEventListener('click', e => {
    const b = e.target.closest('[data-pref]');
    if (!b) return;
    A.setEffortPref(b.dataset.pref);
    const p = A.EFFORT_PREFS[b.dataset.pref];
    A.logStory('challenge', 'You', `📜 The table may now ask for: ${p.label.toLowerCase()} — ${p.hint}.`);
    A.emit('story');
  });
}

// ── agent log + approvals ────────────────────────────────────────────────────
function renderAgent() {
  $('#agent-sub').textContent = chat.error
    ? '· DM offline — run the tools yourself in the DM Panel'
    : chat.busy ? '· the OpenAI DM is acting' : '· OpenAI DM + any external agent';
  const el = $('#agent-log');
  el.innerHTML = state.agentLog.slice(-40).reverse().map(l => {
    const chip = { ok: '✓', called: '…', 'awaiting-approval': '✋', denied: '✗', error: '!' }[l.status] || '•';
    return `<div class="acall ${l.status}"><span class="chip">${chip}</span><code>${esc(l.tool)}</code><span class="anote">${esc(l.note || summarize(l.args))}</span></div>`;
  }).join('') || '<div class="acall idle">Agent tool calls appear here.</div>';

  const ap = $('#approvals');
  ap.innerHTML = pendingApprovals.map(p => `
    <div class="approval">
      <span>🤖 wants to: <b>${esc(p.description)}</b></span>
      <button class="ok" data-ap="${p.id}" data-yes="1">✓ Allow</button>
      <button class="no" data-ap="${p.id}">✗ Deny</button>
    </div>`).join('');
  ap.querySelectorAll('button').forEach(b => b.onclick = () => settleApproval(Number(b.dataset.ap), !!b.dataset.yes));
}
const summarize = a => { const s = JSON.stringify(a || {}); return s === '{}' ? '' : s.length > 60 ? s.slice(0, 57) + '…' : s; };

// ── dice overlay ─────────────────────────────────────────────────────────────
// A real d20, not a number in a hexagon: an icosahedron drawn as shaded facets
// that tumbles, lands with a shockwave, and goes molten gold on a natural 20.
const CALM_UI = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// Face-on projection of an icosahedron. The front face is the big upward
// triangle in the middle — that is where the number sits.
const HEX = [[0, -50], [43.3, -25], [43.3, 25], [0, 50], [-43.3, 25], [-43.3, -25]];
const FRONT = [[0, -27], [23.4, 13.5], [-23.4, 13.5]];
const pts = a => a.map(p => p.join(',')).join(' ');
const FACETS = [
  { p: [HEX[0], HEX[1], FRONT[1], FRONT[0]], shade: 'f-a' },
  { p: [HEX[1], HEX[2], FRONT[1]],           shade: 'f-b' },
  { p: [HEX[2], HEX[3], FRONT[2], FRONT[1]], shade: 'f-c' },
  { p: [HEX[3], HEX[4], FRONT[2]],           shade: 'f-d' },
  { p: [HEX[4], HEX[5], FRONT[0], FRONT[2]], shade: 'f-e' },
  { p: [HEX[5], HEX[0], FRONT[0]],           shade: 'f-f' },
];

function dieSVG(sides, value, i) {
  const body = sides === 20
    ? FACETS.map(f => `<polygon class="facet ${f.shade}" points="${pts(f.p)}"/>`).join('') +
      `<polygon class="facet f-front" points="${pts(FRONT)}"/>` +
      `<polygon class="edge" points="${pts(HEX)}"/>`
    : `<rect class="facet f-front gem" x="-40" y="-40" width="80" height="80" rx="14"/>` +
      `<rect class="edge gem" x="-40" y="-40" width="80" height="80" rx="14"/>`;
  return `<div class="die3d" style="--i:${i}">
    <svg viewBox="-56 -56 112 112" aria-hidden="true">
      ${body}
      <text class="pip" x="0" y="${sides === 20 ? 4 : 2}">${value}</text>
    </svg>
  </div>`;
}

let lastDiceT = 0, dieSpin = null, dieHide = null;
function renderDice() {
  const d = state.dice;
  if (!d || d.t === lastDiceT) return;
  lastDiceT = d.t;
  clearInterval(dieSpin); clearTimeout(dieHide);

  const ov = $('#dice-overlay'), tray = $('#die-tray');
  ov.hidden = false;
  ov.className = 'dice-overlay rolling';
  $('#die-label').textContent = d.reason || d.formula;
  $('#die-total').textContent = '';
  $('#die-boosts').textContent = '';
  tray.classList.toggle('many', d.rolls.length > 2);
  tray.innerHTML = d.rolls.map((r, i) => dieSVG(d.sides, r, i)).join('');

  const faces = () => tray.querySelectorAll('.pip');
  const settle = () => {
    clearInterval(dieSpin); dieSpin = null;
    ov.classList.remove('rolling');
    ov.classList.add('landed');
    faces().forEach((el, i) => { el.textContent = d.rolls[i]; });
    ring();
    $('#die-total').textContent = d.nat20 ? '⭐ NATURAL 20!'
      : `= ${d.total}` + (d.mod ? ` (${d.mod > 0 ? '+' : ''}${d.mod})` : '') + (d.bonus ? ` (+${d.bonus} heroic)` : '');
    if (d.nat20) { ov.classList.add('nat20'); burst(); }
    if (d.nat1) ov.classList.add('nat1');
    if (d.boostsUsed.length) $('#die-boosts').textContent = d.boostsUsed.join(' · ');
    dieHide = setTimeout(() => { ov.hidden = true; }, d.nat20 ? 3400 : 2300);
  };

  if (CALM_UI) return void settle();               // no tumbling for anyone who asked
  dieSpin = setInterval(() => {
    faces().forEach(el => { el.textContent = 1 + Math.floor(Math.random() * d.sides); });
  }, 55);
  setTimeout(settle, 1050);
}

// The shockwave the die makes when it stops.
function ring() {
  const tray = $('#die-tray');
  if (CALM_UI) return;
  const r = document.createElement('span');
  r.className = 'shock';
  tray.appendChild(r);
  setTimeout(() => r.remove(), 900);
}

function burst() {
  const ov = $('#dice-overlay');
  if (CALM_UI) return;
  for (let i = 0; i < 30; i++) {
    const s = document.createElement('span');
    s.className = 'spark';
    s.textContent = ['✦', '★', '✧', '✶'][i % 4];
    const a = (i / 30) * Math.PI * 2 + Math.random() * 0.4;
    const d = 0.55 + Math.random() * 0.45;
    s.style.setProperty('--dx', (Math.cos(a) * d).toFixed(2));
    s.style.setProperty('--dy', (Math.sin(a) * d).toFixed(2));
    s.style.fontSize = (18 + Math.random() * 18).toFixed(0) + 'px';
    s.style.animationDelay = (Math.random() * .18) + 's';
    ov.appendChild(s);
    setTimeout(() => s.remove(), 1700);
  }
}

// ── Heroic Effort modal ──────────────────────────────────────────────────────
function bindChallengeModal() {
  $('#chal-accept').onclick = () => A.acceptChallenge();
  $('#chal-decline').onclick = () => A.declineChallenge();
  // A hold counts itself down — tapping does nothing, and that is correct.
  $('#chal-tap').onclick = () => { if (state.challenge?.mode !== 'hold') A.tickChallenge(1); };
  // Leave a set you started. It resolves as declined — no reward — so nothing
  // is handed out that was not earned, but nobody is ever stuck watching a clock.
  $('#chal-skip').onclick = () => A.declineChallenge();
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' && state.challenge?.status === 'active' && state.challenge.mode !== 'hold') {
      e.preventDefault(); A.tickChallenge(1);
    }
  });
}

function bindWarmup() {
  $('#warm-pause').onclick = () => A.pauseWarmup();
  $('#warm-skip').onclick = () => A.skipStretch();
  $('#warm-done').onclick = () => A.finishWarmup({ early: true });
}

function bindOath() {
  $('#oath-accept').onclick = () => A.acceptOath();
  $('#oath-decline').onclick = () => A.breakOath({ declined: true });
  $('#oath-keep').onclick = () => A.keepOath();
  $('#oath-quit').onclick = () => A.breakOath();
  // The Oath clock is wall-time, not state changes — it needs its own heartbeat.
  setInterval(() => { if (A.oathActive()) renderOath(); }, 1000);
}

let chalTimer = null;
// The whole premise is that your hands are on the floor, so a rep challenge
// opens the microphone by itself — counting out loud is the ONLY input that
// works mid-push-up, and leaving it behind a checkbox meant most players never
// found it. Whatever the mic was doing before, it goes back to that afterwards.
let micWasOpenedForChallenge = false, chalMicTimer = null;
function syncChallengeMic(c) {
  const wantsEar = !!c && c.status === 'active' && c.mode !== 'hold' && voice.supported;
  if (wantsEar && !voice.listening && !voice.handsFree) {
    micWasOpenedForChallenge = true;
    startListening(speakTurn);
    // The DM has usually just finished saying "ten push-ups, go", so the ear is
    // inside its echo tail and that first call is deferred. Keep asking until it
    // actually opens — the player is already counting.
    clearInterval(chalMicTimer);
    chalMicTimer = setInterval(() => {
      if (!micWasOpenedForChallenge || voice.listening) { clearInterval(chalMicTimer); chalMicTimer = null; return; }
      startListening(speakTurn);
    }, 300);
  } else if (!wantsEar && micWasOpenedForChallenge) {
    clearInterval(chalMicTimer); chalMicTimer = null;
    micWasOpenedForChallenge = false;
    if (!voice.handsFree) stopListening();
  }
}

function renderChallenge() {
  const c = state.challenge;
  const m = $('#challenge-modal');
  syncChallengeMic(c);
  if (!c) { m.hidden = true; if (chalTimer) { clearInterval(chalTimer); chalTimer = null; } return; }
  m.hidden = false;
  const hold = c.mode === 'hold';
  $('#chal-title').textContent = hold ? `${c.seconds}s ${c.exercise.toUpperCase()}` : `${c.reps} ${c.exercise.toUpperCase()}`;
  $('#chal-reward').textContent = '→ ' + A.REWARDS[c.reward].label;
  $('#chal-reason').textContent = c.reason || '';
  const offered = c.status === 'offered';
  $('#chal-offer-row').hidden = !offered;
  $('#chal-active-row').hidden = offered;
  $('#chal-tap').classList.toggle('holding', hold);
  if (!offered) {
    $('#chal-count').textContent = hold ? `${c.reps - c.progress}s` : `${c.progress} / ${c.reps}`;
    const pct = (c.progress / c.reps) * 100;
    $('#chal-tap').style.setProperty('--pct', pct + '%');
    // Name every way in, and say which one is live right now.
    $('#ring-hint').textContent = hold
      ? 'HOLD IT — the clock is running'
      : voice.listening ? '🎙 COUNT OUT LOUD · or SPACE · or TAP'
      : voice.supported ? 'SPACE or TAP · say the count once the mic opens'
      : 'SPACE or TAP per rep';
    if (!chalTimer) chalTimer = setInterval(() => {
      if (state.challenge?.startedAt) $('#chal-time').textContent = Math.round((Date.now() - state.challenge.startedAt) / 1000) + 's';
    }, 250);
  }
}

// ── tabs ─────────────────────────────────────────────────────────────────────
function bindTabs() {
  document.querySelectorAll('.tab').forEach(tab => tab.onclick = () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.tabpane').forEach(p => p.hidden = p.id !== tab.dataset.pane);
  });
}

// ── the WebMCP inspector ─────────────────────────────────────────────────────
// The DM Panel used to be a rack of hand-wired buttons, which raised a fair
// question: what is a player supposed to do with it? This is the answer. It
// reads the LIVE registry off document.modelContext — not our own arrays — and
// builds a form for each tool out of that tool's own JSON Schema. Running one
// goes through executeTool, the identical path an external agent takes, and
// lands in the same Agent Log. Nothing here can do anything the DM cannot, and
// nothing the DM does can skip this surface.

const mcCtx = () => document.modelContext || navigator.modelContext || null;

// Tools we have drawn, so a re-render does not wipe what someone half typed.
const openTools = new Set();
let lastSig = '';

function bindDMPanel() {
  $('#dm-auto').onchange = e => { state.settings.autoApprove = e.target.checked; };
  $('#dm-reset').onclick = () => { if (confirm('Reset the whole table?')) { localStorage.clear(); location.reload(); } };
  $('#ending-again').onclick = () => { localStorage.clear(); location.reload(); };
  renderMcp();
}

/** A control for one schema property — the schema is the source of truth. */
function fieldFor(name, spec, required) {
  const id = `mcp-f-${name}`;
  const req = required ? '<span class="mcp-req" title="required">*</span>' : '';
  const desc = spec.description ? `<span class="mcp-fd">${esc(spec.description)}</span>` : '';
  let input;
  if (Array.isArray(spec.enum)) {
    input = `<select id="${id}" data-k="${esc(name)}">` +
      (required ? '' : '<option value=""></option>') +
      spec.enum.map(v => `<option>${esc(String(v))}</option>`).join('') + '</select>';
  } else if (spec.type === 'number' || spec.type === 'integer') {
    input = `<input id="${id}" data-k="${esc(name)}" type="number" step="any">`;
  } else if (spec.type === 'boolean') {
    input = `<input id="${id}" data-k="${esc(name)}" type="checkbox">`;
  } else {
    input = `<input id="${id}" data-k="${esc(name)}" type="text">`;
  }
  return `<label class="mcp-field"><span class="mcp-fk">${esc(name)}${req}</span>${input}${desc}</label>`;
}

/** Read a tool's form back into the object executeTool wants. */
function argsFrom(form) {
  const args = {};
  form.querySelectorAll('[data-k]').forEach(el => {
    const k = el.dataset.k;
    if (el.type === 'checkbox') { if (el.checked) args[k] = true; return; }
    const v = el.value.trim();
    if (v === '') return;                       // omitted, not empty — let defaults stand
    args[k] = el.type === 'number' ? Number(v) : v;
  });
  return args;
}

async function renderMcp() {
  const box = $('#mcp-tools');
  const status = $('#mcp-status');
  if (!box) return;
  const ctx = mcCtx();

  if (!ctx || typeof ctx.getTools !== 'function') {
    status.className = 'mcp-status missing';
    status.innerHTML = '<b>No WebMCP surface in this browser.</b> The game still runs — ' +
      'the DM drives it through the same actions directly — but there is no registry to show.';
    box.innerHTML = '';
    return;
  }

  const tools = await ctx.getTools();
  const mode = agentState.mode;
  status.className = 'mcp-status ' + mode;
  status.innerHTML =
    `<b>${tools.length} tools live</b> on <code>document.modelContext</code> · ` +
    `${mode === 'native' ? 'native browser implementation' : 'vendored polyfill (MIT)'}` +
    (state.combat.active ? ' · <b>combat toolset registered</b>' : '') +
    (state.downed ? ' · <b>death save registered</b>' : '');

  // Only redraw when the registry itself changes — otherwise typing in a form
  // would be wiped every time the board emits.
  const sig = tools.map(t => t.name).join(',');
  if (sig === lastSig) return;
  lastSig = sig;

  box.innerHTML = tools.map(t => {
    const ro = t.annotations?.readOnlyHint;
    const props = t.inputSchema?.properties || {};
    const required = t.inputSchema?.required || [];
    const keys = Object.keys(props);
    const fields = keys.length
      ? keys.map(k => fieldFor(k, props[k], required.includes(k))).join('')
      : '<p class="mcp-none">No arguments.</p>';
    return `<details class="mcp-tool${ro ? ' ro' : ''}" data-tool="${esc(t.name)}"${openTools.has(t.name) ? ' open' : ''}>
      <summary><code>${esc(t.name)}</code>${ro ? '<span class="mcp-tag ro">read-only</span>' : ''}</summary>
      <p class="mcp-desc">${esc(t.description || '')}</p>
      <form class="mcp-form">${fields}
        <button class="btn mcp-run" type="submit">▶ Run through executeTool</button>
      </form>
      <pre class="mcp-out" hidden></pre>
    </details>`;
  }).join('');

  box.querySelectorAll('.mcp-tool').forEach(d => {
    d.ontoggle = () => d.open ? openTools.add(d.dataset.tool) : openTools.delete(d.dataset.tool);
  });

  box.querySelectorAll('.mcp-form').forEach(form => {
    form.onsubmit = async e => {
      e.preventDefault();
      const det = form.closest('.mcp-tool');
      const out = det.querySelector('.mcp-out');
      const btn = form.querySelector('.mcp-run');
      const name = det.dataset.tool;
      out.hidden = false; out.className = 'mcp-out'; out.textContent = 'running…';
      btn.disabled = true;
      try {
        const live = await ctx.getTools();
        const tool = live.find(t => t.name === name);
        if (!tool) throw new Error('That tool is no longer registered.');
        // This polyfill takes the input as a JSON string; the spec says object.
        const raw = await ctx.executeTool(tool, JSON.stringify(argsFrom(form)));
        const res = typeof raw === 'string' ? JSON.parse(raw) : raw;
        out.className = 'mcp-out ' + (res?.error ? 'bad' : 'good');
        out.textContent = JSON.stringify(res, null, 1);
      } catch (err) {
        out.className = 'mcp-out bad';
        out.textContent = String(err?.message || err);
      } finally { btn.disabled = false; }
    };
  });
}

function renderDM() {
  $('#dm-auto').checked = state.settings.autoApprove;
  renderMcp();
}

// ── the warm-up ──────────────────────────────────────────────────────────────
// Something is always moving here: the ring drains a second at a time, the cue
// swaps, and the breath pacer runs a 4-in / 4-out cycle underneath it.
const BREATHS = ['Breathe in…', 'Breathe in…', 'and hold', 'Breathe out…', 'Breathe out…', 'and settle'];
function renderWarmup() {
  const w = A.currentStretch();
  const el = $('#warmup');
  el.hidden = !w;
  if (!w) return;
  $('#warm-eyebrow').textContent = w.paused ? '⏸ PAUSED' : '🤸 WARM-UP';
  $('#warm-step').textContent = `${w.index + 1} / ${w.of}`;
  $('#warm-name').textContent = w.name;
  $('#warm-cue').textContent = w.cue;
  $('#warm-note').textContent = w.note;
  $('#warm-count').textContent = w.remaining;
  $('#warm-ring').style.setProperty('--pct', `${((w.hold - w.remaining) / w.hold) * 100}%`);
  $('#warm-breath').textContent = w.paused ? '—' : BREATHS[Math.floor((w.hold - w.remaining) / 2) % BREATHS.length];
  // w.index walks the plan's sequence, not STRETCHES — currentStretch() hands
  // us the resolved next name, because the two are no longer the same list.
  $('#warm-next').textContent = w.next ? `next · ${w.next}` : 'last one';
  $('#warm-pause').textContent = w.paused ? 'Resume' : 'Pause';
}

// ── beat cleared ─────────────────────────────────────────────────────────────
// Finishing a beat used to be one line in the log, which is no reward at all for
// the hardest thing in the run. It now raises a banner naming what you earned —
// and it is deliberately NOT a modal: it lands, it reads, it leaves, and play
// never stops to acknowledge it.
let msShownAt = 0, msTimer = null;
function renderMilestone() {
  const m = state.milestone;
  const el = $('#milestone');
  if (!el || !m || m.t === msShownAt) return;
  msShownAt = m.t;

  // The LEVEL is the headline — it is the part that lasts. Everything else is
  // the spoils underneath it.
  $('#ms-step').textContent = `BEAT ${m.beatNumber} OF ${m.of}`;
  $('#ms-level').textContent = `LEVEL ${m.level || 2}`;
  $('#ms-title').textContent = m.honorific ? `${m.title} · ${m.honorific}` : m.title;
  const chips = [];
  if (m.hpGain) chips.push(`<span class="ms-chip heal">❤️ +${m.hpGain} max health, all back to full</span>`);
  if (m.boon) chips.push(`<span class="ms-chip boon">⚡ ${esc(m.boon)}</span>`);
  (m.items || []).forEach(i => chips.push(`<span class="ms-chip">🎁 ${esc(i)}</span>`));
  if (m.gold) chips.push(`<span class="ms-chip">🪙 ${m.gold} gold</span>`);
  $('#ms-rewards').innerHTML = chips.join('');

  el.hidden = false;
  clearTimeout(msTimer);
  msTimer = setTimeout(() => { el.hidden = true; }, 7000);
}

// ── an Oath ──────────────────────────────────────────────────────────────────
function renderOath() {
  const o = state.oath;
  const el = $('#oath');
  el.hidden = !o;
  if (!o) return;
  $('#oath-label').textContent = o.label;
  $('#oath-reason').textContent = o.reason || `${o.minutes} minutes. The table will wait.`;
  const active = o.status === 'active';
  $('#oath-offer').hidden = active;
  $('#oath-active').hidden = !active;
  if (active) {
    const ms = A.oathRemaining();
    const s = Math.ceil(ms / 1000);
    $('#oath-clock').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const keep = $('#oath-keep');
    keep.disabled = ms > 0;
    keep.textContent = ms > 0 ? 'Done — I kept it' : '✓ Done — I kept it';
  }
}

// ── the quest rail ───────────────────────────────────────────────────────────
// Five beats under the header, so "what am I doing and how far in am I?" is
// answerable at a glance without reading the story log.
function renderQuest() {
  const q = A.getQuest();
  const rail = $('#quest-rail');
  rail.hidden = q.status !== 'active';
  if (!rail.hidden) {
    const beats = q.completed.length + (q.current ? 1 : 0);
    rail.innerHTML =
      `<div class="qr-name">✦ ${esc(q.name)}</div>` +
      `<div class="qr-beats">${QUEST_TITLES.map((t, i) => {
        const cls = i < q.completed.length ? 'done' : i === q.completed.length ? 'now' : '';
        const final = i === QUEST_TITLES.length - 1 ? ' final' : '';
        return `<div class="qr-beat ${cls}${cls === 'now' ? final : ''}" title="${esc(t)}"><span class="n">${i + 1}</span>${esc(t)}</div>`;
      }).join('')}</div>` +
      (q.current ? `<div class="qr-objective"><b>Now:</b> ${esc(q.current.objective)}</div>` : '');
    void beats;
  }

  // a hero is down — the board is frozen
  const d = state.downed;
  const banner = $('#downed-banner');
  // While the rep ring is up it owns the screen — the banner would only shout over it.
  banner.hidden = !d || q.status !== 'active' || !!state.challenge;
  if (!banner.hidden) {
    $('#downed-who').textContent = `${d.name} is down.`;
    const pip = (n, total, cls) => Array.from({ length: total }, (_, i) =>
      `<span class="pip ${i < n ? cls : ''}"></span>`).join('');
    $('#downed-saves').innerHTML =
      `<span class="pip-label">SAVES</span>${pip(d.saves, 2, 'ok')}` +
      `<span class="pip-label" style="margin-left:14px">FAILS</span>${pip(d.fails, 3, 'bad')}`;
  }

  // the run is over
  const end = $('#ending');
  end.hidden = q.status === 'active';
  if (!end.hidden) {
    const won = q.status === 'won';
    $('#ending-eyebrow').textContent = won ? 'THE EMBER CROWN' : 'THE RUN ENDS';
    $('#ending-title').textContent = won ? 'The Crown is yours.' : 'They did not get up.';
    $('#ending-sub').textContent = won
      ? 'Five beats, one boss, and every rep you actually did along the way.'
      : 'Three failed death saves. The reps were always there — next run, take them.';
    const f = state.fitness;
    $('#ending-stats').innerHTML = [
      ['Beats cleared', q.completed.length],
      ['Total reps', f.totalReps],
      ['Heroic Efforts', f.challengesDone],
      ['Gold', state.party.gold],
    ].map(([k, v]) => `<div class="estat"><b>${v}</b><span>${k}</span></div>`).join('');
  }
}

// ── master render ────────────────────────────────────────────────────────────
function render() {
  renderHeader();
  renderWarmup();
  renderOath();
  renderQuest();
  renderLog();
  renderSay();
  renderMilestone();
  renderStarters();
  renderParty();
  renderAgent();
  renderDice();
  renderChallenge();
  renderDM();
}
