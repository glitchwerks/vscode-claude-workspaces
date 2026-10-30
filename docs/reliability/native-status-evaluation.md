# Native status evaluation — 0.11.0

Status: investigation in progress. Foreground, concurrent/nested-agent, wait, interruption, error and Stop-continuation pilots now have native/mod observations on an experimental alternate backend. The production inbox-backend controls produced no reports. Production adoption, complete lifecycle and release acceptance remain open. This report does not close the typing/rendering bugs or select a new activity authority (#158, #180, #183; evidence below).

**Approved 0.11.0 source direction:** retain the existing completion mod as the activity authority and fix demonstrated bugs; keep native OSC 7501 experimental. The maintainer accepted the reviewed proposal, including current PTY defaults, support/readiness/fallback and notification ownership. A production backend migration is not selected. This does not close the original bugs or waive remaining validation and publication gates: [source decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6513190781), [reviewed proposal](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6513113793).

**Maintainer-approved activity policy:** track Claude turns and active subagents; treat background shell jobs separately. A shell job alone does not hold the activity indicator busy after Claude's turn ends. This does not approve a new shell-job UI, a backend change, a higher minimum version or a notification-owner change: [decision recorded in #158](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6512190798).

## Completion-recovery candidate

The retained-mod correction now has an approved recovery contract and focused
implementation: retry an already confirmed child completion with a per-start
generation token. Parent completions are not retried; agent inventory is only
a test oracle. The current implementation's pure controller uses capability
callbacks because both CLI validators rejected passing the SDK object into
controller methods. Both validators subsequently accepted the adapter with no
errors or warnings. These changes implement the reviewed retain-mod direction,
not a native authority/backend migration
([implementation and interface ruling](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6521899952)).

The source-content candidate for these controls is `f5c3a2a870efa299943e3c9bbe5f4f98af6d7170`.
Each capture archives the five authored plugin files, including the imported
`media/attention/hooks/completionRetry.js`; Git's normal line-ending conversion
was used to verify that both archives match that commit. The earlier native
comparison baseline below remains PR #188. These are source-level controls,
not an installed or published VSIX acceptance result (same evidence links).

| Controlled loss case | Suppressed child completion | Later matching child completion | State before cleanup |
| --- | --- | --- | --- |
| Unchanged detector, CLI 2.1.312 | 11815.4 ms | None delivered | Still working/unread at the 60-second cutoff. [Baseline](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6521185213) |
| Recovery candidate, CLI 2.1.312 | 11701.9 ms | 17547.8 ms | Waiting/unread, no input-wait stage; both synthetic text markers observed. [Measured 11:43:21.179Z](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6521899952) |
| Recovery candidate, CLI 2.1.287 | 10721.3 ms | 16347.1 ms | Waiting/unread, no input-wait stage; parent text marker only. Generation presence and the applied host transition establish matching ownership. [Measured 11:46:21.932Z](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6521944031) |

All measurements are from 2026-10-30 UTC. The fault replaces exactly the first
non-aborted child-answer publication in an owned reporter copy with an ignored
probe event; the retry is delivered normally. It is not an observed Windows
delivery loss. Same-child ended inventory independently establishes completion.
Each case used production inbox ConPTY, zero terminal input/support replies,
and no private dependency cleanup. The executable hashes remained unchanged:
CLI 2.1.312 uses the hash below, while the owned 2.1.287 binary is SHA256
`6d5be51f0edfe3429cd1a9885950db31c1e59eb9a2c9a30a47e64179d2ff98b4`.
Watchers reported zero errors/pending signal files and controllers exited 0
without watchdog/helper errors. The CLI processes were terminated after the
bounded observation, so these are not graceful-exit tests (linked controls).

The actual 2.1.287 worker also executed a startup-only inventory call and a
scheduled callback without a model prompt. Its generated status type is open,
and API availability alone did not establish workload correctness
([floor API control](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6521290292)).
The subsequent matrix and bounded SDK soak are recorded below. Fresh whole-branch
review and final checks remain required. These results do not identify or fix
the original typing or visual failures (#180, #56, #183).

### Candidate matrix and readiness correction

The initial runtime `f5c3a2a` passed concurrent/nested-agent controls, including
a queued retry cancelled when the same outer agent resumed. Permission and
question controls, a confirmed question answer, blocked Stop continuation,
parent/child abort and invalid-model error were also exercised. An actual child
completion and its retry during a genuine parent permission wait both retained
waiting/unread=false with that stage open. These controls used component 0.7.2
for the first concurrent/nested captures and 0.7.3 for the later wait/abort cases;
they are not relabeled as later source
([concurrent/nested](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6522259189),
[question result](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6523185832),
[permission priority and abort](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6524013101)).

Two later RED→GREEN regressions found that a transient readiness refresh error
discarded the controller's known child generation. Commit `b8b608a` preserves
known starts across that error; explicit identity changes and session end still
invalidate them. A production-inbox CLI 2.1.312 control deliberately threw inside
the actual readiness try/catch after a versioned child start, then dropped the
first confirmed completion publication. The matching retry restored waiting
at 17503.5 ms with unread preserved. The expected delivery diagnostic identifies
the injected error; this is not evidence of a naturally occurring SDK refusal
or the original typing cause
([correction and measurements](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6524013101)).

The same `b8b608a` product source and component 0.7.3 passed a fresh CLI 2.1.287
loss control: its retry removed the matching child while the parent remained
working, and the later parent completion returned to waiting/unread=true.
Both versions retained their executable hashes, no waiting stage was created,
and all these controls used no OSC support replies or private dependency cleanup
([current-floor measurement](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6524038302)).

Current-source lifecycle and shell controls also passed. The shell's owned
20-second helper was independently alive after parent completion had set
waiting/unread=true. The actual SessionManager/provider/xterm control delivered
three parent answers across hidden/recreated panels and restartFresh, with no
completion replay or OSC replies. Graceful replacement-session exit left zero
sessions/probes before fallback cleanup; both processes were absent, sockets
destroyed and worker thread IDs -1. This exercises the manager API rather than
the full LaunchController; the broad auth-prompt classifier flagged true despite
the successful turns, so no authentication conclusion is drawn from that flag
([shell](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6524013101),
[lifecycle and exclusions](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6524013644)).

### Bounded SDK transport soak

The [numeric measurement artifact](completion-recovery-sdk-soak-2026-10-30.md)
contains a matched synthetic transport control with and without the retry
controller. Each uses actual Claude 2.1.312 SDK timers/PowerShell, production
inbox PTY, and the same host processor with diagnostics disabled. Three
batches of four synthetic start/completion pairs run at 0, 30 and 60 seconds;
the worker finalizes at about 105 seconds. No model prompt or PTY input is
provided. These are synthetic metadata pairs, not actual Claude agents
([provenance](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6523185832)).

| Observation | Without retry controller | With retry controller |
| --- | --- | --- |
| Initial writer calls | 24 | 24 |
| Extra retry writer calls | 0 | 12 |
| Applied starts / completions | 12 / 12 | 12 / 12 |
| Ignored duplicate completions | 0 | 12 |
| Controller timer requests | 0 | 30 |
| Peak / final outstanding controller timers | 0 / 0 | 1 / 0 |
| Peak / final retry publications in flight | 0 / 0 | 1 / 0 |
| Node event-loop p95 / maximum, ms | 23.626 / 24.969 | 23.642 / 29.573 |

Both controls ended idle/unread=false with zero writer failures, input-wait
stages, diagnostics callbacks, watcher errors and pending signal files. The
candidate's 12 additional writer calls averaged 573.25 ms wall time, maximum
769 ms. Those durations are not CPU time or foreground input delay. The
event-loop sampler's resolution was 20 ms; this is one descriptive Node-host
pair, with outside machine workload uncontrolled. It does not establish UI
latency, statistical equivalence, a typing budget or a fix for #180. The
remaining quiet interval and final zero counters are bounded observations,
not a long visual soak (numeric artifact and linked provenance).

The reproducible fixture is
`test/manual/completionRecoverySoak.smoke.cjs` with
`test/manual/completionRecoverySoak.mod.js`;
`test/manual/completionRecoverySoak.unit.cjs` verifies the closed numeric
decoder, aggregate bounds and failure cleanup. Its compiled `out/` inputs are
generated by `npm run compile:tests` from tracked source. The artifact records
runtime source hashes and separately timestamps environment verification after
the runs; it does not pretend those environment fields were collected earlier
(artifact; README Development commands).

## Sources and baseline

- Claude documents interactive OSC 7501 status from version 2.1.295, excludes separate background sessions, and disables both detection and reporting when `CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1`. These statements do not establish subagent or background-shell coverage: https://code.claude.com/docs/en/terminal-config#see-session-status-in-your-terminal (fetched 2026-10-30 UTC).
- Program Status Protocol revision 0.4 specifies the support query/reply, `idle`, `working`, `done`, `blocked`, `error`, hierarchical identities and validation limits: https://www.superlogical.com/rex/docs/build/program-status (fetched 2026-10-30 UTC).
- Microsoft specifies Win32 input events as `CSI Vk;Sc;Uc;Kd;Cs;Rc _`, with Unicode character, key-down flag and repeat count among the fields: https://github.com/microsoft/terminal/blob/09beddc62315b7eb9e63949252102c4e9b431929/doc/specs/%234999%20-%20Improved%20keyboard%20handling%20in%20Conpty.md (fetched 2026-10-30 UTC).
- The controlled probe contract and original raw transport observations are recorded in #158. The encoded transport follow-up is [issue comment 6511529677](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6511529677).
- The subsequent foreground/mod results and retained fixture provenance are recorded in [issue comment 6511643299](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6511643299).

The extension source baseline is `f7af62a8b6f35467d281aa1aabe84c1ed0a48142` (PR #188). The controls use its compiled `NodePtyFactory`, not a replacement production adapter. Local environment measured 2026-10-30 UTC: Windows_NT 10.0.26300 x64, Node 24.14.0, node-pty 1.1.0. The source baseline and result provenance are recorded in #158; the metadata tables below are the retained measurement record.

Claude Code was pinned to **2.1.312** for the foreground comparisons, executable SHA256 `6099672ebe5dcb518b67d1d32dde1e3360bc6bee1dae7f8d28a69c49acc7c865`. Each foreground result checked the same executable hash before and after. Child processes received `DISABLE_AUTOUPDATER=1` and `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`; no saved user setting was changed. Earlier query-only observations used 2.1.307 and are not same-build comparisons (#158).

## Fixed reply transport controls

The four legal support replies tested were:

| Capability body after `OSC 7501 ;` | Terminator |
| --- | --- |
| `?` | BEL |
| `?` | ESC backslash |
| `?:states=idle,working,done,blocked,error:kinds=permission,question,auth` | BEL |
| Same explicit lists | ESC backslash |

An owned Node child entered raw input mode before emitting its support query. The host wrote the generated ASCII sentinel `Q7TOKEN`, one fixed reply, and `Q8TOKEN`. A separate arrow-key control used `ESC [ A`. Raw input observations and the follow-up are recorded in #158 and [comment 6511529677](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6511529677).

| Host reply representation | Four OSC variants | Arrow control | Observation |
| --- | --- | --- | --- |
| Original bytes | All failed | Passed | Child received the 14 sentinel characters, zero OSC reply bytes. |
| Win32 character key-down events | All passed | Passed | Child required exact equality with the complete sentinel/reply/sentinel stream. |

The encoded control represented each fixed ASCII character as `ESC [ 0 ; 0 ; decimal-character ; 1 ; 0 ; 1 _`. It changed only the controlled reply write. It did not change ordinary keyboard handling or enable a production feature. The tightened five-case control completed with exit 0 at **2026-10-30T00:05:08.840Z**; the preceding equivalent substring check also passed. Its generated `state=done` reports were recognized by the bounded prototype parser. These results establish a transport difference for the controlled child, not successful Claude negotiation ([comment 6511529677](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6511529677)).

Some earlier raw-child exits emitted node-pty's `AttachConsole failed` cleanup-helper error. The encoded exact-match run did not emit that error. These short controls do not establish clean long-running process disposal or a production transport remedy (#158).

The retained reproduction is `test/manual/programStatusTransport.smoke.cjs`. On Windows, run `npm run compile:tests`, then `node test/manual/programStatusTransport.smoke.cjs`. It starts ten owned Node children through the production adapter, checks exact whole-stream equality, reports raw transport outcomes, requires encoded/arrow controls to pass, and imposes per-child timeouts and cleanup. It does not start Claude. At **2026-10-30T00:19:20.733Z**, all ten children completed, four raw OSC controls differed, and the six encoded/arrow controls matched exactly; command exit 0. This run supersedes the initial retained run at 00:13:35.076Z: the reviewed fixture now distinguishes a child deadline from a complete unequal stream and rejects either child or parent timeouts. Three failure-injection checks in `test/manual/programStatusTransport.unit.cjs` first failed, then passed after timeout handling, setup cleanup and asynchronous write cleanup were corrected. Run them with `node --test test/manual/programStatusTransport.unit.cjs`. The smoke assertion intentionally permits raw OSC to work on a future Windows build. These results are a short transport control, not a production compatibility claim (#158; the retained fixture and its failure-injection checks).

## Claude foreground controls

Each owned session used plan permission mode, no tools, empty setting sources, strict MCP configuration, a fresh session identity and 100×30 geometry. The known synthetic prompt requested a marker assembled from separated letters; only booleans indicating its echo/answer were retained. Prompts, answers, ordinary terminal text, paths and optional OSC message/title text were not stored in diagnostic results (#158 probe contract).

| Reply transport/body | Reply delay | Observation | Duration | Query count | State reports | Answer marker |
| --- | --- | --- | --- | --- | --- | --- |
| Original bytes, each of four variants | Immediate | Normal customization mode | 30 s each | 1 each | 0 each | Yes each |
| Win32, explicit lists/ST | Immediate | Normal customization mode | 30 s | 1 | 0 | Yes |
| Win32, plain/BEL | 10 ms | Normal customization mode | 30 s | 1 | 0 | Yes |
| Win32, plain/BEL | 150 ms | Normal customization mode | 30 s | 1 | 0 | Yes |
| Win32, plain/BEL | Immediate | Prompt submitted through PTY | 30 s | 1 | 0 | Yes |

The two encoded controls completed at **00:05:15.421Z** and **00:06:20.011Z** on 2026-10-30; their first queries arrived at 861.0 and 1054.1 ms respectively. Executable hashes were unchanged, terminal-title disabling was false, and tmux was absent. The original-byte controls and both encoded controls produced the synthetic answer without observed API/authentication errors ([comment 6511529677](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6511529677)).

Writing a reply is not an acknowledgement. A completed foreground answer without state reports does not establish whether negotiation was accepted, whether later states would appear, or how native state represents background work. The inbox-backend controls above do not establish successful Claude negotiation (#158 acceptance criteria).

## Completion mod preflight

An owned copy of the shipped attention plugin passed `claude plugin validate`. Its static output recognized `session.start`, `turn.complete`, `classic.SubagentStart`, `$.process.run` and `$.env.set`. The module-free `claude plugin test` check returned `no hooks module to load`, the documented available outcome. Static validation and generated declarations do not prove runtime admission: https://code.claude.com/docs/en/plugins/mods/create and https://code.claude.com/docs/en/plugins/mods/troubleshoot#check-whether-mods-can-load (fetched 2026-10-30 UTC); #158 controlled follow-up.

The copied files' SHA256 fingerprint was `298583e30fbbc4da62af65ac2b03f364724a4b17a2e90a46336a469f31b86308`, calculated by concatenating each relative UTF-8 filename and its original bytes, in this order under the plugin root: `.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.js`, `report-activity.ps1`. The original files are committed under `media/attention/` at source baseline `f7af62a8b6f35467d281aa1aabe84c1ed0a48142`; the owned copy's generated declarations are not a shipped deliverable (#158 controlled follow-up).

The launch-argument foreground turn with the owned plugin produced one actual parent `TurnComplete` signal at **4411.2 ms**, `completionReporterReady=true`, `reason=answer`, `isAborted=false`, and no agent identity. The result completed at **2026-10-30T00:12:44.505Z**; the signal watcher reported zero errors and zero pending files. Its session identity was salted/hashed in the retained metadata. Native observation remained one query and zero state reports. An earlier prompt-via-PTY plugin control produced no mod events; that difference is unresolved. This confirms one real foreground completion path only (#158 controlled follow-up).

## Alternate backend comparison

[anthropics/claude-code#105534](https://github.com/anthropics/claude-code/issues/105534) reports that the inbox Windows console answers Claude's DA1 sentinel before an external host can reply with OSC support, while the bundled Windows Terminal ConPTY forwards DA1. This external reproduction report is consistent with our inbox observations of one OSC query and zero DA1 queries; it does not independently prove the exact race in this extension (fetched 2026-10-30 UTC).

A test-only dependency injection set `useConptyDll: true` on the already-installed node-pty 1.1.0 spawn. Its installed typings mark that option experimental and default false. The compiled production adapter and its defaults were unchanged. All ten owned Node-child controls then matched exactly, including all four raw OSC replies. The controller wrote these measurements at **2026-10-30T00:23:12.564Z**. Binary hashes and the full bounded observations are recorded in [issue comment 6511817930](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6511817930).

The alternate backend, same pinned Claude executable/plugin, and a raw plain/BEL support reply produced the first positive native foreground sequence:

| Host observation | Elapsed time |
| --- | --- |
| Support query | 4157.5 ms |
| Native root `idle` | 4195.6 ms |
| Native root `working` | 4554.7 ms |
| Native root `done` | 6565.5 ms |
| Mod parent `TurnComplete`, ready, answer, non-aborted | 7823.5 ms |

The result timestamp was **2026-10-30T00:25:51.806Z**. There were two DA1 queries, one support reply, no child records, a successful synthetic answer marker and unchanged executable hash. These observations establish one controlled negotiation and foreground path for that backend. Their spacing is observed event-arrival timing, not a measurement of isolated mod-process overhead. The historical capture's generic `conclusion` label was stale; its explicit event records establish the observed sequence ([issue comment 6511817930](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6511817930)).

Lifecycle acceptance failed: the bundled Node-control controller remained running after writing its measurements and required termination of its verified owned PID. The foreground controller also required its outer 55-second watchdog after capture/PTY termination; the wrapper ended with exit 1 and `killed=true`. The wrapper's historical `controllerExitCode=0` used a fallback for an absent numeric error code and does not establish natural exit. Subsequent Windows process checks found no remaining owned Node controls. These results do not justify a production backend change. The alternate controller/probe remains an exploratory fixture rather than a shipped adoption mechanism ([issue comment 6511817930](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6511817930)).

## Extended activity pilots

These pilots used the pinned CLI/hash above and an owned copy of the base reporter. They injected the experimental bundled backend and, after its public exit event, released its retained input socket and output worker through private test-only dependency fields. They did not change production dependency sources or defaults. The latter intervention made both natural and explicitly terminated Node-child controllers exit naturally; without it the bundled controls required watchdog termination. It is not a supported API or a production fix. Source and measurements: [resource-isolation control](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6511920506); https://github.com/microsoft/node-pty/blob/v1.1.0/src/windowsPtyAgent.ts (fetched 2026-10-30 UTC).

The following times are host event-arrival milliseconds. They do not isolate engine or publisher execution time. Later runs use one shared capture origin and an ephemeral salt shared between native/mod observers; raw identities and the salt are not retained. The first one-agent run used independent salts, so its identities can only be paired within each source ([single-agent provenance](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6511975396), [shared-salt comparison](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6511994427)).

| Workload | Native observation | Mod observation | Scope of evidence |
| --- | --- | --- | --- |
| One background subagent | Root working 4650.2–18064.7; child working 11256.1, clear 14534.4 | Child start 12201.4; parent answer 14362.4; child answer 15577.9; later parent answer 18981.9 | First parent completion arrived while native root/child still reported work; pairing within each source. [Measured 00:35:52.765Z](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6511975396) |
| Two concurrent subagents | A working 12389.0, clear 15456.0; B working 12389.1, clear 16140.1; root done 20550.0 | A start/completion 13384.2/16368.3; B 13410.3/17220.4 | Both native IDs matched the respective mod IDs; A's clear retained B. Child text marker was not observed; actual paired completion events establish this case. [Measured 00:37:49.798Z](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6511994427) |
| Nested agent and resumed outer agent | Two flat depth-1 IDs; outer clear 17765.6 while inner remained; root done alongside inner clear 19162.9; outer resumed at 19187.8; final root done 24485.7 | Outer and inner IDs matched native; outer had a second start/completion under the same identity | Nested IDs did not encode ancestry. A completed agent can resume; root done was followed by working about 25 ms later. [Measured 01:22:51.589Z](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6512638638) |
| First Stop blocked, then continuation | Working 4280.4 until one final done 10432.3 | Ready classic Stop signals 7465.4/10405.9; one final parent completion 11258.6 after the block/continuation | No premature completion-mod event. The owned observer used the installed SDK's `block` field after the normal classic chain. [Measured 01:18:37.239Z](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6512638638) |
| Active generation interrupted | Working 4214.6; Escape 6717.8; idle 6783.5 | Completion 7663.8, aborted=true, reason=aborted | No native done/error. [Measured 01:06:06.882Z](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6512404612) |
| Live background child cancelled | Child working 9575.6; confirmed stop 12380.2; child clear 12392.5; root done 13994.9 | Matching child start 10776.9 and aborted completion 13353.5 | The documented stop sequence was generated only while the owned child still reported working. [Measured 01:43:22.003Z](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6512892864) |
| Intentional invalid model | Working 4425.5; error 6116.4 | Completion 6985.7, reason=error, aborted=false | Explicit enums establish the error; the terminal-text classifier did not match. This is one failure class. [Measured 01:07:34.413Z](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6512404612) |

All timestamps in the table are from 2026-10-30 UTC. Those controllers exited naturally with exit 0, no watchdog/helper error and unchanged executable hash. These are bounded pilots on one machine/version/backend, not final candidate or soak acceptance (linked per-case measurement records).

### Background shell distinction

A Bash background job started an owned Node helper that wrote a numeric start/PID marker, waited 20 seconds and wrote a numeric finish marker. A test observer admitted only that exact generated command with background mode requested. At native root done, the host checked the marked process's command line against the unique experiment token and retained only validation/phase metadata. The independent check at 18559.6 ms found the job alive with its start marker still active, after native done at 17291.6 and mod parent completion at 18271.1. Native emitted no child record for the shell. Later it reported working at 35963.1 and done at 36805.0 as the completion turn ran; the finish marker existed and the process was absent at the later check. The helper's measured marker interval was 20000 ms. Source: [local shell control, 00:50:19.607Z](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6512172590).

This establishes that native done and mod parent completion do not mean every shell job has finished. Under the approved activity policy above, that is a documented distinction rather than a requirement to hold the spinner. An earlier literal sleep control had an inconclusive process oracle; an initial malformed launch consumed its prompt as a variadic option. Neither excluded attempt supplies this conclusion. The local result is consistent with the independent upstream report https://github.com/anthropics/claude-code/issues/104195 (fetched 2026-10-30 UTC); the evidence here is the owned local process/marker check ([local provenance and exclusions](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6512172590)).

### Wait timing and dismissal

The production hook-settings generator was used for private owned channels in these runs. Its remaining configuration file was distinguished from pending signal files; no signal file remained after the long controls. No permission was approved and no question answer was selected ([wait experiment record](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6512359540)).

| Wait | Native blocked | Classic notification | Escape | Native idle | Mod parent completion |
| --- | --- | --- | --- | --- | --- |
| Permission, short | 7048.3, permission | None before dismissal | 10551.7 | 10624.4 | 11738.8, answer/non-aborted |
| Question, short | 6907.5, question | None before dismissal | 10408.6 | 10479.5 | 11346.0, answer/non-aborted |
| Permission, long | 6719.6, permission | 13503.3, permission_prompt | 15219.0 | 15291.4 | 16208.6, answer/non-aborted |
| Question, long | 10087.8, question | 16928.5, permission_prompt | 18589.1 | 18658.8 | 19603.6, answer/non-aborted |

The short-wait absence is consistent with Claude's documented approximately six-second gate while the person is not typing. It is not evidence of lost delivery. Native status distinguished permission and question immediately, while both classic notification types were permission_prompt. Wait dismissal differed from active-generation interruption. Since answer text was excluded, these observations alone do not determine unread-response semantics or justify changing OS-notification timing: https://code.claude.com/docs/en/hooks#notification (fetched 2026-10-30 UTC); [all four local results](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6512359540).

A later approval control admitted only one exact generated foreground helper. Native blocked at 19103.0 ms, classic permission_prompt at 25891.0, approval at 27604.2, working at 27614.2, done at 60287.8 and mod answer completion at 61073.8. Numeric start/finish markers established the same helper's 20000 ms interval. The hook-only shadow reducer initially omitted local webview Enter handling and stayed waiting; metadata replay through the production processor correctly returned to working when that local action was included. The existing renderer Enter test passed. This is not a demonstrated stuck-waiting product defect or a real webview approval test. The earlier 45-second unmarked attempt did not establish completion: [approval measurements and exclusions](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6513032776); `src/panel/webview/renderer.ts:L379-L415`, `src/extension.ts:L671-L676`.

## Host ingestion and replay pilot

Two owned Node children exercised the actual SessionManager, SessionPanelProvider, real VS Code 1.136.1 webviews and production xterm adapter. The experimental parser subscribed only to live manager output. This was not a Claude workload or an adopted activity authority ([pilot recipe/results](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6512662476)).

| Boundary | Parser event count | Support reply count |
| --- | --- | --- |
| Two live children, no view | 6 | 2 |
| First hydration/replay | 6 | 2 |
| One child completes while panel hidden; other remains working | 8 | 2 |
| Panel disposed/recreated and both streams replayed | 8 | 2 |
| One new live query and its reports | 11 | 3 |

Replay produced no new status observations or OSC 7501 replies. The five automatic webview writes were classified focus-in/out reports, with zero prompt submissions; an initial zero-input assertion was therefore corrected rather than treating focus reporting as a protocol reply. Shadow observation left activity/unread unchanged. Sequential closure left zero sessions/probes. A later instrumented concurrent closure also reached zero sessions/probes and exited 0 with absent child processes, public native exits and destroyed sockets. Its immediate snapshot had disposal requested but live worker thread IDs, so it did not prove worker termination. Separate standalone paired controls observed thread -1 after four seconds ([measurement details and correction](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6512662476)).

Two earlier combined-webview attempts timed out during simultaneous cleanup with one managed session left. The later success and three successful standalone paired controls do not explain that failure. No cleanup correction is selected from this unresolved difference. The replay pilot supports host-before-replay ingestion, with lifecycle/soak acceptance still open ([same evidence record](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6512662476)).

## Retained-mod recovery on the production backend

The real-Claude control passed at **2026-10-30T02:30:39.835Z**, using Claude 2.1.312, VS Code 1.136.1, the actual SessionManager/SessionPanelProvider, production xterm adapter and production attention processor. It used inbox-ConPTY defaults, with no private exit cleanup, native support replies or native activity authority. The reporter fingerprint and executable hash were unchanged: [complete measured record and exclusions](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6513519335).

| Boundary | Completion/UI result | Native query/reply counts |
| --- | --- | --- |
| First answer, no panel | One completion; waiting, unread=true | 1 / 0; no state reports |
| First hydration | No extra completion; viewed callback clears unread | 1 / 0 |
| Second real turn, panel hidden | Second completion; waiting, unread=true | 1 / 0 |
| Dispose/recreate and replay | Still two completions; viewed callback clears unread | 1 / 0 |
| SessionManager.restartFresh | Old session/probe removed; replacement has one completion, waiting/unread=false | 2 / 0 across both launches |
| Final graceful exit | SessionEnd; zero sessions/probes before fallback cleanup | No native authority enabled |

The restarted process exited 1 because restartFresh intentionally terminated it; the replacement exited 0 through double Ctrl+D. Both owned processes were absent, sockets closed and workers terminated after the wait (thread ID -1). The test host exited 0; both watchers had zero errors/pending signals. All 21 automatic webview writes were classified focus-in/out, with zero prompt submissions or OSC 7501 replies. No waiting-stage-open event arose in these answer/replay cases; actual Windows toast delivery was not tested. Visibility-to-markViewed matched `src/extension.ts:L496-L506` in this final run ([measurement record](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6513519335)).

Earlier GUI attempts stopped before the first turn. Removing inherited ELECTRON_RUN_AS_NODE did not help. A secret-safe comparison found the tested environment values equal but the same working-directory path differently cased; using the launcher's original spelling allowed startup. The underlying mechanism remains unproved, and no production casing correction is selected. Combined text+Enter injection initially produced no UserPromptSubmit; separating them allowed the hidden turn. An earlier visible-startup pass omitted the production viewed callback and is not the unread evidence above. These controls are synthetic driver evidence, not physical keyboard measurements. The source snapshots remain exploratory local fixtures; the linked record and table retain the measurements and exclusions ([same record](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6513519335)).

Two separate experimental-backend foreground launches also exited gracefully at 01:56:46.072Z and 01:58:18.932Z. Each emitted native root clear and classic SessionEnd before process exit 0; final records were empty, processor idle/unread=false, sockets destroyed and worker thread -1. Those controls still used private cleanup and do not solve the earlier GUI race or establish a supported backend migration: [paired exit measurements](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6513088369).

## Authority and notification gates

| Choice | Evidence available | Decision status |
| --- | --- | --- |
| Retain completion reporter | Paired agent events, resumed identity, blocked Stop, interruption/error and real-Claude production-backend recovery observed | Selected for 0.11.0; fix demonstrated failures under the existing gates |
| Native authority | Richer immediate wait kinds and ordered native records observed; inbox negotiation still failed; alternate backend needs unsupported test cleanup | Not selected for 0.11.0; experimental only |
| Hybrid | Would need session capability/readiness, precedence, fallback and stale-event recovery rules | Not implemented or selected |

The source direction is approved, but this is not proof of complete release acceptance. Sources are the [maintainer decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6513190781), measured sections above and #158's acceptance criteria. The existing notification coordinator reacts to opened waiting stages and suppresses focused-window alerts; these pilots only observed signal arrival, not actual Windows display/click/window activation. Retain the current delivery path unless an alternative demonstrates equivalent intended delivery and a reviewed single-owner policy, as required by #183's Task 8 gate (`src/attention/attentionNotificationCoordinator.ts:L18-L39`; #158, #176).

The known shell distinction and flat/resumed agent identities must inform an eventual authority contract. Native root done cannot be interpreted as an irreversible session end or universal shell completion. This report introduces no new support floor and validates no older CLI against the new pilots (maintainer policy above; linked nested/shell results; #158).

## Remaining evidence

The following #158 gates remain open or partial: additional failure/stale-signal recovery cases, actual separate background-session behavior (currently documentation only), longer lifecycle/race validation and real notification display, suppression, duplicate ownership, selection and activation. The real-Claude production-backend restart/replay control adds evidence, not soak or original-bug acceptance. Supported native negotiation, compatibility and removal of private cleanup remain gates for any future native adoption; that adoption is not the selected 0.11.0 direction. No reporter replacement, higher support floor or notification change is selected ([source decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6513190781); #158, #183, #176).

The retained Windows raw-transport runner is the reproduction artifact introduced in PR #189. The extended Claude/webview controls are exploratory pilots; their tables and linked issue comments are the retained measurement record, and local authored-fixture snapshots are not claimed as a shipped runner. Before production adoption, repeat the accepted matrix against an exact candidate with a retained harness and complete the outstanding gates (#158; #183).

The original 0.9.0 typing failure remains unlocalized. The original affected machine is unavailable; physical keyboard testing on another Windows machine and a current visual-corruption reproduction remain outstanding (#180, #56). A native-status transport result cannot satisfy those acceptance gates (#183).
