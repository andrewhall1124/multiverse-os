# Andrew — Coding Habits

> This file defines how Andrew *codes*. These travel with Andrew into any repo he works
> in. If the target repo has its own CLAUDE.md, that is ALSO loaded and takes priority
> for project-specific conventions — this file is Andrew's personal default style.

## Languages & stack

- Primary language: **Python** (data/quant work), **TypeScript** (multiverse-os)
- Python package manager: **uv**
- Data library: **Polars** (not pandas unless a dependency forces it)
- Orchestration: **Prefect** (flows + tasks pattern)
- TypeScript runtime: **Bun**

## Tools I reach for first

- Formatter + linter: **ruff** (Python), no separate black
- Type checker: **pyright** / `bun run typecheck` (TypeScript)
- Test runner: **pytest** (Python), **vitest** (TypeScript)
- Before calling anything done: formatter, type checker, tests all pass.

## Python code style

### Types

Full type annotations on every function signature. No exceptions.

```python
def compute_momentum(prices: pl.DataFrame, window: int = 252) -> pl.Series:
```

- Use `|` union syntax (Python 3.10+), not `Optional[X]` or `Union[X, Y]`
- Use `from typing import Protocol` for interfaces — prefer duck typing over ABC inheritance
- Custom type aliases via `TypeAlias` to name domain concepts:
  ```python
  from typing import TypeAlias
  Returns: TypeAlias = pl.DataFrame  # columns: date, ticker, return
  ```
- Date parameters: name them `date_` (trailing underscore) to avoid shadowing `datetime.date`
- Always `import datetime as dt`

### Naming

- Variables + functions: `snake_case`
- Classes: `PascalCase`
- Module-level constants: `UPPER_CASE`
- Private methods: `_leading_underscore`

### Imports

Standard library → third-party → local. One blank line between groups.

```python
import datetime as dt
import os

import polars as pl
import numpy as np
from prefect import flow, task

from pipelines.clients.alpaca import get_bars
from pipelines.utils import get_calendar
```

### Classes vs functions

- **Domain concepts** (strategies, optimizers, cost models, risk models) → classes with constructor injection:
  ```python
  class OptimizationStrategy(Strategy):
      def __init__(self, optimizer: MVO, alpha_provider: AlphaProvider | None = None): ...
  ```
- **Orchestration** (Prefect flows/tasks, ETL steps) → plain functions with decorators

### Config and settings

- Module-level `UPPER_CASE` constants for non-secret config
- `os.getenv()` + `load_dotenv()` for secrets — never hardcode
- No Pydantic settings classes, no dataclass configs

### Error handling

Raise only for:
1. Missing required environment variables or config
2. Critical data integrity violations (`raise ValueError(...)`)

Otherwise prefer null-filling, `drop_nulls()`, or returning empty DataFrames. No try/except around API calls.

### Docstrings

Don't write them. Type hints are the documentation.

### Polars style

Method chains with outer parentheses, not multiple reassignments:

```python
result = (
    df
    .filter(pl.col("date") >= start_date)
    .join(other, on=["date", "ticker"], how="left")
    .with_columns(
        pl.col("return").rolling_mean(window).alias("momentum")
    )
    .drop_nulls()
)
```

## Documentation

Before using any API you're uncertain about, fetch the current docs. Do not rely on
training data for exact method signatures — APIs change.

| Package | Docs |
|---|---|
| Polars | https://docs.pola.rs/api/python/stable/reference/ |
| alpaca-py | https://alpaca.markets/sdks/python/ |
| Alpaca REST API | https://docs.alpaca.markets/reference/ |
| Anthropic SDK | https://docs.anthropic.com/en/api/getting-started |
| Prefect | https://docs.prefect.io/v3/get-started/index |
| psycopg (v3) | https://www.psycopg.org/psycopg3/docs/ |
| cvxpy | https://www.cvxpy.org/api_reference/cvxpy.html |

## Git & branching workflow (IMPORTANT — this is how the team stays sane)

My human likes working on `main`/`dev` themselves. But I'm an agent, possibly one of
several running at once, so I do NOT work directly on those branches:

- I do all my work on a **dedicated branch** named `<my-id>/pr<N>-<short-task-slug>`
  (e.g. `dog/pr42-fix-auth-bug`), where `N` is the GitHub PR number. Including the PR
  number makes the branch easy to find in VS Code by typing the PR number.
- Small, logically-scoped commits. Conventional-commit style messages
  (`feat:`, `fix:`, `refactor:`, `chore:`).
- When the task is done I **stop and hand back a diff for review** — I never push to a
  protected branch (`main`, `master`, `dev`, `develop`). My human (or a designated
  integrator clone) lands it.

### How to get the PR number into the branch name from the start

Since GitHub assigns the PR number only after you push, use this flow at the **very
beginning of every task** to reserve the number:

```bash
VARIANT_ID="dog"          # your variant id
TASK_SLUG="short-slug"    # e.g. fix-auth-bug

# 1. Create branch + empty first commit + push
git checkout -b ${VARIANT_ID}/${TASK_SLUG}
git commit --allow-empty -m "chore: start ${TASK_SLUG}"
git push origin ${VARIANT_ID}/${TASK_SLUG}

# 2. Open a draft PR to reserve the number
gh pr create --draft --title "WIP: ${TASK_SLUG}" --body "" --base master
PR_NUM=$(gh pr view --json number -q .number)

# 3. Rename branch via the GitHub API — this also updates the PR's head ref
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
gh api repos/${REPO}/branches/${VARIANT_ID}/${TASK_SLUG}/rename \
  -X POST -f new_name="${VARIANT_ID}/pr${PR_NUM}-${TASK_SLUG}"

# 4. Sync the local branch name and tracking ref
git fetch origin
git branch -m ${VARIANT_ID}/${TASK_SLUG} ${VARIANT_ID}/pr${PR_NUM}-${TASK_SLUG}
git branch --set-upstream-to=origin/${VARIANT_ID}/pr${PR_NUM}-${TASK_SLUG} \
           ${VARIANT_ID}/pr${PR_NUM}-${TASK_SLUG}

# Now do real work on dog/pr42-short-slug.
# When done: gh pr edit --title "..." --body "..." && gh pr ready
```

## Definition of done

A task is done when: the change is complete and scoped to what was asked, tests + lint +
formatter pass, I've written a one-paragraph summary of what changed and why, and I've
left the branch ready for review.

## When I'm blocked

If I hit a real ambiguity or a decision my human should own, I stop and ask one specific
question rather than guessing.
