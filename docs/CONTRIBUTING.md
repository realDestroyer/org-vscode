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

- Avoid committing directly to `master` unless you intentionally choose to bypass review (e.g., quick solo maintenance). The default expectation is the PR workflow above. Only Destroyer can publish to master.

Releases and Marketplace publishing are maintainer-managed and are outside the contributor workflow.

## Development and testing

Open the **repository root** (the folder containing `package.json`) in VS Code, not its parent folder or the nested `org-vscode/` directory. Run these commands from the repository root:

```sh
npm ci
npm run test:unit
npm test
```

- [`package.json`](../package.json) is the extension manifest and defines the build and test commands.
- [`org-vscode/src/`](../org-vscode/src/) is the editable JavaScript source. Do not edit the generated `dist/extension.js`.
- [`org-vscode/test/`](../org-vscode/test/) contains unit and extension-host tests. `npm test` builds the extension and runs the host suite with a pinned VS Code version and separate settings/extensions directories. On Windows, the [test runner](../org-vscode/test/runTest.js) uses `_orgvscode_testlink` and `_orgvscode_vscode_test` at the root of the repository's drive.
- `npm run bundle` refreshes `dist/extension.js`, `media/`, and `snippets/`. Edit webview assets and snippets in [`org-vscode/media/`](../org-vscode/media/) and [`org-vscode/snippets/`](../org-vscode/snippets/), not their generated copies.
- Use **Run and Debug → Extension** to build and open an Extension Development Host. Use sample files from [`examples/`](../examples/) to reproduce issues; keep personal Org files out of commits, test fixtures, and screenshots.
- GitHub documentation lives in [`docs/`](./) and uses media from [`Images/`](../Images/) and [`docs/images/`](images/). Only files listed in [the VSIX allowlist](../.vscodeignore) ship with the extension. If you add a runtime asset, update the allowlist and verify the resulting package.
