# Arcana Table

*Devpost write-up. Paste one section per header.*

**Tagline:** Play D&D with an AI Dungeon Master, and do real push-ups for your natural 20s.

---

## Inspiration

I've wanted to play D&D for years and nobody I know wants to DM. I've also got a set of dumbbells I walk past every day. At some point those two problems started to look like the same problem.

The first version of this was just a board that exposed some WebMCP tools and waited for you to bring your own agent. It was dead on arrival. You opened it and clicked buttons at yourself. What made it a game was putting an actual Dungeon Master in the seat, but making it go through the exact same tools an outside agent would have to use. Now when I say the tool surface is real, the DM playing the game is the evidence.

## What it does

You open the URL and you're playing. The DM (GPT with function calling, talking through OpenAI TTS) sets the scene. You type or say what you do. It answers on a cartoon battle map: narrates, moves the tokens, lifts the fog, drops monsters in, runs initiative, rolls dice where you can see them. Click the map and your party walks there. There's a five-beat quest called The Ember Crown so a session has an ending. Each beat you clear levels the party up, hands out loot, and heals everyone. The last one is a boss called the Cinder Wight.

The thing I actually care about is Heroic Effort. When a roll matters, the DM offers you a deal. Ten push-ups gets you +5 on the roll. Twenty-five gets you a natural 20. You count them on a big tap ring, or out loud if you're in hands-free mode because your hands are on the floor. There are timed holds too (a 30-second plank counts itself down), and a task list where it puts up three small things at once and you tick off whichever ones you did. Two out of three still pays.

And there's the Oath. If you can't exercise, or just don't want to today, you can pay with something real that the page can't see. Clear the sink. Twenty minutes of studying. The email you've been avoiding. The whole table locks for however many minutes you agreed to, and when you come back you click "I kept it" on your honour. It pays the same as push-ups. You can also set the table to "Oaths only" in the party panel and it will never ask you for anything physical, so the game works for people who can't do any of this.

If a hero drops to 0 HP, time stops. The board freezes and almost none of the tools work, including for the DM. You get out with a death save on a d20, or by doing a Heroic Effort, which always works. I like that effort is the guaranteed way out of dying. That's kind of the point of the whole thing.

## How we built it

It's plain JavaScript with no build step. Canvas for the board, localStorage for state. There's one Cloudflare Worker, about 200 lines, that holds the OpenAI key so it never ends up in a browser. It's locked to the site's origin and rate-limited per IP. The page ships the `@mcp-b/webmcp-polyfill` (MIT) so `document.modelContext` exists in any browser without a flag. If the browser has WebMCP natively, that takes over and the badge in the header says so.

There are 25 tools on `document.modelContext`. 21 are always there. Three more (`advance_turn`, `update_hp`, `apply_condition`) get registered when combat starts and unregistered when it ends. `death_save` only exists while somebody is bleeding out. Every tool is registered with an AbortController and removed with `abort()`, which fires `toolchange` the way the spec says. Read tools have `readOnlyHint`. The destructive ones, like deleting a token or damaging a player character, pause inside `execute()` until the player clicks approve. There's a 45-second timeout on that so a judge who walks away doesn't leave the DM hung forever.

The DM loop is about 180 lines. It calls `getTools()`, turns the result into OpenAI function specs, sends the conversation to the Worker, runs whatever tool calls come back through `executeTool()`, feeds the results back in, and repeats up to seven times before it has to say something. There's no other path for it to change the game. The DM Panel tab in the app shows you the same registry live, every tool with a form built from its JSON schema, and running one goes through the same `executeTool()` and shows up in the same log.

There's a Playwright test suite, 466 assertions in eleven files, that drives everything through the real `document.modelContext` in headless Chromium. It checks the registry growing and shrinking with combat, both approval paths, all the effort modes, a full five-beat run, and it samples pixels off the canvas. That last part exists because I once shipped a scope bug that made every monster disappear from the board and all 196 tests at the time still passed.

I used Claude (in Cowork) as a pair programmer for most of the build. A lot of the test suite and the refactoring described below came out of that.

## Challenges we ran into

Wiring up tools was the easy part. The hard part was that the model is a great storyteller and a bad referee. I'd put a rule in the system prompt, it would follow it for a few turns, and then it would drift. I told it to offer push-ups often. It didn't. I told it to move the tokens when the party moved. It described the walk and left everyone standing there. I told it not to change maps with `set_scene`. It walked the party into the forest that way, never called `advance_quest`, and the beat never paid out.

Every one of those got fixed the same way, and it turned into the rule for the whole project: if it matters, the tool enforces it. The `attack` tool checks reach, so if you swing from across the room it refuses and tells you which square to move to. The dice enforce pacing now. Two rolls without anything staked and `roll_dice` refuses once and tells the DM to make an offer first. The map only changes through `advance_quest`. Monsters take their own turn when initiative gets to them instead of waiting to be asked. The player's effort preference gates the effort tools directly, and there is on purpose no tool to change it, because an agent that can decide what it's allowed to ask of your body isn't respecting a preference.

The other big one was hands-free mode hearing itself. The DM would talk, the mic would pick it up, and it would come back as the player's turn. That took three separate layers of echo suppression and a test that fakes the SpeechRecognition API to replay the exact failure, since headless Chrome has no microphone.

## Accomplishments that we're proud of

Someone who has never seen this can open the link and play a real ten-minute dungeon with zero explanation. And when the DM offers push-ups for a natural 20, people stand up. Everyone I've tested it on has stood up.

The DM has no special access. It finds its tools with `getTools()` and uses them with `executeTool()` exactly like a ChatGPT or Claude agent would from outside. You can watch every single call in the log while you play.

I'm also glad I didn't fake verification on the Oath. The card literally says "Nothing here can check, which is rather the point." I could have added a webcam check. It would have limited the whole mechanic to things a camera can see, and the things people most need a push on (reading, practicing, that email) aren't those.

## What we learned

Rules belong in the tools, not the prompt. Every time I tried to fix behaviour with better wording it worked for a while. Every time I turned it into a counter or a refusal it stayed fixed. A good refusal that says what went wrong and what to call instead does more than a paragraph of instructions.

Passing tests don't mean the game works. I had 196 green assertions and no monsters on the screen. Now the suite looks at pixels, and I don't trust anything I haven't watched.

And accessibility turned out not to be a separate feature. Once the Oath paid the same as push-ups, "I can't exercise" stopped being a reason you couldn't play. It's a setting now.

## What's next for Arcana Table

Webcam rep counting with MediaPipe Pose, running in the browser, so push-ups count themselves. The Oath stays unverified on purpose. Multiplayer, with a few people sharing one DM. Campaign art generated per run from my ComfyUI setup. And I want to record a Claude or ChatGPT browser agent running the same dungeon through the same 25 tools, next to the built-in DM, because that comparison is the thing WebMCP makes possible and I haven't shown it yet.

---

**Built with:** JavaScript, HTML5 Canvas, WebMCP (`document.modelContext`, `@mcp-b/webmcp-polyfill`), OpenAI Chat Completions with function calling, OpenAI TTS, Web Speech API, Cloudflare Workers, Cloudflare Pages, Playwright.

**Try it:** https://arcana-table.pages.dev · **Source:** https://github.com/banksythequantLab/arcana-table
