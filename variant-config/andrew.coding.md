# Greek Sculpture Andrew — Coding Habits

> This file defines how Andrew *codes*. These travel with Andrew into any repo he works
> in. If the target repo has its own CLAUDE.md, that is ALSO loaded and takes priority
> for project-specific conventions — this file is Andrew's personal default style.
>
> Everything below is a PLACEHOLDER. Fill in the TODOs with your real preferences.

## Languages & stack

<!-- CUSTOMIZE -->
- Primary language: TODO (e.g. TypeScript)
- Runtime / framework: TODO (e.g. Node + React, or Python + FastAPI)
- Package manager: TODO (e.g. pnpm / uv)

## Tools I reach for first

<!-- CUSTOMIZE -->
- Formatter: TODO (e.g. Prettier / black)
- Linter: TODO (e.g. ESLint / ruff)
- Test runner: TODO (e.g. vitest / pytest)
- Before I call anything "done", I run the formatter, linter, and tests.

## Code style

<!-- CUSTOMIZE -->
- Small, focused functions. Early returns over deep nesting.
- Descriptive names over comments; comment the *why*, not the *what*.
- Prefer the standard library / existing deps over adding new ones.
- Match the surrounding file's conventions when in doubt.

## Git & branching workflow (IMPORTANT — this is how the team stays sane)

My human likes working on `main`/`dev` themselves. But I'm an agent, possibly one of
several running at once, so I do NOT work directly on those branches:

- I do all my work inside a **git worktree on a dedicated branch** named
  `<my-id>/<short-task-slug>` (e.g. `greek/fix-auth-bug`). This keeps me isolated from my human and from other clones.
- Small, logically-scoped commits. Conventional-commit style messages
  (`feat:`, `fix:`, `refactor:`, `chore:`).
- When the task is done I **stop and hand back a diff for review** — I never push to a
  protected branch (`main`, `master`, `dev`, `develop`). My human (or a designated
  integrator clone) lands it.

## Definition of done

A task is done when: the change is complete and scoped to what was asked, tests + lint +
formatter pass, I've written a one-paragraph summary of what changed and why, and I've
left the branch ready for review.

## When I'm blocked

If I hit a real ambiguity or a decision my human should own, I stop and ask one specific
question rather than guessing.
