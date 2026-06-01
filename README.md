# 🧬 Andrew Variants

A small team of coding **variants** — the eventual Spider-Verse team — built on top of an
existing agent harness instead of a hand-rolled agent loop. There are four variants today:

| | Variant | Twist |
| --- | --- | --- |
| 🗿 | **Greek Sculpture Andrew** | calm, measured, classical — timeless solutions over trendy ones |
| 🐕 | **Dog Andrew** | loyal, eager, relentlessly encouraging energy |
| 🎭 | **Muppet Andrew** | warm, expressive, a little theatrical |
| 🧱 | **Lego Andrew** | modular and methodical — snap-together, composable pieces |

All four **share the same persona markdown** (`variant-config/andrew.identity.md` +
`andrew.coding.md` — "talks like me" / "codes like me"). They differ only by a small
**personality twist** layered on top in `src/persona.ts`. Edit the markdown to change every
variant at once; edit a twist to change just one.

## Overview

Each variant runs on the **[Claude Agent SDK](https://docs.claude.com/en/docs/agent-sdk/overview)**
(`@anthropic-ai/claude-agent-sdk`). It's the same agent loop, tool set, and context
management that powers Claude Code, exposed as a library — so we don't build file-editing,
bash execution, permissioning, or session memory ourselves. We only build the part that's
actually *our product*: the personas, the coordination, and the chat UX.

The SDK gives us two things that map directly onto the design:

- **Per-variant filesystem isolation** — each variant gets its **own home directory** at
  `/Users/andrew/MultiverseOS/{variant}` as its `cwd`. The harness only ensures that directory
  exists; the variant clones whatever repos it needs into it itself, so it can branch, commit,
  and push/pull completely independently of the other variants and of this project's own checkout.
- **Lifecycle signals** (task started / completed) for the async "ping me when done" UX.

```
profile-pics/
  greek-andrew.png  dog-andrew.png  muppet-andrew.png  lego-andrew.png
variant-config/
  andrew.identity.md   ← HOW EVERY ANDREW TALKS  (shared — "talks like me")
  andrew.coding.md     ← HOW EVERY ANDREW CODES  (shared — "codes like me")
src/
  persona.ts           the four variants = shared markdown + a per-variant twist
  workspace.ts         ensures each variant's own home directory under MULTIVERSE_ROOT
  guardrails.ts        blocks pushes to protected branches + destructive commands
  variant.ts           wraps the SDK agent loop as a stateful chat session
  chat.ts              terminal chat with one variant
  server.ts            Bun web server: variant list, profile pics, a websocket per thread
  web/index.html       the browser chat UI (sidebar of variants + chat pane)
```

### Per-variant home directories

Instead of sharing one checkout and isolating with git worktrees, **each variant owns a
dedicated home directory** on disk:

```
/Users/andrew/MultiverseOS/
  greek/    ← Greek Sculpture Andrew's home   (starts empty; it clones repos in here itself)
  dog/      ← Dog Andrew's home
  muppet/   ← Muppet Andrew's home
  lego/     ← Lego Andrew's home
```

On startup (terminal) or first connect (web), `src/workspace.ts` ensures the variant's
home directory exists — and nothing more. The variant itself clones whatever repos it needs
into that directory (`git clone …`), creates `andrew/<task-slug>` branches, commits, and
pushes/pulls on its own. One env var tunes this:

- `MULTIVERSE_ROOT` — base directory for the variant homes (default `/Users/andrew/MultiverseOS`).

## Getting Started

```bash
bun install
cp .env.example .env        # set one credential (below); MULTIVERSE_ROOT is optional
bun run web                 # chat UI at http://localhost:3000
```

`bun run web` opens the multi-variant chat in your browser. `bun run chat` is a single
variant in your terminal (pick which with `ANDREW_VARIANT=greek|dog|muppet|lego`). Add
`:dev` (`bun run web:dev`) to auto-reload on changes.

**Auth — pick one** (this runs on the Agent SDK, so either works):

- **Your Claude subscription** (Pro/Max, recommended): run `claude setup-token`
  (needs Claude Code installed + logged in), then put the `sk-ant-oat01-…` token in
  `.env` as `CLAUDE_CODE_OAUTH_TOKEN`. Usage bills against your plan, not API credits.
- **Pay-as-you-go**: set `ANTHROPIC_API_KEY` instead. If both are set, the API key
  wins — so leave it unset when using the subscription token.

### Getting a Claude OAuth token

To bill against your Claude subscription instead of API credits, mint a long-lived
OAuth token with Claude Code:

1. **Install Claude Code** if you don't have it: `npm install -g @anthropic-ai/claude-code`.
2. **Log in to your subscription**: run `claude` and sign in with the Claude account
   that has your Pro/Max plan (or run `/login` from inside it).
3. **Generate the token**: run `claude setup-token`. It opens a browser to authorize,
   then prints a token starting with `sk-ant-oat01-…`. It is **not** saved automatically,
   so copy it.
4. **Store it**: paste the token into `.env` as `CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-…`,
   and make sure `ANTHROPIC_API_KEY` is unset (it takes precedence if present).

The token is valid for about a year — re-run `claude setup-token` to refresh it.

## Using it

Each variant works in its **own home directory** under `MULTIVERSE_ROOT` (e.g.
`/Users/andrew/MultiverseOS/muppet`), created the first time you talk to it. It clones the
repos it needs in there itself. Pick a variant in the left sidebar and give them a task:

```
you › add a /health endpoint that returns build version, on a branch
🎭  ...streams the work...
✅ Muppet Andrew finished: added GET /health returning {status, version}
   review with:  git -C /Users/andrew/MultiverseOS/muppet diff
```

If a variant needs a decision it stops and asks instead of guessing (`⚠️ blocked: …`).

### Web UI

`bun run web` starts a [Bun](https://bun.sh) server (`src/server.ts`):

- `GET /` — the single-page chat app (`src/web/index.html`).
- `GET /variants` — JSON list of `{id, name, emoji, avatar}` for the sidebar.
- `GET /pics/<file>` — a profile pic from `profile-pics/`.
- `WS /ws?variant=<id>` — a live chat thread backed by one `Variant` for that persona.

The browser keeps **one websocket and message history per variant**, so you can flip
between threads like a messaging app. Streamed `text` events render live; `done` /
`blocked` / `error` events show as inline notices. `PORT` overrides the default `3000`.

## How the pieces fit the design

| Design goal | Where it lives |
| --- | --- |
| "Codes like me" | `andrew.coding.md` (shared); the target repo's own `CLAUDE.md` is also loaded and wins on project specifics |
| "Talks like me" | `andrew.identity.md` (shared) |
| Distinct teammates | per-variant `twist` in `persona.ts` (same shared markdown underneath) |
| Work on a branch, not `main` | persona rule + a dedicated per-variant home directory (`workspace.ts`) + `guardrails.ts` blocking protected-branch pushes |
| Async "notify me when done" | `DONE:` / `BLOCKED:` lines → `done` / `blocked` events surfaced in `chat.ts` and the web UI |
| Safe to run unattended | `canUseTool` denies force-push, `rm -rf /`, `git reset --hard`, `sudo`, etc. |

## Scaling the team further

Adding a variant is one entry in the `VARIANTS` array in `src/persona.ts` (id, name, emoji,
avatar, twist) plus a profile pic in `profile-pics/`. The sidebar, routing, and a dedicated
home directory under `MULTIVERSE_ROOT/<id>` all follow automatically. For more divergence,
give a variant its own persona markdown instead of sharing the defaults.

> Verified against the Agent SDK's documented API (v0.3.x). Run `bun run typecheck` after
> `bun install` to confirm against the exact version you pull.
