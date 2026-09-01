# arcana-dm — the DM's brain

A ~120-line Cloudflare Worker that stands between the page and OpenAI so no API
key ever reaches a browser. It deliberately contains **no game logic**.

The page reads its own tool list from `document.modelContext.getTools()`, sends
it here with the conversation, and executes whatever tool calls come back
through that same WebMCP surface. The Worker just relays.

## Deploy

```bash
cd worker
wrangler deploy                      # creates https://arcana-dm.<subdomain>.workers.dev
wrangler secret put OPENAI_API_KEY   # paste the key at the prompt — it is never stored in the repo
```

Then put the Worker's URL in `js/dm.js` (`DM_ENDPOINT`).

Optional hourly per-IP cap:

```bash
wrangler kv namespace create RATE    # paste the id into wrangler.toml, uncomment the block
wrangler deploy
```

## Safety

- Requests are refused unless `Origin` is the live site, a `*.arcana-table.pages.dev`
  preview, or localhost.
- Body ≤ 96KB, ≤ 60 messages, ≤ 40 tools, ≤ 700 completion tokens per turn.
- Optional per-IP hourly cap via KV.
- The response is stripped to `content` / `tool_calls` — no key, no upstream metadata.

Without the secret set, the Worker returns a friendly 503 and the game stays
fully playable from the DM panel.
