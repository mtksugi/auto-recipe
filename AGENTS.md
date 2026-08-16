# Repository Guidelines

## Verification

- Run `pnpm check` after changing application code.
- Keep deployment out of verification; use `pnpm exec wrangler deploy --dry-run` when deployment configuration changes.

## Code Review Rules

- Flag duplicated business rules, normalization, authorization, or storage behavior when the copies could drift. Recommend an abstraction only when the code represents the same stable concept, not merely similar syntax.
- Treat user isolation, authentication, R2 key construction, and compatibility with existing recipe data as critical invariants. Report any change that can expose another user's data or make stored recipes unreadable.
- Require focused regression tests for behavior changes. Identify the specific untested failure path rather than requesting coverage mechanically.
