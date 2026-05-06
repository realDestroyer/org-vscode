# Security Policy

## Reporting a vulnerability

Please **do not** file public issues for security-sensitive problems.

Instead, open a private security advisory on GitHub:

> https://github.com/realDestroyer/org-vscode/security/advisories/new

Or reach out via the contact addresses listed in the repository
maintainer profile. We will acknowledge receipt within a reasonable
window, agree on a remediation timeline, and credit the reporter at
their preference.

If you are reporting a chained vulnerability (org-vscode + a third-party
extension that integrates via the public API), please include both the
calling extension id and a minimal reproducer.

---

## Trust boundary

org-vscode runs in the VS Code extension host with the same OS-level
privileges as VS Code itself. The features below cross security-relevant
boundaries and are designed defensively:

| Feature | Trust boundary | Mitigation |
| ------- | -------------- | ---------- |
| Execute Src Block | Runs arbitrary code in `#+BEGIN_SRC` blocks. | Blocked when the workspace is not [Workspace Trusted](https://code.visualstudio.com/docs/editor/workspace-trust). Files listed in `Org-vscode.disableSrcExecutionInPaths` are also exempt; the inbox file is on that list by default. |
| Public API (`registerLinkType`, `captureTodo`) | Allows other VS Code extensions to write to your `.org` files and intercept link clicks. | Disabled by default (`Org-vscode.enableExternalCapture`). First use from each extension prompts for explicit per-workspace consent stored in `workspaceState`. Caller identity is determined by stack-walking against `vscode.extensions.all`, not by self-attestation. |
| Custom link schemes | A registered handler returns a URL that VS Code may follow. | URLs whose scheme is not in (`http`, `https`, `mailto`, `vscode`, `vscode-insiders`, `command`) are rendered as no-op clickable links rather than auto-followed. |
| Capture payloads | Untrusted strings from a third-party extension may carry hostile content. | `#+BEGIN_SRC` is rejected anywhere in `headline` and `body`; `[[file:...]]`, `[[id:...]]`, `[[*heading]]`, `[[#anchor]]` are rejected in user-supplied content. Control characters are stripped. Field lengths capped. Reserved properties (`CAPTURED`, `CAPTURED_BY`) cannot be overridden. |

---

## Threat model (non-exhaustive)

The following scenarios are explicitly considered when designing or
reviewing changes to the public API:

1. **Supply-chain laundering via Src Blocks.** A malicious extension uses
   `captureTodo` to plant a `#+BEGIN_SRC` block in the user's inbox; the
   user later clicks the *Execute Src Block* CodeLens and runs the
   payload. **Mitigations:** payload sanitization rejects `#+BEGIN_SRC`
   substrings in `headline` and `body`; the inbox file is in
   `disableSrcExecutionInPaths` by default; CodeLens suppression is
   honored by the executor as well, not just by the lens provider.

2. **Link-click hijacking.** A registered handler returns
   `url: "javascript:..."` or a custom scheme that triggers a
   privileged behavior in another extension. **Mitigations:** target
   schemes are restricted to the safelist above; unknown schemes are
   rendered as no-op tooltips so the user still sees the bracketed link
   text.

3. **Identity spoofing.** A malicious extension claims to be a trusted
   caller. **Mitigation:** caller id is derived from
   `Error.captureStackTrace` matched against `extensionPath` of every
   loaded extension; the API does not accept a caller id parameter.

4. **Cross-workspace privilege escalation.** A trust decision in one
   workspace leaks to another. **Mitigation:** decisions are stored in
   `workspaceState` only; a fresh workspace re-prompts.

5. **Path traversal.** A configured `captureInboxFile` points outside
   the workspace, or has an unexpected extension. **Mitigation:** the
   inbox path must resolve inside `vscode.workspace.workspaceFolders`
   and end with `.org` or `.vsorg`. Otherwise capture rejects.

6. **Resource exhaustion.** A buggy or hostile caller floods
   `captureTodo` with multi-megabyte bodies. **Mitigation:** field
   length caps are enforced before the file write.

---

## Out of scope

- Confidentiality of `.org` file contents at rest. The extension does
  not encrypt files or filter clipboard reads. Users storing sensitive
  data in `.org` files should use OS-level controls (file permissions,
  full-disk encryption, etc.).
- Org-mode link types not registered through the public API. Built-in
  schemes (`http`, `https`, `mailto`, `file`, `id`, `*heading`,
  `#anchor`) follow VS Code's normal link-following behavior.
- Behavior of third-party extensions you have explicitly granted
  capabilities to. Once a publisher is trusted in a workspace, they can
  capture content within the constraints documented above.

---

## Disabling the API entirely

To lock down the workspace:

```json
{
  "Org-vscode.enableExternalCapture": false
}
```

This blocks both the public `captureTodo` API and the
`org-vscode.captureTodo` command. Existing
`registerLinkType`-style schemes remain registered for the rest of the
session, but no new ones can be added until the setting is re-enabled
and the user re-confirms trust.

To revoke all per-extension trust decisions for a workspace, clear the
`org-vscode.externalApi.trust` key via VS Code's *Developer:
Inspect Extension Storage* command, or remove the workspace's
`.vscode/state` entry for this extension.
