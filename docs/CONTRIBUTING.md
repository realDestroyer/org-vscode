# Contributing

Thanks for helping improve org-vscode.

## Standard workflow (recommended)

1. **Create or find an Issue**
   - Search first to avoid duplicates.
   - Write clear repro steps (what you expected vs what happened).

2. **Create a branch from `master`**
   - Branch naming examples:
     - `fix/<short-description>-<issue#>`
     - `feature/<short-description>-<issue#>`

3. **Make focused commits**
   - Keep changes scoped to the Issue.
   - Prefer small commits that are easy to review.

4. **Open a Pull Request (PR)**
   - Target `master`.
   - In the PR description, link the Issue with one of these keywords so GitHub can auto-close it on merge:
     - `Fixes #<issue-number>`
     - `Closes #<issue-number>`
     - `Resolves #<issue-number>`

5. **Review + merge**
   - Address review feedback.
   - Merge when checks pass and the change is approved.

## When it’s okay to be flexible

- **Very small changes** (typos, docs-only) may be handled with fewer steps in small repos.
- **Urgent fixes** may skip the Issue creation at first, but should still land via a PR when possible.

## Notes for this repo

- Avoid committing directly to `master` unless you intentionally choose to bypass review (e.g., quick solo maintenance). The default expectation is the PR workflow above.

## Release checklist (maintainers)

This repo bundles the extension into `dist/extension.js`. For a release, ensure the version bump and bundle are done on `master`.

1. **Merge to `master`**
    - Ensure CI/tests are green.

2. **Update docs**
   - Ensure user-facing docs reflect changes:
      - `README.md`
      - `docs/CHANGELOG.md`
      - `docs/howto.md` / `docs/roadmap.md` (as needed)

3. **Bump version**
    - Update the version in:
       - `org-vscode/package.json`
       - `org-vscode/org-vscode/package.json` (dev/test copy)

4. **Bundle + test**
    - From `org-vscode/`:
       - `npm run bundle`
   - From `org-vscode/org-vscode/` (dev/test copy):
      - `npm run test:unit`
      - `npm test`

5. **Package VSIX**
    - From `org-vscode/`:
       - `npx vsce package`

6. **Publish to VS Code Marketplace**
    - Requires a VSCE publisher token configured for `realDestroyer`.
    - From `org-vscode/`:
       - `npx vsce publish`

7. **Publish to OpenVSX**
    - Requires an OpenVSX token (commonly via `OVSX_PAT`).
    - From `org-vscode/`:
       - `npx ovsx publish -p $env:OVSX_PAT`
