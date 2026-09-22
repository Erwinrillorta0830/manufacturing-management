# Project Rules & Constraints

## ESLint & Workspace Hygiene
- **Do NOT modify `eslint.config.mjs`**: Custom rule overrides, disabling of typescript-eslint rules, or changing react warnings globally is strictly forbidden. Keep the configuration in its original base state.
- **Do NOT touch `src/components/ui/`**: No additions, modifications, or deletions of files inside the global components directory (`src/components/ui/`) are allowed in any PR.

## Markdown & Documentation Policy
- **Do NOT stage, commit, or push `.md` files to Git**: All markdown documentation, guides, reports, or notes created during assistance must remain local and ignored by Git (except essential repository files `README.md` and `CLAUDE.md`).

Read .agents\rules\manufacturing_guide.md then add task or checklist
if newly created files add it in .github\CODEOWNERS
Structure

- Only Modify Folder for that Module but u can read any files and if that module is referencing another route from another folder create a new route file for that or integrate it to current the folder route should be the same for module and api in their page src\app\(manufacturing-management)\mm