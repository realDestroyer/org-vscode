# Org-vscode External Consumer (Example)

A tiny reference extension that demonstrates how a third-party VS Code
extension integrates with the [org-vscode external API](../../docs/external-api.md).

It is intentionally minimal (~120 LOC, zero runtime dependencies) so you can
copy it as a starting point for real integrations such as:

- An email extension that captures messages into your org inbox
  ([Issue #110](https://github.com/realDestroyer/org-vscode/issues/110))
- A bug-tracker bridge that turns issue URLs into TODO entries
- A clipboard-watcher / "send to inbox" hotkey extension

## What it shows

| Capability | Where in `extension.js` |
|---|---|
| Resolving the org-vscode API safely | `getOrgApi()` |
| Registering a custom link scheme (`mailto:`) | `activate()` step 1 |
| Capturing a realistic email-shaped payload | `captureFromFakeInbox` command |
| Triggering the first-call trust prompt | `captureMinimal` command |
| Verifying the validation gate (security) | `tryMaliciousPayload` command |

## Running it

1. Make sure org-vscode is built and you have a dev host running it
   (`npm run bundle` in the org-vscode root, then launch with
   `code --extensionDevelopmentPath="<path-to-org-vscode>"`).
2. From a separate terminal, launch a **second** dev host with **both**
   extensions loaded:

   ```powershell
   code `
     --extensionDevelopmentPath="<path-to-org-vscode>" `
     --extensionDevelopmentPath="<path-to-org-vscode>/examples/external-consumer" `
     "<path-to-some-folder-with-org-files>"
   ```

   On macOS / Linux replace the backticks with `\`.

3. In the new window, configure org-vscode:
   - Set `Org-vscode.enableExternalCapture` to `true`
   - Set `Org-vscode.captureInboxFile` to a writable `.org` file (e.g.
     `inbox.org` inside the workspace).

4. Run any of the example commands from the palette:
   - **Org Consumer Example: Capture Minimal TODO** — first run will prompt
     you to allow this extension. Pick "Allow always" to persist the choice.
   - **Org Consumer Example: Capture Fake Email Into Org Inbox** — pick a
     message; check that it lands under `* Inbox` with `:EMAIL_*:` properties
     and a `[[mailto:...]]` link in the body.
   - **Org Consumer Example: Try Malicious Payload** — three known-bad
     payloads should each be rejected with `CaptureValidationError`.

## Round-tripping the mailto link

Once a fake email is captured, click the `[[mailto:...]]` link inside the
inbox file. org-vscode's link provider falls through to this extension's
registered handler, which surfaces an information message. In a real mail
extension you'd resolve the message ID and reveal it in your view.

## Anatomy of a capture payload

```js
await api.captureTodo({
  headline: "Reply to alice@example.com: Q3 budget review",
  tags: ["email"],
  body: "From: alice@...\n\nQuoted message body...\n\n[[mailto:<msg-id>][Q3 budget review]]",
  properties: {
    EMAIL_ID: "<msg-id>",
    EMAIL_FROM: "alice@example.com",
    EMAIL_DATE: "2026-04-28"
  }
});
```

The headline appears as the TODO title. Tags become trailing `:email:`
markers. Properties land in the entry's `:PROPERTIES:` drawer (org-vscode
adds `:CAPTURED:` and `:CAPTURED_BY:` automatically; user-supplied keys
that collide with those reserved names are rejected).

## Security notes

- The first call from this extension surfaces a modal trust prompt. The
  user can allow once, allow always, or deny.
- Disabling `Org-vscode.enableExternalCapture` blocks **all** external
  callers regardless of past trust decisions.
- Payloads are sanitized: `[[file:...]]` / `[[id:...]]` link injections
  and `#+BEGIN_SRC` blocks are rejected outright.
- See [SECURITY.md](../../SECURITY.md) for the full threat model.
