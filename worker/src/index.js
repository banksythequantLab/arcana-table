// ── Arcana Table · DM brain proxy ────────────────────────────────────────────
// A thin Cloudflare Worker that lets the page talk to OpenAI without shipping a
// key to the browser. It holds NO game logic: the page sends the conversation
// plus the tool list it read from document.modelContext, and the model's tool
// calls are executed back in the page through the real WebMCP surface.

const MODEL_DEFAULT = 'gpt-5.6-luna';
const ALLOWED = [
  'https://arcana-table.pages.dev',
  'http://localhost:8788',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
];

// Keep a runaway tab (or a curious stranger) from spending real money.
const LIMITS = { bodyBytes: 96_000, messages: 60, tools: 40, maxTokens: 700 };

const cors = (origin) => ({
  'access-control-allow-origin': origin,
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
  'vary': 'Origin',
});

const json = (obj, status, origin) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors(origin) },
  });

function pickOrigin(req, env) {
  const o = req.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',') : ALLOWED).map(s => s.trim());
  if (allowed.includes(o)) return o;
  // Cloudflare Pages preview deployments: <hash>.arcana-table.pages.dev
  if (/^https:\/\/[a-z0-9-]+\.arcana-table\.pages\.dev$/.test(o)) return o;
  return null;
}

// Cloudflare's native rate limiter — a config-only binding, no KV namespace.
// If the binding is absent the Worker still runs, just uncapped.
async function rateLimited(req, env) {
  if (!env.RATE?.limit) return false;
  const ip = req.headers.get('CF-Connecting-IP') || 'anon';
  try {
    const { success } = await env.RATE.limit({ key: ip });
    return !success;
  } catch {
    return false;                                    // never fail a turn over the limiter
  }
}

const callOpenAI = (key, payload) =>
  fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify(payload),
  });

// Model families disagree about parameter names and which values they accept
// (max_tokens vs max_completion_tokens, fixed temperature, …). Rather than pin
// this Worker to one generation, read the complaint and retry once without the
// offending parameter — so swapping MODEL never silently breaks the table.
function healPayload(payload, message) {
  const p = { ...payload };
  const unsupportedParam = /Unsupported parameter: '([^']+)'/.exec(message || '');
  const unsupportedValue = /Unsupported value: '([^']+)'/.exec(message || '');
  const renameHint = /Use '([^']+)' instead/.exec(message || '');

  if (unsupportedParam) {
    const bad = unsupportedParam[1];
    const value = p[bad];
    delete p[bad];
    if (renameHint) p[renameHint[1]] = value;        // e.g. max_tokens → max_completion_tokens
    return p;
  }
  if (unsupportedValue) {
    delete p[unsupportedValue[1]];                   // e.g. temperature must stay default
    return p;
  }
  // "…set reasoning_effort to 'none'" — take the instruction literally.
  const setHint = /set (\w+) to '([^']+)'/.exec(message || '');
  if (setHint) { p[setHint[1]] = setHint[2]; return p; }
  // "…are not supported for <model>" naming a parameter we sent: drop it.
  const notSupported = /^(\w+) (?:is|are) not supported/.exec(message || '');
  if (notSupported && notSupported[1] in p) { delete p[notSupported[1]]; return p; }
  return null;                                       // nothing we know how to fix
}

export default {
  async fetch(req, env) {
    const origin = pickOrigin(req, env);
    if (req.method === 'OPTIONS') {
      return origin ? new Response(null, { status: 204, headers: cors(origin) })
                    : new Response('forbidden origin', { status: 403 });
    }
    if (!origin) return new Response('forbidden origin', { status: 403 });
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405, origin);
    if (!env.OPENAI_API_KEY) {
      return json({ error: 'The DM is not configured yet: set the OPENAI_API_KEY secret on this Worker.' }, 503, origin);
    }
    if (await rateLimited(req, env)) {
      return json({ error: "The table is busy — too many requests from your connection just now. Give it a minute, or keep playing from the DM panel." }, 429, origin);
    }

    const raw = await req.text();
    if (raw.length > LIMITS.bodyBytes) return json({ error: 'Request too large.' }, 413, origin);

    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: 'Malformed JSON.' }, 400, origin); }

    const messages = Array.isArray(body.messages) ? body.messages.slice(-LIMITS.messages) : null;
    const tools = Array.isArray(body.tools) ? body.tools.slice(0, LIMITS.tools) : [];
    if (!messages || !messages.length) return json({ error: 'No messages supplied.' }, 400, origin);

    let payload = {
      model: env.MODEL || MODEL_DEFAULT,
      messages,
      max_completion_tokens: Math.min(Number(body.max_tokens) || LIMITS.maxTokens, LIMITS.maxTokens),
      temperature: 0.9,
    };
    if (tools.length) {
      payload.tools = tools;
      payload.tool_choice = 'auto';
      payload.parallel_tool_calls = false;
      // Reasoning-capable models refuse function tools on /v1/chat/completions
      // unless reasoning is off. A DM wants fast and vivid, not deliberative.
      payload.reasoning_effort = 'none';
    }

    let upstream, text;
    try {
      upstream = await callOpenAI(env.OPENAI_API_KEY, payload);
      text = await upstream.text();

      // One self-heal pass for parameter disagreements between model families.
      for (let attempt = 0; attempt < 2 && !upstream.ok && upstream.status === 400; attempt++) {
        let msg = '';
        try { msg = JSON.parse(text)?.error?.message || ''; } catch { /* keep '' */ }
        const healed = healPayload(payload, msg);
        if (!healed) break;
        payload = healed;
        upstream = await callOpenAI(env.OPENAI_API_KEY, payload);
        text = await upstream.text();
      }
    } catch (e) {
      return json({ error: 'Could not reach the DM right now. The DM panel still runs the table.' }, 502, origin);
    }

    if (!upstream.ok) {
      let detail = text.slice(0, 300);
      try { detail = JSON.parse(text)?.error?.message || detail; } catch { /* keep raw */ }
      return json({ error: `The DM stumbled (${upstream.status}): ${detail}` }, upstream.status, origin);
    }

    let data;
    try { data = JSON.parse(text); } catch { return json({ error: 'Unreadable reply from the DM.' }, 502, origin); }

    // Hand back only what the page needs — no key, no upstream metadata.
    const choice = data.choices?.[0]?.message || {};
    return json({
      content: choice.content ?? '',
      tool_calls: choice.tool_calls ?? [],
      finish_reason: data.choices?.[0]?.finish_reason ?? 'stop',
      model: data.model,
    }, 200, origin);
  },
};
