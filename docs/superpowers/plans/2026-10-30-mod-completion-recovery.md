# Mod completion recovery implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task using the existing native execution method. Obtain review of this recovery contract before implementation.

**Goal:** Recover the demonstrated single lost-child-completion case while preserving Claude turns, active subagents, input waits and unread state (#158, [controlled failure](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6521185213)).

**Architecture:** Proposed: the retained mod schedules a bounded retry of a child completion it has already confirmed. Each observed start carries a generation token, so a delayed retry cannot end a newer start with the same agent ID. The host uses the existing child-completion transition; inventory remains a test oracle rather than a new authority (`src/attention/attentionSignalWatcher.ts:L133-L212`; demonstrated failure: #158 comment 6521185213).

**Tech Stack:** Existing JavaScript mod, PowerShell signal writer, TypeScript processor and Mocha tests (`media/attention/hooks/register.js:L1-L65`; `media/attention/report-activity.ps1:L75-L124`; `test/unit/attentionCompletionMod.test.ts:L1-L43`).

**Spec:** `docs/superpowers/specs/2026-10-28-rendering-activity-reliability-investigation-design.md`; this narrows Task 7 of `docs/superpowers/plans/2026-10-28-0.11.0-reliability-milestone-plan.md`, rather than replacing the release plan (#183).

## Evidence and status

- Status: proposed recovery contract, not implemented. Mod authority is already approved; do not ask for that source decision again ([decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6513190781)).
- Losing one published child completion left the unchanged processor working at 60 seconds despite later parent completions and matching ended-agent inventory. The mod did receive the child's confirmed completion before the injected publication loss. This was deliberate loss, not an observed OS delivery failure or the original typing root cause ([controlled failure](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6521185213)).
- Actual Claude 2.1.287 startup calls proved `$.clock.after()` available; its generated timer has `cancel()`. Its generated global declarations also expose `crypto.randomUUID(): string`. Background workload and retry admission on that version still require testing ([floor control](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6521290292)).
- Build-generated declarations govern compatibility: https://code.claude.com/docs/en/plugins/mods/create (fetched 2026-10-30).
- Context artifact check: `git ls-tree HEAD -- docs/superpowers/specs/2026-10-28-rendering-activity-reliability-investigation-design.md docs/superpowers/plans/2026-10-28-0.11.0-reliability-milestone-plan.md` returned both existing artifacts before committing this proposal. Experiment evidence is durable in the linked issue comments; ignored experiment files are not deliverables of this proposal.

## Global constraints

- Keep Claude Code **2.1.287**, existing PTY defaults, readiness/fallback and Windows notification ownership. Native OSC 7501 remains experimental ([approved decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6513190781)).
- Busy means Claude turns plus active subagents; shell jobs alone do not hold it busy ([policy](https://github.com/glitchwerks/vscode-claude-workspaces/issues/158#issuecomment-6512190798)).
- Recovery may only deliver an already confirmed child completion. It must preserve independent parent activity, waiting stages and unread state, and create no notification (`src/attention/attentionSignalWatcher.ts:L133-L212`).
- Diagnostics retain metadata only: no prompts, answers, descriptions, paths, raw IDs, generation tokens or terminal text. Physical keyboard, visual soak and publication gates remain open (#180, #56, #183; investigation spec).
- Proposed bounds below are implementation choices for review, not measured typing budgets or guaranteed delivery. Worker death/reload, complete channel loss, lost start/hook dispatch and lost parent completion remain outside this correction (#158 comment 6521185213; README.md lost-completion limitation).

## Proposed recovery contract

1. Add optional `agentGeneration` to validated starts and child completions; wire payload name `agent_generation`. Keep schema version 1. Do not add a new activity authority or synthesize completion from inventory. Existing child completion already removes only matching owned work (`src/attention/attentionSignalWatcher.ts:L145-L169`).
2. Each observed start gets a token generated once per actual hook dispatch and reused by transport retries. Exact proposed format: worker nonce from `crypto.randomUUID()`, a dot, and a monotonically increasing positive safe-integer start counter in base 36. Accept ASCII tokens matching `[A-Za-z0-9.-]{1,128}`. Nonce/counter failure uses the legacy path; it must not reuse a token. A new start for the same ID replaces the old generation (proposal addressing the current ID-only set; floor declarations described above).
3. A generation-bearing start requires the same generation for ordinary completion and retry. Legacy starts/completions without a generation remain a matched legacy pair. A completion without a generation cannot clear a versioned entry. Duplicate, unrelated and wrong-generation completions are ignored. Preserve existing ready and session-identity checks (`src/attention/attentionSignalWatcher.ts:L118-L169`).
4. Proposed controller storage bound: 256 records total, each an observed active start or a confirmed completion pending retry. A new start for a tracked ID replaces its record. On overflow, a new ID takes the existing legacy path with no retry guarantee, so normal completion still works. Never evict a live versioned entry just to admit another (boundedness requirement in investigation spec).
5. Capture the child's generation before awaiting downstream `next(e)`. Only after it resolves may the mod publish and retain the existing allowlisted completion fields. Retry answer, refusal, error and aborted child completions alike, preserving their reason and abort flag. Never retry parent completions, because they affect unread state; never retry an untracked child or legacy pair (`media/attention/hooks/register.js:L56-L65`; `src/attention/attentionSignalWatcher.ts:L145-L189`).
6. Proposed retry timing: always attempt one child retry 5000 ms after the initial publication finishes, even if the writer returned success, because a write is not a host receipt. If that retry fails, allow two further attempts, 15000 ms and 30000 ms after the preceding failed attempt finishes. On successful retry, or after three retry attempts, release the record. The existing PowerShell I/O retry loop remains intact. This is bounded best-effort delivery, not an acknowledgement protocol (fault case: #158 comment 6521185213; existing retries in `media/attention/report-activity.ps1`).
7. Use one timer and one serialized retry publication at a time. Maintain each record's due time; schedule the earliest due record. All retry work runs outside the start/completion middleware's awaited path. Before every publication and after every await, require matching session identity, lifecycle epoch and generation. A new start cancels an old queued retry; a retry already in flight is rejected by the host generation check. A failed/rejected timer leaves the original path unchanged and releases affected retry records, rather than retaining unbounded state (proposal to limit the extra work; existing hot path: `media/attention/hooks/register.js:L10-L29,L51-L65`).
8. `session.end` cancels the timer, invalidates in-flight work and clears records. Initialize with the Claude session ID; repeated SessionStart with the same identity preserves records, while an identity change invalidates them. A worker reload loses its retry cache; claim no recovery guarantee across it. Fresh managed sessions still reject old managed/Claude identities (`src/attention/attentionSignalWatcher.ts:L118-L130`; floor timer contract in #158 comment 6521290292).
9. An accepted retry removes exactly its matching child and uses the existing parent/input-wait priority. It preserves unread and emits no waiting-stage transition. An ordinary successfully delivered child completion makes a later retry a harmless duplicate (`src/attention/attentionSignalWatcher.ts:L145-L169`).

## Review focus

- Same-ID resume while downstream completion, a timer or PowerShell delivery is pending: the newer generation stays working (contract 2, 5 and 7).
- Legacy and 257th concurrent start: normal completion still works without adopting uncorrelated retries (contract 3 and 4).
- Parent completion or missing confirmation: no synthetic response, unread flag, idle inference or retry (contract 5).
- API/timer/channel failure and session change during callbacks: preserve state and keep resources bounded (contract 6–8).
- Last child ends while parent is working or awaiting permission: retain the correct parent/wait/unread state (contract 9).

## Task 1: Generation-aware transport and host ownership

**Files:** Modify `media/attention/report-activity.ps1`, `src/attention/attentionSignalWatcher.ts`; extend `test/unit/attentionHookScript.test.ts` and `test/unit/attentionSignalWatcher.test.ts`.

**Interfaces:** `AttentionSignal.agentGeneration?: string`. Replace each session's active-agent set with a map from agent ID to optional generation. Keep the processor's public API and existing completion reasons.

- [ ] Add failing transport/reducer tests for a versioned start/completion pair, wrong/missing generation against a versioned start, malformed/oversized token, missing readiness and wrong session. Run `npm run compile:tests`, then `npx mocha "out/test/unit/attentionHookScript.test.js" "out/test/unit/attentionSignalWatcher.test.js"`; observe the new regression failures.
- [ ] Assert activity, unread and stages independently for parent-done/child-working, last child completion, still-working parent, permission wait, duplicate/unrelated/late completion, same-ID new start, legacy pairs and removal/restart. Assert zero notification-stage transitions from child retries. Keep new diagnostics metadata-only via the existing event enum.
- [ ] Implement only the proposed validation and generation-aware ownership. Reject malformed generation metadata before applying a state change; preserve legacy pairs, parent completions and ready markers.
- [ ] Pass focused tests, `npm run check:types` and `npm run lint`; commit `feat: correlate subagent completion generations (#158)`.

## Task 2: Bounded confirmed-completion retry

**Files:** Modify `media/attention/hooks/register.js`; create `media/attention/hooks/completionRetry.js`; extend `test/unit/attentionCompletionMod.test.ts` and create `test/unit/attentionCompletionRetry.test.ts`.

**Interfaces:** `createCompletionRetry(publish, { now = Date.now, makeNonce = () => crypto.randomUUID(), maxStarts = Number.MAX_SAFE_INTEGER } = {})` returns `activate(sessionId)`, `started(api, agentId): string | undefined`, `generation(agentId): string | undefined`, `completed(api, agentId, generation, fields)`, and `end()`. The optional dependencies let tests control time, nonce failure and counter exhaustion; production uses the defaults. `publish(api, fields): Promise<boolean>` returns true only on successful writer exit, retaining current fail-open diagnostics. `completed` schedules a known confirmation using the generation captured before downstream middleware. Undefined generation selects the unchanged legacy path.

- [ ] First fail controller tests for the demonstrated sequence: first child completion publication lost, parent completion delivered, child retry delivered, final activity waiting with unread unchanged. Use fake clock callbacks and deferred promises; no real sleeps. Give each mod harness a fresh module instance so module state cannot leak between tests.
- [ ] Fail tests for all five review-focus classes; answer/error/refusal/abort preservation; initial writer success versus failure; retry success; all three failed retries; missing clock API; refused/throwing timer; nonce failure; counter exhaustion; repeated same-identity initialization; identity changes; session end during every await; and 257 concurrent starts followed by normal completions. Assert one timer/publication, 256-record maximum, zero work when empty and no private event fields in payloads or logs.
- [ ] Implement the exact contract and import the helper through the existing single hooks module. Preserve downstream result/error identity, exactly-once `next` calls, initial publication order and the original readiness path. Validate and actually exercise the finished plugin on owned CLI 2.1.287 and 2.1.312 without changing the installed binary or saved settings. Revise the proposal if actual admission/semantics differ (#158 comment 6521290292).
- [ ] Pass controller/mod/transport/reducer tests, typecheck and lint; commit `fix: retry confirmed child completion after signal loss (#158)`.

## Task 3: Verify and document the correction

**Files:** Update `README.md`, `CHANGELOG.md`, `docs/reliability/native-status-evaluation.md`. Any manual runner or metadata artifact claimed as a PR deliverable must be tracked under `test/manual/` or `docs/reliability/`, respectively.

**Interfaces:** Repeat the fault in #158 comment 6521185213, using inventory solely as an independent test oracle. Records identify CLI/extension commit, executable hash, injected fault, generation matching, state before cleanup and natural versus forced termination.

- [ ] Repeat the same suppressed-child-completion control on both CLI versions, keeping the fault injector limited to the first publication so it does not also suppress the retry. Confirm waiting/unread preservation, zero input-wait stage/notification and no timer after retries finish. Record actual times; 5000 ms is not a guaranteed end-to-end deadline.
- [ ] Repeat active parent, concurrent/nested agents, same-ID resume, permission/question waits, blocked Stop continuation, abort/error, shell-job separation, hidden/recreated panel, restart/disposal and readiness-loss cases from the parent plan. Add controlled retry failure proving real active work stays busy. Static validation/startup API availability do not substitute for old-version workload coverage.
- [ ] Measure callback/extra-publication counts and diagnostics-off overhead during a bounded soak. Real-keyboard and visual candidate gates in #180/#56 remain separate; synthetic results cannot close them (#183 parent plan Task 9).
- [ ] Update README with the floor, retained authority, bounded retry policy and remaining lost-signal limitations. Run `npm run test:unit`, `npm run check:types`, `npm run lint`, affected integration tests and `git diff --check`; audit referenced artifacts with `git ls-tree HEAD`.
- [ ] Obtain fresh whole-branch review and resolve valid feedback; create a focused PR into `prerelease/0.11.x`, referencing #158/#183 without closing their unproven broader criteria. Commit `docs: record bounded completion recovery and validation (#158)`. No tag/promotion/publication is authorized by this plan (#183 parent plan Task 9).

## Lifecycle

Delete this plan when its implementing issue closes, after preserving durable rationale in #158 or the implementing PR and redirecting committed references (maintainer-supplied AGENTS.md). Keep the parent plan until #183 completes.
