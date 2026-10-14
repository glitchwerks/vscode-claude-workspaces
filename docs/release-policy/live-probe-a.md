# Release enforcement live probe A

Tracking: [issue #157](https://github.com/glitchwerks/vscode-claude-workspaces/issues/157).

This documentation-only PR exercises the protected-main Release Guard and the
single-entry main merge queue approved in
[PR #159](https://github.com/glitchwerks/vscode-claude-workspaces/pull/159).

The live verification must record the original PR, selected workflow revision,
queue identity, prospective tree, required check results and final squash
identity in issue #157 before declaring enforcement complete. A rejected probe
remains open and can be retried after its cause is addressed.

Remove this temporary probe document after the reviewed rollout receipt is
merged and issue #157 closes.
