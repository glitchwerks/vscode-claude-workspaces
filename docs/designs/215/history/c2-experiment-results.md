# C2 native Run admission experiment

* **Date:** 2026-11-07, America/New_York; raw receipts use UTC timestamps.
* **State:** Archived experiment findings. The author subsequently deferred Run from v1; C2 is deferred, not solved or qualified. [Deferral decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6715993295).
* **Authority:** The author approved the focused experiment after reviewing its scope. [A]
* **Scope:** Disposable VS Code native terminals and synthetic commands only. No Claude launch/model call, subscription change, product implementation, merge or release. [A; S]

**Reading this record:** the results, recommendation and then-open author decision below preserve the experiment checkpoint. The later deferral removes Run from the active [v1 plan](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/design_draft.md); it does not change any native observation, raw receipt or original harness.

## Result

**The proposed readiness/start/end guards do not establish the required admission boundary.** Partial typed input was lost on both tested VS Code builds. Two controlled event-delay trials admitted Run while a foreground command had already started; that work then ended with exit code 1, its completion marker was absent after the full observation interval, and the Run marker existed. Checking and dispatching in the same extension-host JavaScript turn did not prevent this injected event-delivery race. These are observed counterexamples, not a claim that every competing-input attempt fails. [R2:L1394-L1424; R3:L2822-L2852; R4:L4215-L4272, L4320-L4538; S]

**Recommendation for the author's decision:** retain reliable command/path copying as the first-version priority and defer one-click Run unless a separately designed exclusive input/dispatch boundary is selected and qualified. This would change the approved Run scope and is a recommendation only; no scope reduction, fresh-shell substitution or weakened guarantee has been applied. Persistent shell reuse is still the selected design. [Design: Goals 1-8; Run: Persistent shell lifecycle; R2; R3; R4; engineering judgment from the counterexamples]

## Method and environment

The harness uses the public VS Code terminal creation, shell-integration execution, start/end and closure APIs. It supplies competing native input through the workbench sendSequence command in an isolated Extension Development Host. This exercises real pwsh and PTY processing, without a physical keyboard or the companion product UI. The small admission function models only the proposed ready/busy/closed/duplicate/pending guards; it is not production code. [S; V1; V2]

| Run | Build / commit | Recorded cases | Observation |
|---|---|---:|---|
| short-current | VS Code 1.144.0 / 2c33b50b16c472efe58357d1d2a8a5414bc23fbf | 8 | Initial 1.7-second competing commands and 2.2-second stale-idle negative control. [R1] |
| long-current | Same 1.144.0 build | 9 | Adds a native partial-input control; uses 6.5-second foreground commands. [R2] |
| long-cached | VS Code 1.135.0 / 08d4889f9ec4a1685d257b9b95de036c8e1ce1e5 | 9 | Same longer suite, using an existing cached build. [R3] |
| event-delay-current | Same 1.144.0 build | 3 | Two injected event-delay trials, an interactive prompt negative control and closure before notification. [R4] |

All measured runs used Windows pwsh 7.6.9, automatic shell integration and the normal PowerShell profile, with only -NoLogo supplied as explicit shell arguments. VS Code user data/extensions were isolated per run; each synthetic workspace included spaces and Unicode, and a subfolder tested cwd persistence. Four hosts exited 0 with 29 case records and zero harness errors. All 30 terminals from completed runs emitted closure events. A successful harness exit means the observations completed; the non-interruption requirement failed. [R1-R4; S]

An initial sandboxed host exited before initialization. The first initialized preflight then timed out because the harness supplied unsupported automatic-injection arguments (-NoProfile/-NoExit). Installed injection code accepts the tested single -NoLogo form; changing only the arguments allowed integration to start. The failed preflight and its original suite are preserved. It is a harness setup failure, not a product regression. [R0; I; S]

## Observed behavior

| Scenario | Result and limit |
|---|---|
| Idle execution and persistent state | Command ran; environment value and changed subfolder survived the next Run in the same shell. Reported cwd matched the subfolder, allowing Windows path case differences. [R1:L24-L30; R2:L1359-L1365; R3:L2787-L2793] |
| Duplicate clicks | First action submitted; same action ID was inert; a second action while pending was blocked. One marker append occurred. This validates the disposable guard around native dispatch, not a product webview integration. [R2:L1366-L1384; R3:L2794-L2812; S] |
| Known busy | Guard rejected Run; existing foreground command completed and no Run marker appeared. [R2:L1385-L1393; R3:L2813-L2821] |
| Partial native input, control | Typing without Enter and then pressing Enter preserved the original command. [R2:L1394-L1405; R3:L2822-L2833] |
| Partial native input, Run | Guard still saw ready/idle. Run submitted and executed; the typed command did not survive pressing Enter afterwards. Reproduced in all three main suites on both builds. [R1:L59-L77; R2:L1406-L1424; R3:L2834-L2852] |
| Ordinary competing-input trials | All twelve trials preserved the native foreground command and also executed Run. This bounded scheduling outcome is not an atomic ownership guarantee. [R1:L78-L156; R2:L1425-L1503; R3:L2853-L2931] |
| Delayed start-event delivery | Two trials deliberately held extension-host callback delivery while independent workbench/PTY processing started the native command. Its start marker existed before admission, while the guard still saw busy=false. Run submitted, the foreground command ended with exit code 1 and no completion marker, and Run executed. Same-turn check/dispatch did not prevent this failure. [R4:L4215-L4272, L4320-L4538; S] |
| Stale-idle negative controls | Explicitly bypassing the current-busy guard preserved the short 2.2-second command, but interrupted the longer 6.5-second commands on both builds. These controls demonstrate API behavior; they are not presented as guarded-controller trials. [R1:L157-L171; R2:L1504-L1518; R3:L2932-L2946] |
| Interactive prompt negative control | Calling execution while Read-Host was known busy cancelled the prompt and executed Run. No command text was observed as the prompt's input; wrong-input-owner delivery was not demonstrated. A real guard would reject the known-busy case. [R4:L4273-L4286, L4540-L4684] |
| Integration not yet available | Immediate admission on a newly created terminal rejected unknown state; no Run marker appeared. This does not qualify permanently disabled integration or loss after readiness. [R2:L1519-L1535; R3:L2947-L2963] |
| Closure observed before admission | Guard rejected closed state with no execution or automatic retry. [R2:L1536-L1543; R3:L2964-L2971] |
| Closure before its event arrives | API returned a submission before the closure notification, but no Run marker appeared. Submitted cannot be treated as proof of execution. No retry occurred. [R4:L4287-L4316] |

