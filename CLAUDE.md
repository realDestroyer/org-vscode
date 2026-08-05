# Claude Instructions

Follow the repository-wide instructions in `AGENTS.md`.

Priority guidance:

- Treat `AGENTS.md` as the canonical workflow and privacy policy for this repository.
- If you change runtime logic, edit source in `org-vscode/out/` and rebuild with `npm run bundle`.
- Add regression tests in `org-vscode/test/` when fixing behavior bugs.
- Never commit personal Org tasks or copy content from `Test Org Files/` into tests, docs, issues, PRs, or release notes.
- Use generic fixtures and examples only.