// ── Arcana Table · UI panels ─────────────────────────────────────────────────
// Story log, party sheet, manual DM panel, agent log, approvals, dice overlay,
// and the Heroic Effort challenge modal (tap / spacebar rep counter).

import { state, MAPS } from './state.js';
import * as A from './actions.js';
import { onChange } from './actions.js';
import { agentState, pendingApprovals, settleApproval } from './tools.js';
import { chat, sendToDM, openScene } from './dm.js';
import { voice, startListening, stopListening, toggleHandsFree, shutUp, unlockAudio } from './voice.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const STARTERS = [
  'Look around and tell me what I see.',
  'I search the room for anything valuable.',
  'I draw my sword and advance carefully.',
];

function bindIntro() {
  const intro = $('#intro');
  if (!intro) return;
  $('#intro-go').onclick = async () => {
    voice.muted = $('#intro-mute').checked;
    // This click is the browser's required gesture — spend it on the DM's voice.
    if (!voice.muted) await unlockAudio();
    intro.hidden = true;
    render();
    openScene();                       // now its first line will actually be heard
  };
}

function renderStarters() {
  const el = $('#starters');
  // Build once and only toggle visibility. (Emptying it while the DM was busy
  // opening the scene used to leave the row permanently blank.)
  if (!el.dataset.built) {
    el.dataset.built = '1';
    el.innerHTML = STARTERS.map((t, i) => `<button class="starter" data-i="${i}" type="button">${esc(t)}</button>`).join('');
    el.querySelectorAll('.starter').forEach(b => b.onclick = () => speakTurn(STARTERS[+b.dataset.i]));
  }
  el.hidden = chat.busy || chat.messages.some(m => m.role === 'user');
}

export function initUI() {
  bindTabs();
  bindDMPanel();
  bindChallengeModal();
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
    return `<div class="say dm"><b>DM</b> ${esc(m.text)}</div>`;
  }).join('')
    + (chat.busy ? `<div class="say dm thinking"><b>DM</b> <span class="dots"><i></i><i></i><i></i></span></div>` : '')
    + (!chat.messages.length && !chat.busy ? `<div class="say sys">The table is set. Say what you do, and the Dungeon Master will answer.</div>` : '');
  el.scrollTop = el.scrollHeight;
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
}

// ── party panel ──────────────────────────────────────────────────────────────
function renderParty() {
  const el = $('#party-panel');
  const pcs = state.tokens.filter(t => t.kind === 'pc');
  const others = state.tokens.filter(t => t.kind !== 'pc');
  el.innerHTML = pcs.map(t => `
    <div class="pc-card">
      <div class="pc-head"><b>${esc(t.name)}</b><span>AC ${t.ac ?? '—'}</span></div>
      <div class="hp-row"><div class="hp-bar"><div style="width:${(t.hp / t.maxHp) * 100}%"></div></div><span>${t.hp}/${t.maxHp}</span></div>
      ${t.conditions.length ? `<div class="conds">${t.conditions.map(c => `<span class="cond">${esc(c)}</span>`).join('')}</div>` : ''}
      <div class="inv">${(t.inventory || []).map(esc).join(' · ') || '<i>empty pockets</i>'}</div>
    </div>`).join('')
    + `<div class="loot-card"><b>Party loot</b> — ${state.party.gold} gp<div>${state.party.loot.map(esc).join(' · ') || '<i>nothing yet</i>'}</div></div>`
    + (others.length ? `<div class="others"><b>On the board:</b> ${others.map(t => `${esc(t.name)} (${t.hp}/${t.maxHp})`).join(' · ')}</div>` : '');

  const f = state.fitness;
  $('#fitness-panel').innerHTML = `
    <b>💪 Heroic Effort</b>
    <div class="fit-row"><span>${f.totalReps}</span> total reps · <span>${f.challengesDone}</span> challenges</div>
    ${Object.entries(f.byExercise).map(([k, v]) => `<div class="fit-ex">${esc(k)} <b>${v}</b></div>`).join('') || '<div class="fit-ex"><i>No sweat spilled yet.</i></div>'}`;
}

