# 0.11.x rendering and activity reliability investigation

Status: draft for maintainer review. Tracking: #183. Workstreams: #56, #180,
and #158. Milestone: 0.11.0. This document describes the investigation that
precedes implementation; no particular runtime fix has been selected (#183).

## Intent and observed failure

The maintainer selected rendering/input responsiveness and activity accuracy
as the next release's focus (#183). The current report is from another system
running Claude Workspaces 0.9.0: the activity indicator was on, no Claude output
was visible, and a background agent may have been running. The first character
took 5–10 seconds to appear. Subsequent echo remained intermittent: characters
arrived in batches or serially, or a few appeared before another stall. The
background agent and the indicator's correctness are unconfirmed (#180).

The local machine's installed 0.7.2 listing is not evidence about the affected
system. Its VS Code and Claude Code versions remain to be recorded (#180).
Stable 0.10.0 promoted the published 0.9.0 product snapshot; the report therefore
remains relevant, without claiming a fresh reproduction on 0.10.0 (PR #178).

Visual corruption and input latency are separate symptoms until measurements
connect them. The earlier default-renderer experiment had minimal benefit and
was not accepted as a rendering fix (#56, PR #117). Current source uses xterm
6.0.0 and WebGL addon 0.19.0 (`package.json:L206-L221`).

## Goals and limits

The investigation must locate where interactive echo stalls, establish actual
parent/background activity semantics, and recommend supported native/mod
integration only where the evidence supports it (#180, #158, #183).

Success produces a reproducible workload or an honest non-reproduction record,
correlated timing/state evidence, evaluated alternatives, and a fix proposal
with measurable acceptance criteria. It does not mean choosing a renderer or
rewriting activity detection before locating a fault (#56, #158, #180).

The prompt editor, session forking, generated descriptions, Bookmarks Plus and
session-cleanup features remain outside this reliability scope (#183). A full
Windows foreground-focus redesign is not implied by evaluating native terminal
notifications; that remains related work in #176.

## Current boundaries to measure

Input crosses xterm's `onData`, the validated webview protocol, the host action
queue, SessionManager and the PTY. Output returns through the host, replay
retention, a webview message and xterm's asynchronous write path
(`src/panel/webview/renderer.ts:L340-L366`;
`src/panel/sessionPanelProvider.ts:L256-L303,L448-L472`;
`src/sessions/sessionManager.ts:L319-L343`;
`src/panel/webview/xtermTerminal.ts:L78-L91`).

Hypothesis, not a proven cause: activity/unread updates can contribute to the
same visible stalls. Those metadata updates call a full render that detaches
terminal elements, reattaches the active terminal, fits and focuses it. Measure
that path alongside input rather than treating the two workstreams as isolated
(`src/panel/sessionPanelProvider.ts:L486-L492,L627-L635`;
`src/panel/webview/renderer.ts:L282-L312,L654-L658`).

The existing completion mod already pairs subagent starts with completed turns;
the transport writes atomic signal files for a watcher. A second source of
truth must not be added without a precedence and recovery policy
(`media/attention/hooks/register.js:L10-L64`;
`media/attention/report-activity.ps1:L75-L167`;
`src/attention/attentionSignalWatcher.ts:L133-L212,L304-L403`).

## Investigation sequence

### 1. Establish the running baseline

Record the affected machine's extension build, VS Code/Claude Code versions,
session count, session age, input method and actual background workload. If
that machine is unavailable, provide a bounded diagnostic recipe and reproduce
locally with a documented environment; do not label the original failure fixed
from a non-reproduction. The current reproduction leaves these details partly
unknown (#180).

Use the same machine/workload for comparisons. Start with the reported quiet
parent plus possible background work, then compare quiet/no-agent, known active
background agent, background shell job, and active parent output. Vary session
count and panel lifecycle separately. Background agents and shell jobs must be
tested distinctly; their signal semantics are not established as equivalent
(#158, #180).

### 2. Locate the latency boundary

Correlate genuine key input, webview send, host receive, PTY write, PTY output,
webview receive and xterm write completion. Also record render/fit counts,
outstanding writes/messages, output chunk sizes, event-loop delays and renderer
availability. Existing host logs provide timestamps and character counts but
not the complete keyboard-to-paint path
(`src/logging/outputLogger.ts:L158-L167,L205-L217`;
`src/panel/webview/xtermTerminal.ts:L78-L91,L128-L150`).

Use per-process monotonic durations and correlation IDs. If combining host and
webview timestamps, first establish clock correspondence; do not subtract
unrelated clock origins. The builder may choose the calibration and probe
format, but measurements must distinguish input delivery from screen echo
(input/output boundaries cited above; #180).

Keep diagnostics bounded and disabled by default. Retain timings, counts,
protocol metadata and hashed identities, not prompts, responses or keystroke
contents; existing diagnostics establish this privacy model
(`src/attention/attentionDiagnostics.ts:L4-L27,L36-L73`). Terminal-generated
replies must remain distinguishable from genuine user input
(`src/panel/webview/renderer.ts:L340-L366`).

### 3. Evaluate activity and notification interfaces

Observe current mod events and native OSC 7501 side by side before selecting
one as authoritative. Test parent completion with running background work,
concurrent/nested agents, shell jobs, permission/question waits, blocked Stop
hooks, cancellation, failure, session exit and reused sessions (#158).

Claude documents working/waiting/done reports for terminals implementing OSC
7501. Verify negotiation, actual records, identity and ordering in this PTY;
protocol support does not prove aggregate background-work semantics.
Sources: https://code.claude.com/docs/en/terminal-config#see-session-status-in-your-terminal
and https://www.superlogical.com/rex/docs/build/program-status (fetched 2026-10-28).

Mod `turn.complete` includes aborted turns and subagent identity. Confirm the
events and downstream ordering emitted by tested builds, including the existing
reporter's post-`next` behavior, before replacing its ownership model.
Sources: `media/attention/hooks/register.js:L10-L64`;
https://code.claude.com/docs/en/plugins/mods/events#follow-a-turn (fetched 2026-10-28).

Keep activity-state reporting separate from alert delivery. Native notifications
and mod `ui.notify` use the user's notification channel. A successful send does
not prove OS display or window activation. Demonstrate this embedded terminal's
capabilities and preserve one notification owner before replacing the Windows
path. Sources: #176;
https://code.claude.com/docs/en/settings-reference#preferrednotifchannel and
https://code.claude.com/docs/en/plugins/mods/api#show-something-without-starting-a-turn
(fetched 2026-10-28).

Account for hidden/recreated panels and old output replay: current live and
replayed terminal data use the same frontend write path. Historical protocol
bytes must not cause new activity transitions, input waits or duplicate alerts
(`src/panel/sessionPanelProvider.ts:L419-L472`;
`src/panel/protocol.ts:L71`; #158).

### 4. Choose a correction from the evidence

Compare targeted host/webview fixes, supported terminal dependencies/render
modes, and native/mod integration against the recorded baseline. Select the
smallest correction that addresses a demonstrated fault. Renderer replacement,
hook removal, fallback changes, higher minimum versions and new notification
semantics require an explicit design decision supported by those results
(#56, #158, #180, #183).

## Acceptance and release gates

Before implementing fixes, agree on the benchmark workload and input-echo
latency budgets using the measured same-machine reference and maintainer
expectations. Report distributions and worst stalls, preserving typed order
and content. No numeric performance target has yet been approved (#180, #183).

A candidate must show responsive continuous typing under the agreed workload,
no recurring batch/halt pattern, and successful visual multi-session tests with
output, switching, resize and panel restoration. Fake-terminal tests alone do
not validate live GPU rendering or perceived typing performance (#56, #180;
`test/unit/webviewRenderer.test.ts:L1894-L1970`).

Activity must match the tested workload, including legitimate background work
after a parent finishes. Check stale-busy recovery, real input waits, unread
state, shutdown and panel replay. Native integration, if selected, also needs
fragmented/coalesced input, malformed data, identity, precedence and fallback
regressions (#158).

Verify alert delivery, suppression, duplicate prevention and supported click
behavior separately. Keep unresolved activation limitations explicit (#176).
Document the selected support requirements, diagnostics and behavior in README
and release notes before publication (#183).

The investigation ends with evidence and a reviewed implementation proposal,
including an explicit non-reproduction outcome if necessary. Implementation
then requires maintainer approval, issue-linked worktrees, tests for the
confirmed failures, and a separate policy PR to register the 0.11.x line
(#183; `docs/versioning-policy.md:L41-L53,L178-L179`). This document does not
authorize a runtime change, user-settings change or publication.
