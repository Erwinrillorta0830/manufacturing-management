# Project Rules & Constraints

## ESLint & Workspace Hygiene
- **Do NOT modify `eslint.config.mjs`**: Custom rule overrides, disabling of typescript-eslint rules, or changing react warnings globally is strictly forbidden. Keep the configuration in its original base state.
- **Do NOT touch `src/components/ui/`**: No additions, modifications, or deletions of files inside the global components directory (`src/components/ui/`) are allowed in any PR.

## Markdown & Documentation Policy
- **Do NOT stage, commit, or push `.md` files to Git**: All markdown documentation, guides, reports, or notes created during assistance must remain local and ignored by Git (except essential repository files `README.md` and `CLAUDE.md`).

