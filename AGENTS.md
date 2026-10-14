# ZeeSwap working agreement

Read `plan.md` and inspect Git status before work. Preserve its product decisions
and acceptance gates. Complete one bounded task at a time.

Use Sol 6.1 (`gpt-6.1-sol`) subagents for coding, as requested by the user.
The main agent coordinates review, verification and operator execution.

For each completed task that changes files:

1. Run checks appropriate to the change and record the result in the relevant evidence document.
2. Inspect the diff and public-file list. Keep credentials, wallet databases,
   keys, raw receipts, full memos and private order mappings outside Git.
3. Stage reviewed paths explicitly; do not blanket-stage local operator files.
4. Commit the task and push the current branch to `origin`. The user has authorized
   this workflow. Verify the remote SHA before reporting the task as published.

Do not force-push, rewrite unrelated history, include unrelated changes, or create
empty commits for read-only work. Report failed checks or blocked pushes without
claiming completion. Preserve existing work when resolving conflicts.

Use exact integer amounts. Keep the public evidence distinction between local
tests, testnet receipts, fixture inventory and confirmed cross-chain settlement.
Never publish secrets or claim unfinished gates are complete.
