# CLAUDE.md

Project conventions for any variant working in this repo. This file is auto-loaded by the
harness (`settingSources: ["project"]` in `src/variant.ts`) and **wins over the persona
defaults** on project specifics.

## What this project is

A small team of coding **variants** (Greek, Dog, Muppet, Lego Andrew) built on the
**Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`). The variants share one persona
(`variant-config/andrew.identity.md` + `andrew.coding.md`) and differ only by a per-variant
`twist` in `src/persona.ts`. This repo is **self-hosting**: the variants develop their own
codebase.

## Runtime & tooling

- **Runtime is [Bun](https://bun.sh), not Node.** Run TypeScript directly — there is no
  build step. Use `bun`, never `npm`/`npx`/`tsx`.
- Scripts: `bun run web` (chat UI), `bun run chat` (terminal), `bun run typecheck` (tsc).
- Add `:dev` for watch mode (`bun run web:dev`) — but see the self-hosting caveat below.

## Definition of done

Before calling any task done, **run `bun run typecheck` and make sure it passes** (exit 0).
There is no test suite or linter yet; if you add one, wire it into a script and run it too.

## Layout

```
src/
  persona.ts       the four variants = shared markdown + a per-variant twist
  variant.ts       wraps the SDK agent loop (the Variant class) as a chat session
  guardrails.ts    canUseTool: blocks protected-branch pushes + destructive commands
  chat.ts          terminal entry point
  server.ts        Bun web server (variant list, profile pics, websocket per thread)
  web/index.html   the browser chat UI (single file, inline CSS/JS)
variant-config/    the SHARED persona markdown (edit to change every variant)
profile-pics/      one <id>-andrew.png per variant
```

## Code conventions

- TypeScript, ES modules, `.js` import specifiers (NodeNext resolution — keep them).
- Match the surrounding file's style; keep comments about the *why*.
- Prefer the standard library / existing deps over adding new ones.
- Adding a variant = one entry in the `VARIANTS` array in `src/persona.ts` (id, name,
  avatar, twist) plus a matching `profile-pics/<id>-andrew.png`. Sidebar, routing,
  and worktree isolation follow automatically.

## Git workflow (non-negotiable)

- Each variant runs in its **own home directory** at `MULTIVERSE_ROOT/<id>` (default
  `/Users/andrew/MultiverseOS/<id>`, ensured empty by `src/workspace.ts`). Clone whatever
  repos you need there yourself, and do work on an **`andrew/<short-task-slug>` branch** —
  never commit to `main`/`master`/`dev`/`develop`.
- You may commit, push, and pull your `andrew/*` branch freely. Hand back a reviewable diff;
  never push to a protected branch (`guardrails.ts` enforces).
- **`.env` holds a real OAuth token and is gitignored — never stage, commit, or print it.**

## Self-hosting caveat

When working in THIS repo you are editing the harness that may be running you. Because each
variant operates in its own home directory under `MULTIVERSE_ROOT` (separate from the directory
the server runs from), self-edits won't disturb the live server — but still avoid `--watch`
scripts during self-edits, since a half-written save will hot-reload and crash a running server.
Run `bun run web` (no watch) while variants are working.
