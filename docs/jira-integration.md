# JIRA Integration (Notes)

## Core concept: tag-driven JIRA creation

If you already use tags like:

```org
⊙ TODO Build the new roadmap tool :EPIC:
   SCHEDULED: <07-01-2025>
```

…we can leverage the tag (e.g. `:EPIC:`) to determine what kind of JIRA object to create when a user invokes something like **Create JIRA Task from Org Task**.

## Workflow outline

When a user right-clicks a task (or runs a command like **Create JIRA Issue**):

1. Parse the task line.
2. Extract:
   - Title
   - Tags
   - Schedule date
   - Workflow keyword (TODO state; configurable via `Org-vscode.workflowStates`)

## Tag → JIRA issue type mapping

```js
const jiraTypeMap = {
  EPIC: "Epic",
  STORY: "Story",
  BUG: "Bug",
  TASK: "Task",
  SUBTASK: "Sub-task"
};
```

Tags like `:EPIC:` would map to JIRA issue type `Epic`.

## Auth strategy

- Use settings like `Org-vscode.jiraBaseUrl`, `Org-vscode.jiraUsername`, `Org-vscode.jiraToken`.
- Store credentials securely via the VS Code Secrets API.

## API call sketch

JIRA REST API v2:

```http
POST /rest/api/2/issue
```

Example payload:

```json
{
  "fields": {
    "project": { "key": "PROJ" },
    "summary": "Build the new roadmap tool",
    "issuetype": { "name": "Epic" },
    "duedate": "2025-07-01"
  }
}
```

## Suggested feature additions

1. **Command Palette integration**
   - Create JIRA Issue from Task
   - Adds issue key as a comment or inline note (e.g. `[#JIRA-123]`)

2. **Bulk JIRA sync**
   - New command: Sync All Tagged Tasks to JIRA
   - Scans all `.org` files for tasks tagged with known mappings
   - Avoids duplicates via cache/commented JIRA ID

3. **Reverse sync (optional, ambitious)**
   - Pull issues from JIRA into `.org` format based on JQL

## Bonus ideas

- JIRA Link: add inline hyperlink on task line to open in browser.
- JIRA Status badge: auto-add/update badges next to tasks based on live status.
- Quick JIRA search: fuzzy search for an issue and auto-insert it into a task line.
