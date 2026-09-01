// ── Arcana Table · UI panels ─────────────────────────────────────────────────
// Story log, party sheet, manual DM panel, agent log, approvals, dice overlay,
// and the Heroic Effort challenge modal (tap / spacebar rep counter).

import { state, MAPS } from './state.js';
import * as A from './actions.js';
import { onChange } from './actions.js';
import { agentState, pendingApprovals, settleApproval } from './tools.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function initUI() {
  bindTabs();
  bindDMPanel();
  bindChallengeModal();
  onChange(render);
  render('all');
  if (!state.log.length) {
    A.narrate({ text: 'Welcome to Arcana Table. Connect an agent as your co-DM — or run the table yourself from the DM panel. Torches are lit. The keep is waiting.' });
  }
  state.tokens.filter(t => t.kind === 'pc').forEach(t => A.revealAround(t.x, t.y, 3));
}

// ── header + scene ───────────────────────────────────────────────────────────
function renderHeader() {
  $('#scene-title').textContent = state.scene.title;
  $('#scene-mood').textContent = state.scene.mood;
  const badge = $('#agent-badge');
  badge.className = 'badge ' + (agentState.available ? 'on' : 'off');
  badge.innerHTML = agentState.available
    ? `● Agent-ready · ${agentState.registered.length} tools live`
    : `○ No WebMCP agent — DM panel active <span class="hint" title="Open this page in a WebMCP-enabled browser (Chrome 146+ with the WebMCP flag, or ChatGPT's browser) and your AI agent can co-DM through ${agentState.registered.length} registered tools.">?</span>`;

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

// ── story log ────────────────────────────────────────────────────────────────
const ICONS = { narrate: '📜', roll: '🎲', action: '👣', combat: '⚔️', loot: '💰', scene: '🗺️', challenge: '💪' };
function renderLog() {
  const el = $('#story-log');
  el.innerHTML = state.log.slice(-80).map(l =>
    `<div class="entry ${l.type}"><span class="ic">${ICONS[l.type] || '•'}</span><div><b>${esc(l.actor)}</b> ${esc(l.text)}</div></div>`
  ).join('');
  el.scrollTop = el.scrollHeight;
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
    A.proposeChallenge({ exercise: ex, reps, reward, reason: 'The table demands proof of heroism!' });
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
  renderParty();
  renderAgent();
  renderDice();
  renderChallenge();
  renderDM();
}
