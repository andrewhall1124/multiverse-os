# Andrew Variants

Five coding variants built on the [Claude Agent SDK](https://docs.claude.com/en/docs/agent-sdk/overview). They share one persona markdown ("talks like me" / "codes like me") and differ only by a small personality twist layered on top.

| | Variant | Twist |
| --- | --- | --- |
| 🗿 | **Greco** (`greek`) | calm, measured, classical — timeless solutions over trendy ones |
| 🐕 | **Teddy** (`dog`) | loyal, eager, relentlessly encouraging |
| 🎭 | **Walter** (`muppet`) | warm, expressive, a little theatrical |
| 🧱 | **Emmet** (`lego`) | modular and methodical — snap-together, composable pieces |
| ⛏️ | **Steve** (`minecraft`) | high-energy, hype, Let's Play vibes |

## Quick start

```bash
bun install
cp .env.example .env     # fill in one credential (see Auth below)
bun run web              # → http://localhost:3000
```

`bun run chat` opens one variant in your terminal; set `ANDREW_VARIANT=greek|dog|muppet|lego|minecraft` to choose which. Add `:dev` to either script for auto-reload (`bun run web:dev`).

## Auth — pick one

**Claude subscription** (Pro/Max, recommended): mint an OAuth token with `claude setup-token` (needs [Claude Code](https://claude.ai/code) installed and logged in), then set `CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-…` in `.env`. Bills against your plan, not API credits. Token is valid ~1 year; rerun `setup-token` to refresh.

**Pay-as-you-go**: set `ANTHROPIC_API_KEY` instead. If both are present, the API key wins — leave it unset when using a subscription token.

## How it works

Each variant owns a dedicated home directory at `MULTIVERSE_ROOT/<id>` (default `/Users/andrew/MultiverseOS/<id>`). It clones repos in there itself, branches on `<id>/<task-slug>`, and commits/pushes independently. `src/guardrails.ts` blocks writes outside that directory, force-pushes, `rm -rf /`, and pushes to protected branches.

The shared persona lives in `variant-config/andrew.identity.md` (how to talk) and `andrew.coding.md` (how to code). Edit those to change every variant at once. Each variant's `twist` in `src/persona.ts` changes just that one.

```
variant-config/
  andrew.identity.md   ← HOW EVERY ANDREW TALKS  (edit to change all)
  andrew.coding.md     ← HOW EVERY ANDREW CODES  (edit to change all)
  <id>.personality.md  ← optional extended details per variant
src/
  persona.ts           variant definitions + system-prompt assembly
  variant.ts           Variant class wrapping the SDK agent loop
  guardrails.ts        canUseTool: confinement + destructive-command blocking
  workspace.ts         ensures each variant's home directory exists
  chat.ts              terminal entry point
  server.ts            Bun web server (variant list, profile pics, websocket per thread)
  web/index.html       browser chat UI (sidebar of variants + chat pane)
```

## Adding a variant

One entry in the `VARIANTS` array in `src/persona.ts` (id, name, avatar, twist) + a `profile-pics/<id>-andrew.png`. The sidebar, routing, and a home directory at `MULTIVERSE_ROOT/<id>` follow automatically. For more divergence, add a `variant-config/<id>.personality.md`.
