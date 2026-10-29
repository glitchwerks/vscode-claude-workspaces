# Reliability baseline and workloads

Tracking: #183, #180, #56 and #158. This records the comparison environment and
workload recipe for the authorized 0.11.0 investigation. It does not claim a
reproduction, measured fix, or approved latency budget (#183).

## Reported failure and environment boundary

The affected system ran Claude Workspaces 0.9.0. First echo took 5–10 seconds;
continued input arrived intermittently in batches or serially and could halt
again. The parent showed no Claude output, the activity indicator was on, and
a background agent was possible but unconfirmed. Its VS Code/Claude versions,
OS build, session count/age and exact workload remain unknown (#180).

The following observations are from the assistant's comparison machine, not
substitutes for those missing details. Commands ran on 2026-10-28; recorded in
the execution-start comment:
https://github.com/glitchwerks/vscode-claude-workspaces/issues/183#issuecomment-6484723785.

| Field | Local comparison value | Evidence |
| --- | --- | --- |
| Source baseline | 0.10.0, `ad53ab59166ae0dad77efd0f8f35044ee15487dd` | PR #178; `git rev-parse main` |
| VS Code | 1.142.0, `6d62b1d5dace93a33b3a6d3eca1317bd5e15bcb1`, x64 | `code --version`, execution-start comment |
| Claude Code | 2.1.307 | `claude --version`, same comment |
| Windows | NT 10.0.26300.0, x64 | .NET OS/version and OSArchitecture, same comment |
| Node / npm | 24.14.0 / 11.19.1 | `node --version`, `npm --version`, same comment |
| Dependencies | Locked installation succeeded | `npm ci` in isolated planning worktree, same comment |

0.10.0 promoted the published 0.9.0 runtime snapshot (PR #178). This justifies
using it as a reference build; it does not establish a local reproduction.
The earlier local default-profile extension listing is excluded from the
affected-machine evidence (#180).

## Reproducible workload recipe

These are proposed test parameters, not observed results or product promises.
Keep machine, font, panel dimensions and CLI fixed within a comparison; vary
only the named factor. Record dimensions and input method, including IME/paste
versus actual keypresses. Use disposable sessions/workspaces and synthetic
content so input integrity can be checked without retaining real prompts or
transcripts (#180; `src/attention/attentionDiagnostics.ts:L4-L27,L36-L73`).

| Case | Preparation | Required observation |
| --- | --- | --- |
| Q | Parent idle, no agent/job, visible terminal | First/continued echo, expected idle/input state |
| A | Parent quiet after launching a known child that remains working | Echo gaps and parent/child state; confirm child exists |
| J | Parent quiet with a known shell job running | Independent results from A; no assumed equivalent signaling |
| O | Parent producing synthetic dense/TUI output | Echo, grid alignment, queue/render/fit counters |
| W | Permission/question input wait in an owned session | Waiting state, unread policy and alerts independently |

The matrix follows #180 and #158. For Q/A/J/O start with one session, repeat
with four, then separately introduce switching, repeated resize, hide/show
and webview recreation. Record actual session age; add a long-running run
when available (#56, #180; session counts here are proposed parameters).

For each run, type a known synthetic sequence manually for 60 seconds. Include
an initial key after quiet and continued typing; record the longest pause and
any batch/halt pattern. Retain counts/order verdict, not typed contents. Repeat
each comparison three times. Keyboard/display timing, xterm parse completion
and host/PTY timings are distinct; a write callback is not proof of painting
(spec in PR #184; durations/repetitions here are proposed parameters).

## Bounded capture and results contract

1. Record the unmodified reference build and available observed echo/render/
   activity behavior before new instrumentation. If the affected machine is
   unavailable, retain its reported 5–10 second delay as user evidence and mark
   unmeasured reference fields unknown (#180).
2. Enable Task 3's reviewed capture immediately before a run, once available.
   Starting bounds are 256 aggregate records and 300,000 ms; preserve time
   coverage for the reported initial stall and continued typing. Compare with
   capture off. Stop on expiry, limit or disposal
   (`src/attention/attentionDiagnostics.ts:L36-L73`; plan in PR #184).
3. Persist version/SHA, case, session counts/ages, dimensions, input method,
   sample counts/duration, first-echo distribution, continuing-echo gaps,
   counts/order verdict, queue pressure, render/fit counts and expected versus
   observed activity. Keep process clocks separate unless calibrated. Hash
   identities; exclude terminal/key contents and OSC free text (#158;
   `src/attention/attentionDiagnostics.ts:L4-L27`; spec in PR #184).
4. Classify runs as reproduced, not reproduced under the stated case, or not
   measured. Non-reproduction does not close #180/#56. Agree on numeric first/
   continuing-echo budgets from the same-machine reference before accepting a
   fix (PR #184; #180).

No live local keyboard/display, GPU-corruption, Claude-background-work or
notification run has been performed at this checkpoint. Corresponding tasks
must supply those results; source/test checks do not establish them (#183).
