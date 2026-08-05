# AI Agent Instructions

These instructions apply to coding agents working in this repository, including GPT-style agents and Claude-style agents.

## Repository layout

- Root package and published extension manifest: `package.json`
- Editable extension source used for bundling: `org-vscode/out/`
- Extension tests: `org-vscode/test/`
- Bundled runtime artifact: `dist/extension.js`
- Example/sample content belongs in `examples/` or synthetic test fixtures, not in personal Org files.

## Workflow

1. Start from an Issue when practical.
2. Create a branch from `master`.
   - Preferred names: `fix/<short-description>-<issue#>` or `feature/<short-description>-<issue#>`
3. Keep changes scoped to the Issue.
4. Run focused validation before finishing.
5. Open a PR targeting `master` and link the Issue with `Fixes #<issue>` or equivalent.

## Codebase rules

- Do not hand-edit `dist/extension.js` unless there is no alternative. Update source under `org-vscode/out/` and rebuild.
- If runtime code changes, run `npm run bundle` from the repository root.
- Prefer adding regression coverage in `org-vscode/test/` when fixing behavior bugs.
- Use generic task names and synthetic Org content in tests.
- Preserve existing public behavior unless the Issue specifically requires a change.

## Privacy and sample-data rules

- Never commit personal TODOs, real work items, private file paths, or sensitive Org content from `Test Org Files/`.
- Do not copy personal tasks into tests, issue writeups, PR descriptions, screenshots, or docs.
- Replace real content with neutral examples such as `Parent A`, `Parent B`, `Duplicate task`, or similar synthetic fixtures.
- If reproducing a bug discovered in a personal Org file, translate it into a generic minimal example before committing.

## Validation commands

From the repository root:

- `npm run bundle`
- `node .\org-vscode\test\runTest.js`
- `npm test`
- `npm run test:unit`

Use the narrowest command that validates the touched area, but ensure at least one executable validation runs before finishing when code changes.

## PR hygiene

- Keep commits focused and reviewable.
- Mention behavior change and validation performed.
- Keep PR examples generic and privacy-safe.