// ── agent log + approvals ────────────────────────────────────────────────────
function renderAgent() {
  $('#agent-sub').textContent = chat.error
    ? '· built-in DM offline, DM panel still works'
    : chat.busy ? '· built-in DM is acting' : '· built-in DM + any external agent';
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
let lastDiceT = 0;
function renderDice() {
  const d = state.dice;
  if (!d || d.t === lastDiceT) return;
  lastDiceT = d.t;
  const ov = $('#dice-overlay');
  const die = $('#die');
  const label = $('#die-label');
  ov.hidden = false;
  ov.className = 'dice-overlay';
  label.textContent = d.reason || d.formula;
  let i = 0;
  const spin = setInterval(() => { die.textContent = 1 + Math.floor(Math.random() * d.sides); }, 60);
  setTimeout(() => {
    clearInterval(spin);
    die.textContent = d.rolls.length > 1 ? d.rolls.join('+') : d.rolls[0];
    $('#die-total').textContent = `= ${d.total}` + (d.mod ? ` (${d.mod > 0 ? '+' : ''}${d.mod})` : '') + (d.bonus ? ` (+${d.bonus} heroic)` : '');
    if (d.nat20) { ov.classList.add('nat20'); $('#die-total').textContent = '⭐ NATURAL 20!'; burst(); }
    if (d.nat1) ov.classList.add('nat1');
    if (d.boostsUsed.length) $('#die-boosts').textContent = d.boostsUsed.join(' · ');
    else $('#die-boosts').textContent = '';
    setTimeout(() => { ov.hidden = true; }, d.nat20 ? 3200 : 2200);
  }, 900);
}

function burst() {
  const ov = $('#dice-overlay');
  for (let i = 0; i < 24; i++) {
    const s = document.createElement('span');
    s.className = 'spark';
    s.textContent = ['✦', '★', '✧'][i % 3];
    s.style.setProperty('--dx', (Math.random() * 2 - 1).toFixed(2));
    s.style.setProperty('--dy', (Math.random() * 2 - 1).toFixed(2));
    s.style.animationDelay = (Math.random() * .2) + 's';
    ov.appendChild(s);
    setTimeout(() => s.remove(), 1600);
  }
}

// ── Heroic Effort modal ──────────────────────────────────────────────────────
function bindChallengeModal() {
  $('#chal-accept').onclick = () => A.acceptChallenge();
  $('#chal-decline').onclick = () => A.declineChallenge();
  $('#chal-tap').onclick = () => A.tickChallenge(1);
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' && state.challenge?.status === 'active') { e.preventDefault(); A.tickChallenge(1); }
  });
}

let chalTimer = null;
function renderChallenge() {
  const c = state.challenge;
  const m = $('#challenge-modal');
  if (!c) { m.hidden = true; if (chalTimer) { clearInterval(chalTimer); chalTimer = null; } return; }
  m.hidden = false;
  $('#chal-title').textContent = `${c.reps} ${c.exercise.toUpperCase()}`;
  $('#chal-reward').textContent = '→ ' + A.REWARDS[c.reward].label;
  $('#chal-reason').textContent = c.reason || '';
  const offered = c.status === 'offered';
  $('#chal-offer-row').hidden = !offered;
  $('#chal-active-row').hidden = offered;
  if (!offered) {
    $('#chal-count').textContent = `${c.progress} / ${c.reps}`;
    const pct = (c.progress / c.reps) * 100;
    $('#chal-tap').style.setProperty('--pct', pct + '%');
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

// ── manual DM panel ──────────────────────────────────────────────────────────
function bindDMPanel() {
  $('#dm-roll').onclick = () => A.rollDice({ formula: $('#dm-formula').value || 'd20', reason: 'Manual roll' });
  $('#dm-narrate').onclick = () => { const t = $('#dm-text').value.trim(); if (t) { A.narrate({ text: t }); $('#dm-text').value = ''; } };
  $('#dm-spawn').onclick = () => A.addToken({ name: $('#dm-name').value || 'Goblin', kind: 'monster', art: $('#dm-art').value, hp: 7, x: 11, y: 6 });
  $('#dm-combat').onclick = () => state.combat.active ? A.endCombat() : A.startCombat({});
  $('#dm-scene').onchange = e => A.setScene({ mapId: e.target.value, title: MAPS[e.target.value].name });
  $('#dm-reveal').onclick = () => { state.tokens.filter(t => t.kind === 'pc').forEach(t => A.revealArea({ x: t.x, y: t.y, radius: 5 })); };
  $('#dm-challenge').onclick = () => {
    const ex = $('#dm-exercise').value, reps = parseInt($('#dm-reps').value, 10) || 10, reward = $('#dm-reward').value;
    const r = A.proposeChallenge({ exercise: ex, reps, reward, reason: 'The table demands proof of heroism!' });
    if (r?.error) alert(r.error);
  };
  $('#dm-auto').onchange = e => { state.settings.autoApprove = e.target.checked; };
  $('#dm-reset').onclick = () => { if (confirm('Reset the whole table?')) { localStorage.clear(); location.reload(); } };
}

function renderDM() {
  $('#dm-combat').textContent = state.combat.active ? '⚔ End combat' : '⚔ Start combat';
  $('#dm-scene').value = state.scene.mapId;
}

// ── master render ────────────────────────────────────────────────────────────
function render() {
  renderHeader();
  renderLog();
  renderSay();
  renderStarters();
  renderParty();
  renderAgent();
  renderDice();
  renderChallenge();
  renderDM();
}
