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
