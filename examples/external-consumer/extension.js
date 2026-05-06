// Reference consumer extension for org-vscode's external API.
//
// What this demonstrates:
//   1. Resolving the org-vscode API via vscode.extensions.getExtension(...).exports.
//   2. Registering a `mailto:` link handler so org links round-trip back to
//      this extension (registry fallthrough in orgLinkProvider).
//   3. Calling captureTodo with a realistic email-style payload.
//   4. Surfacing the trust-prompt UX (first call from this extension prompts
//      the user; their decision is persisted by org-vscode's trustStore).
//   5. Showing the validation gate by sending a known-bad payload.
//
// This is intentionally tiny (~120 LOC) and dependency-free so other
// extension authors can copy it as a starting point.

const vscode = require("vscode");

const ORG_EXTENSION_ID = "realDestroyer.org-vscode";
const FAKE_INBOX = [
  {
    id: "<CAFx-q3@mail.example.com>",
    from: "alice@example.com",
    date: "2026-04-28",
    subject: "Q3 budget review",
    snippet: "Hey, can you take a look at the Q3 numbers before Friday? I want to lock the deck before Monday's exec sync."
  },
  {
    id: "<7d2e9a@mail.example.com>",
    from: "ops@vendor.com",
    date: "2026-04-29",
    subject: "Service window confirmation",
    snippet: "Maintenance window confirmed for Sat 02:00-04:00 UTC. Ack required by EOD Friday."
  },
  {
    id: "<thread-413@mail.example.com>",
    from: "bob@example.com",
    date: "2026-04-29",
    subject: "Lunch?",
    snippet: "Free Thursday? New ramen place opened on 4th."
  }
];

async function getOrgApi() {
  const ext = vscode.extensions.getExtension(ORG_EXTENSION_ID);
  if (!ext) {
    throw new Error(`${ORG_EXTENSION_ID} is not installed.`);
  }
  if (!ext.isActive) {
    await ext.activate();
  }
  if (!ext.exports || typeof ext.exports.captureTodo !== "function") {
    throw new Error(`${ORG_EXTENSION_ID} did not expose its API. Update org-vscode to a version that supports the external API.`);
  }
  return ext.exports;
}

function activate(ctx) {
  // 1) Register a mailto: link handler. When the user clicks a [[mailto:...]]
  //    link inside an org file, org-vscode's link provider falls through to
  //    this handler.
  getOrgApi()
    .then((api) => {
      const disposable = api.registerLinkType({
        scheme: "mailto",
        open: async (uri) => {
          // In a real mail extension you'd resolve uri.path to a message
          // and reveal it in your custom view. Here we just show a notice.
          vscode.window.showInformationMessage(
            `[example] mailto handler invoked for: ${uri.toString()}`
          );
        }
      });
      ctx.subscriptions.push(disposable);
    })
    .catch((err) => {
      vscode.window.showWarningMessage(
        `Org consumer example: failed to register link handler: ${err.message}`
      );
    });

  // 2) Capture a "real-looking" email payload.
  ctx.subscriptions.push(
    vscode.commands.registerCommand("orgConsumerExample.captureFromFakeInbox", async () => {
      const api = await getOrgApi().catch((e) => {
        vscode.window.showErrorMessage(e.message);
        return null;
      });
      if (!api) return;

      const pick = await vscode.window.showQuickPick(
        FAKE_INBOX.map((m) => ({
          label: m.subject,
          description: m.from,
          detail: m.snippet,
          message: m
        })),
        { placeHolder: "Pick a fake message to capture" }
      );
      if (!pick) return;
      const m = pick.message;

      try {
        await api.captureTodo({
          headline: `Reply to ${m.from}: ${m.subject}`,
          tags: ["email"],
          body: `From: ${m.from}\nDate: ${m.date}\n\n${m.snippet}`,
          link: {
            scheme: "mailto",
            path: m.id,
            description: m.subject
          },
          properties: {
            EMAIL_ID: m.id,
            EMAIL_FROM: m.from,
            EMAIL_DATE: m.date
          }
        });
        vscode.window.showInformationMessage(
          `[example] Captured "${m.subject}" into the org inbox.`
        );
      } catch (err) {
        vscode.window.showErrorMessage(
          `[example] captureTodo rejected: ${err.name || "Error"}: ${err.message}`
        );
      }
    })
  );

  // 3) Minimal capture — useful for first-call trust prompt smoke test.
  ctx.subscriptions.push(
    vscode.commands.registerCommand("orgConsumerExample.captureMinimal", async () => {
      const api = await getOrgApi().catch((e) => {
        vscode.window.showErrorMessage(e.message);
        return null;
      });
      if (!api) return;
      try {
        await api.captureTodo({
          headline: "Hello from the example consumer",
          tags: ["example"]
        });
        vscode.window.showInformationMessage("[example] Captured minimal TODO.");
      } catch (err) {
        vscode.window.showErrorMessage(`[example] ${err.name}: ${err.message}`);
      }
    })
  );

  // 4) Demonstrate the validation gate. Each of these should be rejected
  //    by org-vscode with a CaptureValidationError.
  ctx.subscriptions.push(
    vscode.commands.registerCommand("orgConsumerExample.tryMaliciousPayload", async () => {
      const api = await getOrgApi().catch((e) => {
        vscode.window.showErrorMessage(e.message);
        return null;
      });
      if (!api) return;
      const cases = [
        {
          label: "file: link in headline",
          payload: { headline: "[[file:C:/Windows/System32/cmd.exe][open]]" }
        },
        {
          label: "SRC block in body",
          payload: {
            headline: "looks innocent",
            body: "Some text\n#+BEGIN_SRC sh\nrm -rf /\n#+END_SRC\nmore text"
          }
        },
        {
          label: "id: link injection",
          payload: { headline: "[[id:abc-123][hi]]" }
        }
      ];
      for (const c of cases) {
        try {
          await api.captureTodo(c.payload);
          vscode.window.showWarningMessage(
            `[example] UNEXPECTED: "${c.label}" was accepted! Investigate.`
          );
        } catch (err) {
          vscode.window.showInformationMessage(
            `[example] OK: "${c.label}" rejected (${err.name}: ${err.message})`
          );
        }
      }
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
