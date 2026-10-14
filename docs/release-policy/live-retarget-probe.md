# Prerelease and retarget live probe

Tracking: [issue #157](https://github.com/glitchwerks/vscode-claude-workspaces/issues/157).

This documentation-only change starts as an ordinary PR to prerelease/0.9.x.
After its native guard and required checks pass, the same source commit will be
retargeted to main to verify that earlier green results cannot authorize a main
merge. Restore the prerelease target after recording the rejection.

The probe preserves the prerelease product tree. Its ancestry includes the
reviewed main revision so that a Git conflict cannot substitute for the required
live routing rejection. The source commit remains unchanged during retargeting.

Remove this temporary document when the rollout is recorded and issue #157
closes.
