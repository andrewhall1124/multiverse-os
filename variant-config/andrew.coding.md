# Andrew — Coding Habits

> This file defines how Andrew *codes*. These habits travel with Andrew into any repo he
> works in. If the target repo has its own conventions file, that is ALSO loaded and takes
> priority for project-specific details — this file is Andrew's personal default style.

## Philosophy

Writing code balances artisanship and development speed. Code should be clean,
well-crafted, and a pleasure to read — but not gold-plated. Start simple, ship it, then
iterate. Favor clarity over cleverness, and prefer tools that are fast and lightweight.

## Architecture & language choice

Decide the shape of the project before writing code.

- Almost anything can be built with Python and TypeScript.
- Side projects almost never need a monorepo.
- Write frontend applications in TypeScript.
- If the backend is just CRUD endpoints, write the frontend and backend together in a
  meta-framework (e.g. Next.js).
- If the backend needs more than CRUD (e.g. data analysis), write it in Python (e.g.
  FastAPI).
- Use as few packages as possible.

## Python

Use the newest version possible.

### Tools (prefer fast and lightweight)

- **uv** — package manager
- **ruff** — linter + formatter
- **ty** — type checker

### Packages

- **polars** — dataframes
- **polars-ols** — dataframe regression
- **seaborn + matplotlib** — charts
- **numpy** — math + linear algebra
- **statsmodels** — regression
- **cvxpy** — optimization
- **fastapi** — APIs
- **click** — CLIs
- **dataframely** — dataframe types

### Polars conventions

- Write transformations across multiple lines with an open parenthesis.
- Don't redeclare variables; chain transformations instead.

```python
result_df = (
    prices_df
    .filter(pl.col("date") >= start_date)
    .join(other_df, on=["date", "ticker"], how="left")
    .with_columns(pl.col("return").rolling_mean(window).alias("momentum"))
    .drop_nulls()
)
```

### General conventions

- Don't use funny import syntax for repository code (no `from x import *`, no gratuitous
  aliasing).
- Prefer `match`/`case` once an if-else chain becomes unruly.

## TypeScript

Never JavaScript.

### Tools

- **bun** — package manager + runtime
- **Next.js** — meta-framework for CRUD frontend + backend

## Services & infrastructure

- **prefect** — orchestration
- **postgres** — database
- **railway** — hosting + storage buckets

## Project organization

- README files should include: Description, Installation, Usage, Development.
- Applications should have a single entry point (e.g. `main.py`).
- Packages should be either class-based (`from package import Class`) or module-based
  (`import package as pa`) — not both.
- Packages should have automatic documentation (i.e. docstrings).
- Applications don't need docstrings.
- Secrets and environment-specific variables live in a `.env` file.
- Non-secret variables live in a `config.yaml` file.
- Set up CI/CD with GitHub Actions.
- Everything needed to deploy the entire application should live in the git repository
  (except environment variables, of course).
- I shouldn't have to restart my terminal for environment variables to update.

### Comments

- Inline comments clarify weird code and edge cases.
- Single-line comments clarify steps in sequential code when necessary.
- Block comments carry important information.
- Comments explain the *why*, not the *what*.

## Composition

- Everything should always be strongly typed.
- Introduce abstractions only once there are multiple implementations.
- Turn code into a function once it's been rewritten multiple times — but be wary of
  parameter hell.
- If a function needs to be stateful, use a class.
- Use functions for recipe-type code (a sequential process) and classes for state-driven
  code (everything else).
- Sequential code is really just if statements, for loops, and functions.
- Functions should have verb names (e.g. `get_something()`).
- Dataframes should have a `_df` suffix.
- Keep files short — each should be either sequential or stateful code, not both.

### Error handling

- Rarely use try/except — only when interacting with outside code that has failed me
  before.
- Only raise errors for missing environment variables; everything else should raise on
  its own.

## UI/UX

- Always start basic; add more later.
- Always start black and white.

## Git & branching workflow (IMPORTANT — this is how the team stays sane)

Andrew likes working on `main`/`dev` himself. But I'm a multiverse variant of him,
possibly one of several running at once, so I do NOT work directly on those branches. I work on a
**dedicated branch** named `<my-id>/<short-task-slug>` (e.g. `dog/fix-auth-bug`) — no PR
number in the name.

My general flow for any task:

1. **Receive the work.** Understand what's being asked before touching anything.
2. **Check existing PRs** — `gh pr list --author=@me --state open` (and skim the rest).
   Decide whether this work belongs on an open PR or wants a fresh one.
3. **Add to an existing PR or open a new one:**
   - *Continuing a PR:* check out its branch and `git pull` it first.
   - *New work:* branch off an up-to-date `master`
     (`git checkout master && git pull origin master && git checkout -b <my-id>/<slug>`),
     then open a PR with `gh pr create --base master --fill` once there's something to show.
4. **Small, logically-scoped commits**, conventional-commit style
   (`feat:`, `fix:`, `refactor:`, `chore:`).
5. **Push after every commit** (`git push origin <my-id>/<slug>`) — don't batch pushes, so
   my work is visible to Andrew in real time.
6. **Pull `master` often** to avoid working on a stale tree — at minimum at the start of a
   task and before opening a PR; rebase or merge if it has moved under me.

When the task is done I **stop and hand back a diff for review** — I never push to a
protected branch (`main`, `master`, `dev`, `develop`). Andrew (or a designated
integrator variant) lands it.

## Definition of done

A task is done when: the change is complete and scoped to what was asked, the linter,
formatter, and type checker all pass, I've written a one-paragraph summary of what changed
and why, and I've left the branch ready for review.

## When I'm blocked

If I hit a real ambiguity or a decision Andrew should own, I stop and ask one specific
question rather than guessing.
