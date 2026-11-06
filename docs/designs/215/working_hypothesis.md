# Copying Claude's suggested commands and paths: review hypothesis

* **Author:** Christopher Beaulieu
* **Date:** 2026-11-05
* **Parent work:** [#215](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215)
* **State:** Fixed input for an authorized EGM BRAINSTORM review, not an approved implementation design.

## Anchored hypothesis and user problem

The first version should make suggested commands and file/folder paths easy to copy from Claude's output without selecting wrapped terminal text. Paths commonly occur within explanations or inline code, and their Copy action must copy only the path, without surrounding prose or Markdown. Keep the same subscription-backed CLI, native Escape for Stop, and a raw-terminal toggle; direct question and permission controls are optional. The maintainer confirmed this hypothesis for Goldfish review after several clarification turns. [S0]

The existing companion design is a broader, unapproved proposal. This review must assess the narrower copying concept, not treat all of that design's interaction machinery as mandatory. The companion remains the previously selected direction; reviewers may challenge its cost versus simpler approaches, but no architecture pivot is authorized by a review recommendation. [S0; D0]

## Confirmed needs and boundaries

- Core: copy the entire command Claude suggests, including intended quoting/newlines, without terminal wrap artifacts. [S0; R1]
- Core: separate copyable file/folder path spans from surrounding explanations or inline formatting. Copy only the path. No specific detection grammar, path normalization policy or absolute/relative conversion was approved. [S0]
- Existing needs also include copying commands Claude ran, distinguishing execution provenance, readable headings/lists/code and retaining interactive CLI access. These were not explicitly withdrawn; prioritize the new core and label any proposed deferral rather than inventing user agreement. [R1; S0]
- Same subscription-backed interactive Claude Code CLI, without requiring an API key or separately billed inference backend. [R2; E3]
- Raw-terminal access remains available, and some switching for questions/permissions is acceptable. Direct handling of those interactions is optional for the first version. [S0]
- Native Escape is the chosen foreground Stop path. An API turn-abort result is not proof that a running command stopped. [S0; E3]
- This review does not authorize product implementation, new live model experiments, authentication changes, dependency installation or release. [S0; #215]

## Existing evidence and its limits

These are historical observations, not claims about untested future CLI builds. The source archives and reports below are durable issue comments. [E1; E2; E3]

| Source | What was observed | What remains unproven |
|---|---|---|
| Companion experiment | Claude Code 2.1.317 / Pro; a standalone browser using the actual repository xterm adapter; real clipboard copying of long, multiline and executed commands; logical content preserved with Windows LF-to-CRLF conversion. | Packaged extension behavior, unconstrained suggestion detection, path-span detection/copying, long sessions, accessibility and performance. |
| Native mod comparison | Classic keyboard Copy helpers worked; inline clickable actions used the fullscreen mouse path. Fullscreen/grouping/progress/accessibility/API-version risks remained. | That native modification is either cheaper or impossible for the newly narrower need. Reassess rather than assuming. |
| Focused controls | Direct question answers and Bash Allow once/Deny worked; distinct concurrent requests and native-first completion were exercised. | All dialogs, identical-input correlation, subagents, transport loss and broader build support. These are optional-control costs, not necessarily first-version copying costs. |
| Stop comparison | Native Escape interrupted a shell fixture; its final marker stayed absent after its 20-second delay. The tested turn-abort API instead backgrounded a running Bash command, which subsequently finished. | Universal stopping of background work or all agent configurations. Preserve native semantics; do not label a background task stopped from a turn flag alone. |

The earlier research inspected main at 38cab4e6fdeaee2159de93241f138d9bb2d1c73b and the tested prerelease runtime at ef5fd48f4b676881a8730afbf8e583e70565ca11. That runtime already had a composer bridge, metadata-only attention reporting, PTY replay and an xterm renderer. The historical source links in the report distinguish committed runtime code from the standalone probes. [P1]

## Choices to stress-test, not assumed decisions

1. Whether a copying-focused companion should be a small source-backed extraction panel rather than a full second conversation renderer. The previous graphical direction is selected; a lighter native or hybrid alternative is a counterproposal requiring maintainer agreement, not a previously rejected option forever. [S0; D0; E2]
2. Whether removing mandatory question/permission controls lets the first version avoid their response bridge, pending-request ownership and native/companion approval races. Ordinary native input and Stop must still work. [S0; E3]
3. How to identify complete path boundaries in prose/inline code without copying surrounding punctuation, truncating a real path or inventing path semantics. Spaces, quotes, relative paths, drive letters, UNC forms and line suffixes are examples for review, not a confirmed support list. [S0; author's test questions]
4. Whether “copy as shown” is the appropriate default for a path, versus normalization, expansion or resolution. No transformation is authorized yet. Distinguish a copying contract from Open file/link behavior. [S0; author's test question]
5. How to distinguish an instruction to the user from an example or an already executed command without adding a paid classifier or giving uncertain content an authoritative label. The earlier copy experiment used controlled suggestions. [E1; P1]
6. How much live output/history, formatting and duplicated state is actually needed for the copying workflow. Do not demand a complete chat product merely because a full chat prototype exists. [S0; D0; author's scope question]
7. How to fail visibly and retain native access when structured capture is partial, unavailable, stale or capped. Exact clipboard contents and ambiguity matter more than visually polished wrong Copy actions. [R1; E1; E3]

## Review request and evidence rules

Mode is **BRAINSTORM**, not implementation-readiness audit of an approved design. Use the seven installed personas' BRAINSTORM instructions: architecture/cost, observability, simplicity/reuse, UX, compatibility, maintenance, and inventive alternatives. Challenge this hypothesis on its own merits. Do not obtain parent conversation history or memory, and do not read other reviewers' findings. No production files, tests or dependencies may be changed. [EGM review procedure]

Read your installed persona and this entire input before returning findings. Include read evidence in the report (persona filename, target path and target SHA-256, and any additional source/standard read). The coordinator has four total agent slots including the parent, so the seven lenses must use independent bounded parallel batches; this limit is not a claim that all seven ran simultaneously. Parent-turn isolation is available; host instruction-file exclusion has not been separately verified. [Host constraints; EGM Codex integration]

Every material factual claim or decision-driving judgment must cite this input's lines/section or a verifiable source. State inference as inference and unverified claims as unverified. Hypothetical failure cases are review questions, not proof that a bug exists. Distinguish a blocker to the copying goal from optional-control implementation work. Return findings, mitigation candidates and secondary costs in plain English. No extra LLM backend, API billing, third-party eligibility or new dependency capability should be assumed. [R2; E1; E3; P1]

## Sources

- **S0:** [Maintainer's narrowed copying requirement and review authorization](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6674402079).
- **R1:** [Earlier approved needs](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6645367194).
- **R2:** [Subscription requirement](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6645377864).
- **D0:** [Broader design proposal at its existing committed checkpoint](https://github.com/glitchwerks/vscode-claude-workspaces/blob/7b586014295c39b34efb2ade6fce42dcb08536c3/docs/superpowers/specs/2026-11-04-companion-output-design.md) and [PR #216](https://github.com/glitchwerks/vscode-claude-workspaces/pull/216). It is background, not the narrowed hypothesis.
- **P1:** [Prior art, source baseline and authentication research](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6645475201).
- **E1:** [Companion copying/rendering experiment](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646355033).
- **E2:** [Native comparison](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646855408).
- **E3:** [Control experiment, Stop counterexample and limits](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6647481988), with [preserved source/receipts](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6647462596).
