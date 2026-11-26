# Completed-reply copy panel test plan (#215 / #225)

**Status.** Experiments remain stopped and installed verification is pending. This plan covers the completed-reply copy panel selected in the [#215 revision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768).

The test target is reliable copying of commands and file/folder paths from a completed assistant reply, with the full explanation visible. The native subscription-backed Claude Code CLI remains responsible for questions, permissions and interruption; Raw remains accessible. Run, Run again and direct companion answers remain deferred. Source: [#215](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215).

## What counts as evidence

Begin with recorded or synthetic completed-reply fixtures and focused offline extraction/rendering tests during separately authorized implementation. Each fixture records the original reply, expected target boundaries, exact copy value, expected action and label. Use an injected clipboard recorder for offline assertions; it establishes the requested text, not the physical system clipboard. A later, separately authorized installed smoke must read back actual clipboard values before claiming end-to-end copying works. These are selected acceptance criteria, not results.

Claude Code 2.1.47 added `last_assistant_message` to Stop input. The existing Stop command hook relays it directly to the extension on `127.0.0.1`. Verify the field and relay on the installed CLI with the existing subscription login. “Last captured reply” identifies the last message received by the extension. An observed missing or unusable field is a capture gap. A missing notification may go undetected. [Claude Code 2.1.47 release notes](https://github.com/anthropics/claude-code/releases/tag/v2.1.47) (fetched 2026-11-19) · [Stop input](https://code.claude.com/docs/en/hooks#stop) (fetched 2026-11-19) · [#245](https://github.com/glitchwerks/vscode-claude-workspaces/issues/245).

The existing [path vectors](../designs/215/implementation/evidence/path-copy-cases.json) provide candidate examples for boundaries, Unicode and Review behavior. They are authored design expectations, not passing results. Adapt relevant cases to completed snapshots; they do not make the previous capture, lease or shutdown protocols requirements for this panel. Source: fixture `format`, `status`, `source` and cases P01–P29.

## Primary acceptance: command copying

For every supported command form, compare the requested clipboard string with the expected original source slice. Visual resemblance is insufficient. Record a distinct expected value when the user edits an uncertain candidate in Review.

| Case | Required outcome |
|---|---|
| Explicit shell command in a fenced block, both short and wider than the panel | A distinct block and Copy action; display wrapping adds no characters to the copied value. |
| Intentional multiline command, continuation characters, pipes and quoted arguments | Preserve intentional line breaks, indentation, quoting, escapes and Unicode. Copy the full command without silent trimming or an appended newline. |
| Markdown fence markers, surrounding explanation or rendered prompts | Copy only the source-mapped command content. Do not include formatting or guess that a prompt-like prefix may be deleted. An uncertain prompt/command boundary requires Review. |
| Several commands, repeated identical text and a command inside a numbered explanation | Each action selects its own complete target while the explanation and ordering remain visible. |
| Generic code, JSON, output logs, or an incomplete/ambiguous fence | Do not invent an executable-command label. A code Copy may remain available when its source boundary is exact; uncertain content uses Review or no specialized action. |
| Reply says “I ran” or quotes a previous command | Reply wording alone does not establish tool execution. Use a neutral label such as “Command in reply”; an “Executed” label requires separate actual execution evidence. |
| A selected rendered reply while another snapshot arrives | Copy resolves to the immutable snapshot and target the user selected, or visibly rejects an expired action. It never silently switches to a different snapshot. |

The fixture expectation must state its newline convention. A future actual-clipboard check must compare code points and line breaks and report any platform newline conversion explicitly; it must not claim literal identity after silently normalizing the result. The intended command line structure must survive. These copying requirements come from [#215](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215); the previous experiment limitations are recorded in the [historical findings](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646355033).

## Primary acceptance: file and folder paths

| Case | Required outcome |
|---|---|
| Clear inline-code or quoted file/folder path in prose | Copy exactly the path, excluding surrounding backticks, quotes and explanation. Preserve full context beside the action. |
| Windows drive paths, UNC paths, POSIX paths, relative paths and trailing folder separators | Preserve the literal path spelling and separators. Do not resolve, expand variables, change case, check existence or normalize. |
| Explicitly bounded paths with spaces, Unicode or emoji | Copy the complete value without splitting at spaces or surrogate pairs. |
| Several paths in one sentence, repeated paths and paths near Markdown emphasis | Every action uses the correct source boundaries; formatting does not enter the clipboard. |
| Supported ambiguous candidates, including unquoted paths mixed with prose, sentence punctuation, line/column suffixes or unmatched quotes | Show the exact candidate in editable Review. Never guess a shorter path for one-click Copy. Cancel leaves the clipboard untouched. Confirmed edits copy exactly the approved text. |
| URLs, ordinary words, identifiers, or paths inside command/code targets | Do not add misleading path buttons or overlapping duplicate targets. |
| Unsupported or malformed content, missing source mapping or an over-limit candidate | Omit the specialized path action and keep the explanation and Raw access. Never truncate a path into a copyable value. |

Use the [path contract](../designs/215/implementation/path-copy-contract.md) and P01–P29 as candidate coverage for retained literal/Review behavior, subject to the active [#215](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215) revision. Do not treat the old revision/lease model as selected for the completed-reply panel.

## Supporting acceptance

These checks cover copying and native terminal access. Installed verification is pending. [#215 revision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768)

| Area | Required outcome |
|---|---|
| Explanation and accessibility | Keep the complete captured reply, headings, lists and code blocks readable. Copy and Review are keyboard reachable, have distinct accessible names and announce success only after the clipboard operation succeeds. Failure is visible and preserves context. |
| Captured-reply boundary | A valid Stop payload creates an immutable captured-message snapshot labelled “Last captured reply”. Streaming text, interrupted output without a Stop notification and intermediate tool chatter remain in Raw. Do not claim the entire turn or background work is finished. |
| Missing hook field or failed delivery | An observed missing/empty field shows a capture gap; no received reply shows waiting/unavailable. Keep retained content labelled “Last captured reply” and offer Raw/manual import. Test an undetected dropped notification without implying the panel can know every missed reply. |
| Session identity and receipt order | Reject notifications from retired launch/session identities and keep concurrent sessions separate. Without a verified source-ordering field, display receipt order only and claim no chronological ordering. Duplicate delivery must not change the source bound to a selected Copy action. |
| Bounded retention and eviction | Exercise the chosen payload/snapshot limits with synthetic data. Oversize input or eviction is explicit; no partial command or path is presented as complete. Copied targets remain bound to retained source. |
| Content boundary | Render HTML-like text and unsupported link destinations inertly. In the active reply, select bare and Markdown HTTP(S) links and verify VS Code opens the intended URL with the query string and fragment intact. Verify links from a retired reply cannot open. Copy writes to the clipboard. [#260](https://github.com/glitchwerks/vscode-claude-workspaces/issues/260) |
| Raw and native ownership | Switching to Raw reaches the same existing session and preserves its input/output. Capture failure does not block native input or alter permission decisions. |
| Manual fallback | Explicit user-selected reply text from `/copy` or a user-selected part of `/export` retains its source and is labelled “Imported reply — unverified”. Do not automatically parse a whole exported transcript as one completed reply. Cancellation or malformed input changes no session. |

## Future installed smoke — only after the stop is lifted

A later explicit authorization is required before running this section. Use a small synthetic reply containing representative commands and file/folder paths. Record the exact source/extension, VS Code and Claude CLI versions, supported-hook observation and subscription auth kind without secrets. Keep the existing subscription login and verify that the feature requires no separate API key or separately billed API path. A documentation field or offline fixture alone cannot establish that result. Requirements source: [subscription decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6645377864).

Read back actual clipboard values for a wrapped command, intentional multiline command, quoted command, explicit path with spaces/Unicode, and a Review-confirmed path. Check native question answering, permission approval/denial and native Escape through Raw, including while capture is unavailable. Verify a second session cannot receive the first session’s reply or copy target. No command needs to be executed to validate a Copy button. Source: [#215](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215).

The fallback may use native `/copy` or a user-selected reply from `/export`, followed by explicit import labelled “Imported reply — unverified”; test availability on the actual supported CLI rather than assuming it. Source: [Claude Code cheatsheet](https://support.claude.com/en/articles/14553413-claude-code-cheatsheet) (fetched 2026-11-19).

## Acceptance and historical evidence

A copying pass requires both source-backed offline assertions and the later actual-clipboard smoke for the declared supported forms/builds. Missing capture and uncertain detection are documented limitations; Raw access alone does not satisfy reliable Copy. Record failures and unsupported forms plainly. No checks or compatibility combinations are passed by this document revision.

The [previous qualification guide at c6c07c9](https://github.com/glitchwerks/vscode-claude-workspaces/blob/c6c07c9d59d954290b36f371e78f5ab12a2284de/docs/manual-verification/215-companion.md) preserves the old private-file experiments and their evidence limits. Its delayed-write, host-crash, capacity-saturation and worker-quiescence trials are not acceptance gates for the revised completed-reply panel. Historical results do not qualify the replacement capture approach. All experiments remain stopped.
