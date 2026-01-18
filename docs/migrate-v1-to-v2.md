# Migrate from v1 → v2

Org-vscode v2 exists to make your files more interoperable with Emacs Org-mode (and other Org tooling) while keeping the fast keyboard-driven workflow in VS Code.

## Why v2 exists

Early org-vscode versions leaned on a few convenience formats that were *not* standard Org:

- Tags stored in legacy bracket blocks like `[+TAG:FOO,BAR]` instead of end-of-headline `:FOO:BAR:`.
- Planning stamps (`SCHEDULED`, `DEADLINE`, `COMPLETED`) sometimes lived inline on the headline instead of the canonical planning line below.
- Completion stamps used `COMPLETED:` instead of Org’s conventional `CLOSED:`.

Those formats worked inside this extension, but they reduce compatibility with Emacs Org-mode and other editors/parsers.

v2 aligns with common Org conventions:

- **Tags:** end-of-headline `:TAG1:TAG2:`
- **Planning metadata:** lives on the indented line directly under the heading
- **Completion stamp:** `CLOSED:` (legacy `COMPLETED:` still parses, but `CLOSED:` is canonical)

## What the migration command does

Run **Org-vscode: Migrate File to v2 Format** on a file that still contains legacy constructs.

It performs an explicit, one-time rewrite:

- Converts legacy inline tag blocks:
  - `[+TAG:FOO,BAR]` → `:FOO:BAR:` (Emacs style)
- Normalizes planning stamps:
  - Inline `SCHEDULED:` / `DEADLINE:` / `CLOSED:` moved to the next planning line under the heading
- Converts completion stamps:
  - `COMPLETED:` → `CLOSED:`

It is intentionally **not** a background/automatic rewrite: you opt in per file.

## How to migrate

1. Open a legacy `.org` file.
2. Run **Org-vscode: Migrate File to v2 Format** from the Command Palette.
3. Review the changes and commit them.

Tip: If you’re migrating many files, do it one file at a time and commit in small batches.

## Before / After examples

### Tags

Before (legacy):

```org
* TODO Task title [+TAG:WORK,URGENT]
```

After (v2 / Emacs style):

```org
* TODO Task title :WORK:URGENT:
```

### Planning line

Before (legacy inline):

```org
* TODO Example task :PROJECT: SCHEDULED: [12-29-2025] DEADLINE: [01-31-2026]
```

After (v2 canonical planning line):

```org
* TODO Example task :PROJECT:
  SCHEDULED: <12-29-2025>  DEADLINE: <01-31-2026>
```

### Completion stamp

Before:

```org
  COMPLETED: [12-29-2025 Tue 13:05]
```

After:

```org
  CLOSED: [12-29-2025 Tue 13:05]
```

## Tag naming note (hyphens)

To keep Emacs-style tag match strings unambiguous (where `-TAG` means “NOT TAG”), tag names normalize hyphens to underscores:

- typing `test-tag` becomes `TEST_TAG`
- existing `TEST-TAG` migrates to `TEST_TAG`

## Related docs

- [How-To Guide](howto.md)
- [Roadmap](roadmap.md)
- [Changelog](CHANGELOG.md)
