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
