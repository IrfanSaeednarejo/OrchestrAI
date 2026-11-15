# Step Report — Phase XX Step Y — <title>

1. Planned vs done (one line per planned item; mark anything not done)
2. Files changed: paste raw `git diff --stat` and `git status`. Every file not in the plan must be listed and justified.
3. Tier 1 decisions made (list)
4. Tier 2 items needed (should be none unless approved; otherwise STOP, do not continue)
5. Verification — raw, unabridged output, no `...`:
   - `npm run lint`
   - `npm run typecheck`
   - `npm test`   (state the test count; it must be >= the baseline in STATUS.md)
6. Acceptance criteria from the plan: pass/fail per criterion, with the test name or command that proves it
7. Problems noticed (even non-blocking or out of scope): flag + recommendation, no unrequested fixes
8. Docs updated: STATUS.md, ROADMAP.md, DECISIONS.md / OPEN-DECISIONS.md as applicable
9. Commit hash(es)
