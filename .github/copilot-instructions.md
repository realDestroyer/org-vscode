# Copilot Instructions

This repository ships a VS Code extension. Follow these rules when making changes:

## Where to edit

- Edit extension source in `org-vscode/out/`.
- Add or update tests in `org-vscode/test/`.
- Treat `dist/extension.js` as generated output. Rebuild it from source with `npm run bundle` instead of editing it manually.

## Workflow expectations

- Prefer working from an Issue and a dedicated branch off `master`.
- Keep fixes narrow and behavior-focused.
- For bug fixes, add a regression test when practical.
- Target PRs at `master` and reference the issue with `Fixes #<issue>` or equivalent.

## Validation

- If runtime logic changes, run `npm run bundle`.
- Validate with the narrowest useful test, and use `node .\org-vscode\test\runTest.js` or `npm test` when extension behavior is affected.

## Privacy and fixtures

- Do not commit personal Org tasks or real private work items.
- Do not use content from `Test Org Files/` directly in committed tests or docs.
- Convert reproductions into generic fixtures under tests or `examples/`.
- Use neutral sample text such as `Parent A`, `Parent B`, `Example task`, and `Duplicate task`.

## Change style

- Match the existing code style.
- Avoid unrelated refactors.
- Prefer root-cause fixes over surface workarounds.