# Companion qualification preparation (#225)

Status: **unqualified; native acceptance pending**. The committed qualification
fixture contains no production passing entries. This guide prepares separately
authorized qualification; building a VSIX or passing a bootstrap does not qualify
the product. Sources: [#225](https://github.com/glitchwerks/vscode-claude-workspaces/issues/225),
[preparation scope](https://github.com/glitchwerks/vscode-claude-workspaces/issues/225#issuecomment-6885001583).

## Safe source checks

From the repository root, with the already installed project dependencies:

```text
node test/manual/companionNative.smoke.cjs --plan
node test/manual/companionNative.smoke.cjs --self-test
npm run check:types
npm run lint
npm run compile:tests
node node_modules/mocha/bin/mocha.js out/test/unit/companionCapture.test.js out/test/unit/packageAssets.test.js
npm run build:production
npm run package:prerelease
```

The launcher is import-safe and defaults to `--plan`. These two safe modes do not
probe Claude, authentication, VS Code or a browser. Ordinary capture tests include
synthetic filesystem/Node child tests; they do not qualify an Electron backend.
Run the full unit and Windows extension-host integration gates separately before
acceptance. The current package is 0.13.0 on `prerelease/0.13.x`, using the
prerelease guard; the original design's 0.11.x command row is historical.
Sources: `package.json:38-52`, #220 / PR #232, #225.

The manual runner and browser entry live in `test/manual`; the matrix lives in
`test/fixtures/companion/qualification.json`. They are development artifacts and
are excluded from the VSIX by `.vscodeignore`. The browser entry imports the
complete production browser entry, including Xterm, composer and Companion.
Sources: `.vscodeignore:16-24`, `test/manual/companionNativeWebview.ts:1-2`.

## Explicit live workflow

Obtain separate authorization for the exact candidate, executable/profile, model
work, bounded workspace and physical/native observations. Do not install, sign in,
change providers or publish as part of source checks. The initial design target
2.1.317 is a target, not an admitted version range. Keep unsupported builds and
unknown Electron profiles fail-closed. Sources: #225 and
`src/companion/companionCapabilities.ts:25-43`.

Before the live run, the operator provisions an isolated extensions directory
under this repository's `.tmp`, containing only the pinned candidate and VS Code
installation metadata. Installation requires its own authorization. Supply an
existing Windows VS Code executable and an existing Playwright module; the
launcher never downloads either. Use a new owned workspace containing synthetic
fixtures only. Existing subscription credentials may be used by the CLI; do not
copy credentials into the config or receipts. Sources: #225; launcher preflight.

Create an untracked JSON configuration under the task's owned `.tmp` directory
with exactly these fields, replacing every illustrative value with reviewed
observations. Do not derive `profile` from the running process to approve itself:

```json
{
  "cliExecutable": "C:/absolute/reviewed/claude.exe",
  "cliVersion": "2.1.317",
  "vscodeExecutable": "C:/absolute/reviewed/Code.exe",
  "vscodeVersion": "1.136.1",
  "extensionsDirectory": "C:/absolute/repository/.tmp/225-installed/extensions",
  "installedExtension": "C:/absolute/repository/.tmp/225-installed/extensions/candidate",
  "vsix": "C:/absolute/reviewed/candidate.vsix",
  "playwrightModule": "C:/absolute/existing/playwright/index.js",
  "sdkFile": "C:/absolute/reviewed/native-sdk-declarations.d.ts",
  "sourceSha": "replace-with-exact-40-character-source-SHA",
  "profile": {
    "platform": "win32",
    "arch": "x64",
    "node": "replace-with-reviewed-exact-version",
    "uv": "replace-with-reviewed-exact-version",
    "electron": "replace-with-reviewed-exact-version"
  }
}
```

Invalid or incomplete configurations are rejected. Record how the SDK declaration
file was associated with this exact CLI build; a hash of an unrelated SDK file is
not compatibility evidence. Record actual subscription auth-kind and absence of
environment, workspace and CLI provider/API-key overrides without account details
or values. The launcher's environment-name check is only one part of that audit.
Sources: #225; `src/companion/companionCapabilities.ts:1-43`.

```text
node test/manual/companionNative.smoke.cjs --run-live --mode bootstrap --config C:/absolute/owned/config.json
node test/manual/companionNative.smoke.cjs --run-live --mode packaged --config C:/absolute/owned/config.json
node test/manual/companionNative.smoke.cjs --run-live --mode performance --config C:/absolute/owned/config.json
```

`bootstrap` runs the real production provider in a real WebviewPanel and uses
normal production renderer/Xterm and activation orchestration. It injects the
explicit qualification and exact-profile coordinator probe through the existing
trusted activation seam. Its receipt is permanently labelled
`injected-development-nonqualification`; it cannot become a normal-package
receipt by changing `mode`. The production default coordinator still rejects
Electron/unknown profiles. Sources: `src/extension.ts:128-148`, #225 preparation
scope, `src/companion/companionCapture.ts`.

`packaged` activates the installed extension normally. A separate development
controller drives the test; the product must resolve to the verified installed location, expose its normal
activation API, and match the complete VSIX assets. Installation-only manifest
`__metadata` is the sole manifest comparison exclusion. Source SHA, canonical Git
index fingerprint, bundle/VSIX hashes, actual host runtime, CLI hash/version and
SDK hash are recorded; executable/SDK/candidate read-back is repeated at the end.
Sources: launcher `candidateIdentity` / `run`; #225.

The final route generates a new 128-bit synthetic path nonce for the newly
launched session. The operator asks Claude to return it as inline code. The
controller reads the normal installed webview through loopback CDP: it requires
the candidate's script URL, canonical host view ID, active capture, the exact
assistant code literal and one enabled visible Copy target. It overwrites the
clipboard with a unique sentinel, clicks that product target once, requires its
successful feedback, reads the real clipboard and verifies the selected
session/view/group/target did not change. A user-supplied success flag cannot
satisfy this predicate. Current empty production admissions leave it pending.
After separately reviewed admission, fresh actual evidence can satisfy this
necessary predicate; it still cannot satisfy the remaining matrix by itself.
Sources: #225; `src/panel/webview/companion/view.ts:231-306`;
[Playwright CDP API](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp)
(fetched 2026-11-14). CDP compatibility must be checked on the selected host; a
connection/observation failure is not a pass.

Each run has fresh owned user-data/storage and a 60-minute work deadline, with a
one-minute host-start allowance. Host stdout/stderr are discarded after byte
counting; output limits also stop the owned host. Timeout sends one termination
request to that host only. Unknown native producers and storage are retained.
The runner never recursively deletes its workspace, capture, user-data or
receipt directories. Sources: launcher `runOwnedHost`; #225 lifetime criteria.

## Required case evidence

The fixture enumerates each P01–P29 path case, shell-language tags, generic and
inline code, long wrapped commands, intentional LF/CRLF, spaces, quotes, Unicode,
bare hinted names and uncertain-variable Review. Preserve all expected targets
when a source has several. Fixture expected values are authoritative; Windows
LF-to-CRLF conversion is the selected clipboard boundary. Copy checks first write
a sentinel so an old clipboard value cannot masquerade as a new Copy. Receipt
comparisons store hashes and UTF-8 byte counts, never uncontrolled clipboard
content. No uncertain write is retried. Sources:
`test/fixtures/companion/copy-cases.json`, selected contract
`docs/designs/215/implementation/design_draft.md:285-303`, #225.

Use the same managed PTY/session for healthy/unavailable Raw toggles, native
single/multi/free-text questions, Allow/Deny, unsupported dialogs and the single
Escape case. For the latter, ask the CLI to run a synthetic timed command such
as `node -e "setTimeout(()=>{},30000)"`; capture the native prompt/command state,
dispatch exactly one foreground Escape, and observe whether interruption actually
occurred. Record `inputSent` separately from `interruptionConfirmed`; sent alone
does not pass. Do not submit answers through Companion or introduce Run.
Sources: #225; selected design items 8–10.

Verify revision replacement, stale Review, eviction and reset against the literal
contract. Keep a sentinel clipboard while clicking an invalidated target; it
must not silently copy a replacement. Hold a platform clipboard write past its
feedback deadline and prove later Copy remains ordered/busy until settlement;
do not assume timeout cancels the platform write. For /clear/resume/UUID change,
show old targets invalidated, Raw retained and matching managed relaunch recovery.
Sources: #225; selected design items 3, 5 and 8.

## Independent native writer and host-death barrier procedure

The executable no-model Trial F source is now
`test/manual/companionNativeRendezvous.smoke.cjs`. Its source and pure synthetic
tests require independent review before separate native execution authorization. Only actual Trial F success makes the
host-death/quota Trial L and normal-exit Trial E dispatchable. A manual checkbox,
Node fake filesystem or host Promise delay is not the required evidence.
Sources: #225; [#222 lifetime correction](https://github.com/glitchwerks/vscode-claude-workspaces/issues/222#issuecomment-6812778602).

The accepted candidate barrier is **sdk-dispatch-pending/pre-next**, not an
OS-inflight request. The preserved 2.1.322 SDK declaration exposes hookable
`fs.write`, unchanged downstream `next(e)`, signal abandonment and parent
creation. The declaration hash is
`bfbbc814e3c033d7d9942f58a73cd57cbc5fa1edba0a664653ff4103ad4201bc`;
other builds are unsupported for this proposed probe until independently checked.
This is source-supported feasibility, not observed native behavior. A kernel
fault injector is not a prerequisite for this narrower evidence level. Sources:
#225 native preflight/ruling; `media/attention/hooks/register.js:99-108`;
`media/attention/hooks/companion/filePublisher.js:113-142`.

1. **Trial F, feasibility:** pin the exact reviewed binary/declaration/source
   hashes and fresh owned root. A separately owned controller holds the actual
   native producer; resource host H1 issues the real capture offer. A narrowly
   matched native `fs.write` hook holds only the first product-origin epoch-request
   upload, outside any model turn. At B1, retain its dispatch nonce, origin,
   target label/hash, byte count, zero downstream invocations, absent upload,
   producer-alive observation and signal state. Release once through unchanged
   `next(e)`; require the SDK-created upload’s exact synthetic hash/length and
   distinct downstream return/rejection. Repeat once beyond the publisher’s
   two-second watchdog. Missing hook, fail-open, abandonment or lost producer
   stops the protocol; no fake write or invented API may substitute.
2. **Trial L, host death:** only after F passes, use a fresh root and reach B1.
   At B2, terminate H1 alone through its owned process handle and observe actual
   H1 exit while the independently owned native producer remains pending/alive.
   Have H2 perform the real capture sweep. Require parent absence plus retained
   admission intent before release; do not manually remove the primary-trial
   parent. If the sweep fails, retain that result rather than claim recreation.
3. Prepare ten additional real H2 bindings. With the uncertain old intent, all
   eleven slots are occupied. One further prepare must refuse within the bound,
   without exposure or releasing the old intent. Release B1 once; require actual
   SDK-created parent/upload after death/sweep, matching the original synthetic
   hash/length. Recheck the retained intent and one refused admission after late
   effects. A ready marker is unnecessary after publisher watchdog expiry.
4. Record actual transport bytes/files and charged future footprint separately;
   do not double-count physical bytes already covered by a lifetime reservation.
   Require 32 MiB / 256-file aggregate and per-channel staging bounds. Eleven-slot
   saturation does not mean all physical bytes/files were filled. Controller
   refusal is distinct from the later mandatory product-visible capacity signal.
   If the former host’s observer is gone, controller-observed producer exit does
   not grant H2 new cleanup authority; preserve the uncertain intent/storage.
5. **Trial E, normal exit:** in a separate fresh root with a live owning host,
   use the actual ManagedPty/onExit bridge. Record the exact bound normal exit,
   eligible directory/intent cleanup and successful replacement admission with
   a new generation. Old/duplicate callbacks must not release the replacement.
   Termination settlement, SDK session.end, closed handles and host ESRCH are
   not this witness. Any SDK worker that outlives the managed PTY needs its own
   qualified lifetime relationship.

Proposed hard limits for the separate probe are one held dispatch/native CLI,
two resource hosts, ten additional bindings, 60 seconds per rendezvous, five
minutes total and 1 MiB of content-free receipts. Unexpected model/turn activity
aborts the no-model case. Timeout/abandonment does not authorize deleting uncertain
storage or forcing an aborted downstream call. Record monotonic controller
ordering, per-dispatch forward count/status, host/producer status, parent absence
and recreation, intent retention, admission durations/refusals, actual/reserved
bounds, exact exit proof and cleanup failures. Do not infer ordinary packaged
PTY/worker topology from a controller-owned producer bootstrap. Sources: #225;
#222 correction above; `src/companion/companionCapture.ts`;
`src/companion/companionRuntime.ts` (bound producer-exit observation).


### Trial F driver: safe commands and separately gated execution

Safe source checks (no native loading, CLI/version/auth command, model or PTY):

```text
node test/manual/companionNativeRendezvous.smoke.cjs --plan
node test/manual/companionNativeRendezvous.smoke.cjs --self-test
```

After independent source review and separate execution approval only, use
`node test/manual/companionNativeRendezvous.smoke.cjs --run-live --config C:/absolute/owned/config.json`.
The closed config requires exactly `nativeExecutable` (absolute existing local file),
`nativeSha256` (reviewed SHA-256), `declarationPath`, `declarationSha256`,
`nativeVersion` (exactly `2.1.322`), `sourceSha` (clean committed HEAD),
`ownedParent` (canonical local directory within repository `.tmp`) and
`hostProfile` with exactly `platform: "win32"`, `arch: "x64"`, exact actual
`node`/`uv` versions and `electron: null`. Supply `declarationPath` as an absolute canonical path to an external reviewed
SDK declaration (placeholder: `C:/EXTERNAL_REVIEWED_SDK/index.d.ts`, replace it
with the actual read-only input). Its bytes must match the exact pinned hash
above before native loading. The location is caller-supplied; this does not
accept another SDK/build identity. No generated helper depends on that external
file beyond this declaration identity check.
The existing native executable metadata is not version or authentication proof.
Sources: [Trial F scope](https://github.com/glitchwerks/vscode-claude-workspaces/issues/225#issuecomment-6886152648);
`test/manual/companionNativeRendezvous.smoke.cjs` (validateConfig/runLive).

Both explicit execution modes run bounded `--version` and `auth status` commands. Each requires
exit zero and `authMethod === "claude.ai"`; malformed, unsupported and unknown
responses remain unestablished. This observes authentication method, not a billing
plan. The driver preserves the existing authentication environment/settings and
refuses explicit provider/API-key/config-directory overrides; it never signs in.
Current CLI docs specify default JSON and this method, but are not proof of the
pinned build's runtime behavior. Sources:
https://code.claude.com/docs/en/cli-reference (fetched 2026-11-15);
https://code.claude.com/docs/en/authentication (fetched 2026-11-15); #225.

Each fresh trial generates all control-plugin and H1 host code from committed
source. H1 uses the actual capture resource, exact-profile coordinator probe,
real binding/environment and initial host offer. P is independently owned by the
controller. The explicitly injected `autoPoll: false` host schedule preserves the
created upload for read-back; it does not qualify ordinary host scheduling. Other
injections are the development product copy, control plugin loaded first, trusted
profile and disabled auto-updater. Normal production admission is untouched.
Sources: #225 Trial F scope; `src/companion/companionCapture.ts:78-87,830-853,1116-1131`.

The hook matches the exact product-origin request upload, hashes its original
UTF-8 bytes using declared `crypto.subtle.digest`, acknowledges entry outside
capture storage, waits for the controller's release, and calls unchanged
`next(e)` once. A matching native engine trace and independent file hash/length
are required. Failed-open, aborted, duplicate, missing or early effects cannot
pass. The pinned SDK gives hooks 10 seconds of own-time budget and explicitly
charges `clock.sleep`; the hook stops at 7 seconds or a 500 ms remaining-budget
reserve. Short/long controller holds are 100/3000 ms. Long elapsed time does not
prove the publisher watchdog callback ran: the receipt keeps it `unobserved`.
Sources: #225 native preflight correction; pinned SDK declarations
3637–3651,5401–5436,6964–7051,14799–14862,16514–16518,16562–16569;
`media/attention/hooks/companion/filePublisher.js:232-241`.

Bounds are two fresh trials maximum, one H1/one P at a time, one held dispatch,
60 seconds per rendezvous, five minutes for the controller, bounded owned-handle
teardown and 1 MiB per closed content-free receipt. Raw terminal/auth/error text,
tokens, upload payloads and local paths never enter that receipt. Unknown startup
interactions receive no automatic input; the scenario remains unestablished.
Successful F never stops H1 with a pending write. On failed/unestablished teardown,
P is terminated first with a bounded wait for its actual onExit. If that exit
remains unobserved, the source-preparation ruling permits one emergency stop of
owned H1 only, recording `producer-exit-unobserved`, `emergency-host-stop` and
`owned-process-cleanup-unresolved`. This exception stops the experiment without
a second trial; late files never rescue it into F/L/E or quiescence evidence.
Ten seconds are reserved inside the five-minute cap for teardown/checkpoint.
No global/shared daemon or unknown process is stopped. Checkpoints use atomic
replacement. Version/auth inspection children are retained by the controller and
must emit actual `close` before another native child may start. Timeout, output
overflow or a failed termination request receives a bounded close wait and an
enum-only unresolved-cleanup receipt; kill settlement is not exit evidence.
Each explicit native launcher mode exits after bounded cleanup and its
final checkpoint, including an unestablished result with surviving handles.
Import, plan and self-test never take that forced-exit path.

Output/startup failures remain latched through generated/product hash checks
and producer teardown. Native negative markers are monitored during that interval
and reconciled in a bounded strict final read after the owned exit wait. A late
failure disqualifies the trial despite successful cleanup and prevents the next
trial. Receipts require a verified final lifecycle with no disqualifications.
For `--run-live`, exit zero means a validated Trial F observation
only; it cannot pass any of the 63 qualification gates. L/E remain pending. Every
uncertain capture directory and immutable admission intent is preserved, including
after controller-observed exits. Sources: #225 Trial F scope; #222 correction above.

### One-hold diagnostic preparation

The inert command below prints the diagnostic scope without reading config,
starting a process, or loading an SDK engine:

```text
node test/manual/companionNativeRendezvous.smoke.cjs --diagnostic-plan
```

After independent review and **new, separate execution approval** for the exact
committed source/config only, the explicit command is:

```text
node test/manual/companionNativeRendezvous.smoke.cjs --run-diagnostic --config C:/absolute/owned/config.json
```

It uses the same closed config, pinned CLI/declaration/runtime identities,
existing authentication/provider guards (including the exact PowerShell tool
preference exception), no-model restrictions and teardown rules as Trial F.
It attempts exactly one 100 ms hold, with no long hold or retry. The normal
`--run-live` route still requires both 100/3000 ms holds. Both retain the
60-second rendezvous limit, five-minute controller cap and ten-second cleanup
reserve; uncertain storage remains preserved. Source:
`test/manual/companionNativeRendezvous.smoke.cjs` (`parseArguments`,
`trialHolds`, `runLive`, `liveEnvironment`, `stopOwned`); #225.

The diagnostic observes only the first entry and settlement of each fixed
stage: product startup links; product-origin session ID/version and the five
capture-environment reads; first stat/read/list; matching request write; and
first unmatched non-control write; and one reserved first target-candidate write.
The candidate slot compares the basename derived from the generated TARGET
after splitting both separators. An earlier unrelated write cannot consume it;
exact-match writes also qualify. Candidate entry records separate exact-path,
slash-equivalent-path, target-basename, expected-plugin and expected-user-tier
booleans, plus a fixed observed tier (`prepend`, `user`, `append`, `builtin`,
`core`, `unrecognized`, or `not-observed`) and `filter-match`,
`filter-fallthrough`, or `unverified` decision. No path, basename or arbitrary
origin name is retained. The existing combined origin check remains available.
A filter decision describes the predicate only; it does not prove hold entry or
interception. The startup trace can describe product links below control, but
cannot prove the fs.write dispatch chain or same-tier cross-plugin order. Stat spelling comparisons (exact, slash-normalized,
and case-folded) are observations only. Control-read checks describe the initial
offer schema and equality with bounded values held transiently by the observer.
These checks do not change producer validation or admit a path alias. Sources:
`test/manual/companionNativeRendezvous.smoke.cjs` (`createNativeDiagnostic`);
`media/attention/hooks/companion/filePublisher.js:97-114,174-204`;
pinned declaration (hash above) 5295–5329,7551–7585,7673–7678,7696,7713–7714,
7804–7810,7836,12874–12900.

Every new pass-through observer sends the identical event to `next(e)` once
and preserves the returned object or original rejection. The existing matching
write interception still applies its original failure/deny guard, including
`dispatch-rejected`; diagnostics neither replay nor replace that guard. All
diagnostic work is awaited within its event frame. Entry-checkpoint I/O does not
block starting the original continuation, but waiting for diagnostic I/O can
delay settlement. Missing/late observations in this instrumented topology do not
establish an intrinsic producer fault. A diagnostic-write failure
sets an in-memory latch that later checkpoints can snapshot, without turning
a successful downstream SDK call into a producer failure. Each checkpoint
snapshots prior known failures before its own writes. A final write can store
its marker and then reject, leaving no later checkpoint to record that failure.
Files alone therefore cannot attest the writer's last SDK return; a false
`unverified` snapshot is not a writer-success certificate. Diagnostic self-writes
are excluded from observation. Sources: driver `register` /
`createNativeDiagnostic`; pinned declaration 6977–6983,7020–7039,8270–8296.

Fourteen fixed stages produce at most 28 immutable checkpoints form one finite logical diagnostic record.
Each data checkpoint is capped at 1536 bytes. The controller checks the byte
count and SHA-256 of the exact bounded bytes read from a stable regular,
single-link file handle before parsing the data JSON. Reserializing JSON cannot
substitute for this check: whitespace and duplicate keys can change the raw
bytes without changing the parsed value. Interrupted/uncommitted writes,
sequence gaps, incomplete stages and invalid schemas remain unverified. Total diagnostic
bytes are bounded at 64 KiB; the whole receipt stays bounded at 1 MiB. The flat
trace projection visits at most 64 entries and retains at most eight expected
product/core tier/outcome pairs. It never traverses `received` or `returned`;
unknown outcomes and truncation are explicit. No environment value, ID, token,
control/payload text, local path, raw error, arbitrary plugin name or raw trace
enters diagnostic records. Sources: driver `diagnosticShape`,
`createNativeDiagnostic`, `readDiagnosticBytes`, `collectDiagnostic`, `validDiagnosticEvidence`;
pinned declaration 7031–7039,14792–14851.

The controller snapshots observation-end time, phase, status and reason before
finalization and records only bounded owned-exit code/signal classifications.
The v2 observation-end snapshot also copies `filePresent`, `fileBytes` and
`fileSha256` from the existing bounded file read consumed by that observation,
without another read. Known absence is `false`/`null`/`null`; an unknown or
invalid read is `null`/`null`/`null`. Valid presence retains 0–4096 bytes and
the existing SHA-256, including an empty-file hash for zero bytes. Later final
reads cannot replace these scalars. The snapshot does not weaken early-file
rejection or establish why a file existed.
An already failed/unestablished observation keeps that first status/reason;
late failures and a failed final read still disqualify it and prevent another
trial. These observations confer no cleanup/quiescence authority. Sources:
driver `diagnosticObservationEnd`, `diagnosticExit`, `finalizeTrial`;
`src/launch/nodePtyAdapter.ts:24-29`; #222 correction above.

Diagnostic receipts use `native-trial-f-diagnostic-v2`. The new validator
rejects v1 rather than treating its vocabulary as equivalent. Historical v1
artifacts remain unchanged and bind their original source/schema; standard
`native-trial-f-v1` is unchanged. Their native evidence
separates checkpoint `integrity` from qualification `status`: intact bounded
observations can have `integrity: verified`, but `writerOutcome: unattested`
keeps `status: unverified`. Known failure snapshots remain available with the
as-of-checkpoint limit above. `validateDiagnosticReceiptEvidence` checks the
complete informational record, including all required stages, a valid short
hold, strict final lifecycle/read-back and observed owned exits; it does not
qualify the diagnostic. `validateDiagnosticReceipt` cannot pass file-only
evidence, including apparently successful writes. The launcher returns nonzero
and retains an `unestablished` / `invalid-evidence` receipt when the short hold
otherwise succeeds; an earlier failure keeps its original status and reason.
Partial observations are also retained for diagnosis.

This observability limit does not reduce the release objective: reliable
command/path copying and full F/L/E/all 63 qualification gates remain required.
The full Trial F validator rejects every diagnostic receipt. Added diagnostic
I/O can perturb scheduling; pure mocks and declarations do not establish native
loading, callback ordering or publication cause. Sources: driver
`collectDiagnostic`, `validDiagnosticEvidence`, `validateDiagnosticReceiptEvidence`,
`validateDiagnosticReceipt` / `validateReceipt`; #225.

## Performance and physical observations

The executable `performance` mode is a separate trusted synthetic-output
bootstrap. It runs the verified installed bundle's activation and browser assets
with four synthetic managed PTYs, the packaged file publisher, an explicitly
synthetic Node filesystem/clock driver and the exact-profile coordinator probe.
It does not launch a CLI or invoke native SDK/model APIs; configured CLI/SDK
identities are metadata/hash inputs in this mode, not observed compatibility.
Its provenance remains `injected-synthetic-performance-nonqualification` and
cannot replace the ordinary installed route or native/backend gates. Source:
#225 preparation scope; R3 measurement boundary recorded in
`test/fixtures/companion/qualification.json`; existing publisher factory in
`media/attention/hooks/companion/filePublisher.js:58-63`.

The collector runs for 30 minutes, rotating the foreground session and emitting
a fresh nonce row in each round. All four sessions receive synthetic source,
duplicate deliveries and explicitly ignored agent-scope observations; those
traffic counts are separate from timing samples. The same controller monotonic
clock starts **before publication** and ends **after CDP observes the fresh,
visible, enabled Copy target**, with a stable selected session and host view.
Thus `start <= complete host receipt <= ready Copy <= end`: the measured duration
is a conservative upper bound on the selected source-receipt-to-ready interval.
A p95 upper bound below 500 ms establishes that latency bound. A larger upper
bound is **inconclusive** for the narrower interval and requires attribution;
it is not fabricated evidence that the native/host interval failed. Source:
#225 latency requirement; selected design item 11;
`test/manual/companionNative.smoke.cjs` (`measurePublicationUpperBound`).

Every completed sample checkpoints into the owned receipt. Writes serialize: a
unique owned sibling temporary file is fully written, flushed and closed before
replacement. A write or replacement failure retains the previous parseable
checkpoint and the failed temporary file. No uncertain producer storage is
deleted. This protects prior checkpoints on process interruption; it is not a
claim about filesystem durability across machine power loss. Periodic owned-disk samples report observed bytes/files,
not an unsupported claim about transient peaks or reserved future writes. Actual
retention-ledger snapshots come from the trusted activation result's immutable
numeric `companionQualificationUsage` getter; publisher queue/staged snapshots
come from the existing publisher. The collector checks configured bounds and
records observed maxima without content or paths. These samples cannot establish
atomic high-water marks or uncertain producers' future reservations. Input
latency, repeated webview recreation, unmarked-loss audit, native lifetime and
physical paint remain separately required. Do not substitute heap deltas or
operation counts. Normal activation still returns only `savedWorkspace`; this
trusted getter is not a normal activation/admission status API. The collector
leaves the combined performance gate `manual` for review instead of passing it
from its latency sub-result. Sources: #225 R5 scope extension;
`src/extension.ts` (`activate`, `activateWithDependencies`);
`src/companion/companionCapture.ts` (`retentionUsage`).

Run four simultaneous owned native sessions for at least 30 minutes. A bounded
synthetic workload can emit numbered `CW_<session>_<sequence>` blocks containing
the fixed fixture paths at 100-ms intervals (18,000 blocks/session), with an
explicit final marker and expected count. Exercise retained-hidden views,
recreation, repeated session switches, ignored/no-op source traffic and duplicate
delivery separately. Record source/received/visible/evicted/gap counts: no lost
unmarked complete blocks. Sources: #225 and selected design item 4 / item 11.

For the quiet-run Copy gate, collect actual timestamps at complete host source
receipt and visible-ready Copy, with a documented clock correlation/error bound,
machine fingerprint and sample count. Report p95 below 500 ms, transport byte/file
peaks (32 MiB / 256), per-session/global retention (8 MiB / 32 MiB), actual input
latencies, ignored-traffic and duplicate sample counts. Operation counts,
xterm parse callbacks, animation-frame callbacks and clipboard durations are
different measurements and cannot be substituted. If the selected measurement
driver cannot observe either endpoint, keep this gate pending and bring the
specific instrumentation gap to review. Sources: #225; #223; selected design
items 4 / 11; `test/manual/terminalEchoWebview.ts:20-38`.

Use a physical keyboard and screen reader on the exact candidate to verify
traversal, accessible names/live announcements, disabled/stale targets, Review
focus return, Raw focus, scroll retention and one foreground Escape. Inspect
painted output separately from parser/DOM evidence. Reproduce composer lag,
import/native clearing, preservation of newer native edits, one-second idle
autosave and lifecycle flushing (#227/#228). Record acceptance/investigation and
inherited-limitations dispositions for #145, #180, #56, #158 and #183, including
EAGAIN or affected-machine limits. Non-reproduction does not close those symptoms.
Sources: #225; #227; #228; #223; PR #238.

## Receipt review and persistence

`pending`, `failed` and `manual` are not passing states. The runner records real
clipboard observations but leaves manual/native/performance observations for
independent review. A reviewer must bind each passed gate to a sanitized artifact
hash with its observable outcomes and actual candidate identity. Performance
evidence needs all measured fields; Escape and native-lifetime evidence need
their distinct signals. An existing file or process exit code is insufficient.
The exported `validateReceipt` checks the closed evidence structure and selected
matrix; it does not authenticate a human-written claim or update production
admission. The reviewed packaged receipt rejects an inline `performance` value:
reviewed performance results belong in the performance gate and its hashed
artifact. Version identities are bounded scalar versions, CLI build matches its
version, and each gate admits only fields belonging to its particular kind.
Unchecked nested values and unused union fields cannot carry content. Sources:
launcher `validateReceipt`; #225.

Collection records `collectionComplete: true` only after successful work and
cleanup. Pending/manual gates still prevent qualification. A failed operation
preserves partial gates plus one allowlisted `failure: {stage, reason}`; no raw
exception, path or output enters that field. Stages distinguish runtime profile,
CLI version, identity, activation, authentication, fresh capture, matrix,
performance, final read-back, checkpoint, cleanup and deadline. Reasons are
`operation-failed`, `gate-failed`, `write-failed` or `deadline-exceeded`; the first
failure is retained if a later save/cleanup also fails. After saving and cleanup,
the entry rejects with a sanitized failure. The launcher checks both host status
and the final bounded receipt: failed, missing or incomplete collection exits
nonzero; successful pending collection can exit zero without qualifying anything.
If receipt storage itself is unavailable, the last intact checkpoint remains and
the failing host/launcher signal still reports failure. Errors before a valid
owned receipt context exists cannot create a receipt; they also fail the launcher.
Sources: launcher `collectReceipt`, `collectionExitCode`, `createReceiptWriter`;
#225 evidence-path review.

Commit reviewed synthetic receipts and their referenced artifacts together before
any admission change; verify each with `git ls-tree HEAD -- <artifact>` and audit
the PR diff against its deliverables. Retain actual command/output receipts and
VSIX SHA-256 in the release evidence. Never commit auth/account details, raw
frames, uncontrolled terminal tails or real conversation/path content. #225 stays
open until all required native, packaged and physical gates pass; publication is
separately authorized. Sources: #225; #215; #220.