## Interpretation and remaining decision

The partial-input failure requires no artificial event delay: start/end events describe executed commands and do not expose the typed prompt buffer through the tested public guard. The controlled delay additionally shows why an event-based idle snapshot is not an exclusive lease on the PTY. The inspected native dispatch implementation waits for a prompt in some circumstances and can send Ctrl+C before inserting the next command; its public API also explicitly allows interruption. These facts explain why the short foreground controls could pass while longer or delayed cases failed. [R1-R4; I; V1; inference about guard sufficiency]

C2 therefore remains open. The current plan cannot be called implementation-ready merely because duplicate, known-busy and readiness checks worked. Options for an explicit author decision are to defer direct Run while retaining Copy and native terminal access, or to design/qualify a stronger input-ownership mechanism before enabling Run. Treating Run as best effort would weaken the selected requirement; using fresh shells would change the selected persistent lifecycle. Neither is approved by this experiment. [A; Run:L41-L53; R4; engineering judgment]

This evidence does not qualify Git Bash, the declared minimum VS Code version, remote hosts, arbitrary PowerShell profiles, shell-family matching, later integration loss, the real companion UI or package behavior. It does not rerun Claude question/permission/Escape controls or C4 capture. Those earlier decisions remain unchanged; all broader qualification obligations remain. [S; R:limits; Design]

## Reproduction and artifact checks

The [source bundle](evidence/c2-harness-source.json) preserves the exact short/long/edge suites, shared launcher/settings/manifest, original failed-preflight suite, materializer and verifier. The [receipts](evidence/c2-native-receipts.json) preserve parsed records plus the exact original JSON text and SHA-256 for each successful run. Original scratch paths in those records are provenance, not dependencies; the bundle creates fresh fixture/output paths. Installed dispatch/injection excerpts and whole-bundle hashes are archived with the receipts. [S; R; I]

From the repository root, materialize the source and receipt-consistency checker. All .tmp paths in this example are generated outputs, not expected committed inputs:

~~~bash
node -e "const f=require('node:fs');const b=require('./docs/designs/215/evidence/c2-harness-source.json');f.mkdirSync('.tmp/215-c2-repro',{recursive:true});f.writeFileSync('.tmp/215-c2-repro/materialize.cjs',b.materializer);f.writeFileSync('.tmp/215-c2-repro/verify.cjs',b.verifier);"
node .tmp/215-c2-repro/verify.cjs
node .tmp/215-c2-repro/materialize.cjs "C:/Program Files/Microsoft VS Code/Code.exe" 2c33b50b16c472efe58357d1d2a8a5414bc23fbf long "C:/Program Files/PowerShell/7/pwsh.exe" --run
~~~

Substitute the actually installed executable/build commit and pwsh path; edge selects the controlled-delay suite. The launcher creates a unique isolated profile and only disposes its owned terminals. Running reproduction opens a disposable native test host and executes the documented synthetic commands. [S]

The verifier completed 44 source/receipt consistency assertions, including original-text hashes, exact suite hashes, case counts, marker outcomes and syntax checks. Those assertions confirm that this report's negative findings match the archived observations; they do not turn a failed admission requirement into a passing product test. [S:verifier; R1-R4]

## Sources

* **A:** [Author authorization for the focused C2 experiment](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6715839034).
* **Design:** [Approved companion design](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/design_draft.md), especially Goals and Detailed Implementation item 7.
* **Run:** [Selected persistent Run lifecycle and C2 gate](run-amendment.md).
* **S:** [Exact disposable source bundle](evidence/c2-harness-source.json), including named suites, materializer and verifier.
* **R:** [Native receipts archive](evidence/c2-native-receipts.json). R1: evidence/c2-native-receipts.json:L14-L1347; R2: L1349-L2775; R3: L2777-L4203; R4: L4205-L4826. L references above refer to this same archive.
* **R0:** evidence/c2-native-receipts.json:L4828-L4871, preflight failure.
* **I:** evidence/c2-native-receipts.json:L4872-L4891, installed-build dispatch/injection excerpts and SHA-256. These pinned implementation excerpts explain the tested builds; they are not a supported extension integration surface.
* **V1:** [Official TerminalShellIntegration API](https://code.visualstudio.com/api/references/vscode-api#TerminalShellIntegration) (fetched 2026-11-07).
* **V2:** [Official extension-test host instructions](https://code.visualstudio.com/api/working-with-extensions/testing-extension) (fetched 2026-11-07).
