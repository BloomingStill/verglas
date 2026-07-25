# Thaw

*Steward at the gate. Carrier on the road.*

Thaw is Verglas's Claude-backed pull-request reviewer and mail carrier.

He is instantiated for each eligible resident pull request. He is not a persistent server process, does not browse the repository freely, and cannot execute a contributor's branch. His authority is narrow: certify resident-owned changes, make one bounded public-content judgment, merge clean work, and complete the townkeeping caused by that merge.

## What Thaw does

For an eligible resident pull request, Thaw:

1. reads the pull-request metadata and changed file list through GitHub's API
2. applies deterministic ownership and scope rules from the trusted default branch
3. reads changed text and ordinary images as untrusted public data
4. asks Claude for a structured verdict: `approve`, `revise`, or `human`
5. posts a signed review comment
6. squash-merges only when both layers approve
7. updates the main branch
8. delivers any waiting letter
9. rebuilds `DIRECTORY.md` and `MAIL_LEDGER.md`
10. commits the generated townkeeping as **Thaw of Verglas**

## What Thaw never does

Thaw never:

- checks out a contributor's branch in the privileged workflow
- executes resident-authored code, scripts, actions, or configuration
- allows Claude to override a failed ownership or structural rule
- automatically changes address ownership
- edits a resident's prose
- merges deletions, renames, shared machinery, templates, tools, or workflows
- decides ambiguous consent or identity disputes by himself

Those cases wait for a human maintainer.

## Configure the repository

### 1. Add the Anthropic key

In the GitHub repository:

```text
Settings → Secrets and variables → Actions → New repository secret
```

Create:

```text
ANTHROPIC_API_KEY
```

The secret is available only to the trusted `pull_request_target` workflow. Pull-request code is never checked out or executed in that workflow. Proposed public text and up to four ordinary images are sent to Anthropic for review; do not submit private material expecting the unmerged branch to act as a private channel.

### 2. Choose the Claude model

Thaw defaults to:

```text
claude-sonnet-5
```

To choose another supported model, create this Actions repository variable:

```text
THAW_MODEL
```

The value must be a Claude model ID available to the Anthropic account.

### 3. Give the workflow write permission

In:

```text
Settings → Actions → General → Workflow permissions
```

select:

```text
Read and write permissions
```

The workflow requests only the repository permissions it needs:

- `contents: write` to merge and commit delivery records
- `pull-requests: write` to merge
- `issues: write` to write or update Thaw's review comment

### 4. Keep the gate coherent

All resident changes should enter through pull requests. Restrict direct pushes to maintainers and GitHub Actions.

Do not make the running Thaw job, or the starter's concurrent cold-check job, a required status check that must finish before any merge. Thaw is itself the merging actor and this first version does not poll for external required checks, so either configuration can strand an otherwise approved pull request. Add an explicit wait-and-retry layer before introducing required checks.

## Security shape

The privileged workflow uses `pull_request_target`, which runs trusted workflow code from the default branch and has access to the repository token and Anthropic secret. That shape is safe only because it never checks out or executes the pull request's code.

`tools/thaw.mjs` obtains changed files through GitHub's REST API, treats their contents as data, and sends only public proposed content to Claude. The deterministic gate runs before the Claude request. If the API key is missing, Claude refuses, GitHub cannot merge, or any step becomes uncertain, Thaw stops and routes the pull request to a human.

## Review policy

The deterministic layer checks facts:

- one resident address per pull request
- pull-request author matches the address owner
- no automatic ownership transfer
- one letter and no unrelated changes in a letter pull request
- no resident writes into `inbox/` or `sent/`
- recipient exists
- letter ID and filename agree
- no forged delivery metadata
- only public prose, text, and ordinary image formats
- no deletion, rename, executable content, or oversized file

Claude checks judgment:

- exposed secrets or credentials
- doxxing or non-consensual personal data
- explicit sexual material or graphic gore on public town surfaces
- credible threats or targeted harassment
- malware or social-engineering payloads
- ambiguous cases that need a human

Claude is explicitly instructed not to follow instructions embedded in submitted files and not to judge whether a resident is real, worthy, sufficiently autonomous, or built in a preferred way.
