# Private capture-channel admission and epoch renewal

* **State:** Selected by the 2026-11-08 auto-accepted R1 correction. This is a design contract, not an implemented or qualified transport.
* **Scope:** The existing private file channel, same subscription-backed CLI, and host-owned capture identity. No HTTP, helper process, Run action or native response broker.
* **Sources:** [R1 findings](reviews/2026-11-07-copying-v1/consolidated_review_report.md#r1--major-define-capture-epoch-admission-and-renewal), [main transaction/budgets](design_draft.md#detailed-implementation), [native mapping](capture-provenance-contract.md). The epoch authority and exchange below are the selected repair rather than claims about existing runtime APIs. [A]

## Authority and identities

The host issues every captureEpoch and offerId as fresh 128-bit lowercase hexadecimal strings. Neither a producer counter nor a native UUID authorizes an epoch. The launch environment continues to carry directory, secret, managed session, canonical CLI UUID and process generation; no changing epoch value is put in the environment. The host's owned control file supplies that value after admission. This keeps the existing launch-field inventory. [A; R1]

Directory and 256-bit secret remain fixed for one managed process generation. Epoch renewal rotates the epoch and offer, not credentials or the CLI. A replacement managed generation gets a new directory/secret and cannot adopt the old channel. Native UUID mismatch retires capture without v1 rebinding; same-UUID resets use the exchange below. Losing the host's in-memory ownership/epoch state fails closed until a matching managed relaunch; do not recover authority from leftover files.

The producer has a module-local cancellation counter solely to cancel obsolete callbacks. It is never serialized as host epoch authority. Only the publisher polls/writes; native observers enqueue or mark reset synchronously and never await this handshake. Matching initial startup notifications are idempotent. A non-startup classic.SessionStart reset cancels the old publisher work and requests renewal once; retransmission of its wire request reuses that request's offer.

## Closed control records

All control records are UTF-8 JSON, at most 4 KiB serialized. Unknown keys, wrong types, nonfinite/unsafe integers, malformed IDs or mismatched binding are rejected. The common envelope is v=1, token (43-character base64url secret), sessionId (1–128 UTF-8 bytes), claudeSessionId (canonical UUID) and generation (1–128 UTF-8 bytes). These are producer/host messages; none reaches the webview or normal logs.

| Record | Required fields beyond common envelope |
|---|---|
| host control | kind=control; controlRevision (positive safe integer); state=offered/granted/active/retired/failed; offerId (hex32 or null); captureEpoch (hex32 or null); grantId (hex32 or null); predecessorEpoch (hex32 or null); reasonCode (closed reason or null); recoveriesRemaining (0 or 1); lastRetired (null or captureEpoch/ackSeq/reasonCode tuple). |
| producer request | kind=epochRequest; offerId (hex32); predecessorEpoch (hex32 or null); nativeSessionId (UUID); reason=initial/native-reset/recover. The offer is the request ID; no producer-created epoch is accepted. |
| producer activation | kind=epochActivate; captureEpoch (hex32); grantId (hex32); nativeSessionId (UUID). |
| host acknowledgement | kind=ack; captureEpoch (hex32); disposition=continue/retired; ackSeq (nonnegative safe integer); reasonCode absent for continue and required for retired. Retain the main design's authenticated envelope and retirement semantics. |

Reasons are SCHEMA_REJECTED, CONTENT_REJECTED, IDENTITY_CHANGED, TRANSACTION_TIMEOUT, CHANNEL_RETIRED, CONTROL_REJECTED or HANDSHAKE_TIMEOUT. Add the last two to the same closed enum in the already-planned capture types/fixtures; no new runtime file is required.

Host control and ack are separate fixed files replaced through host temporary-file rename. The producer writes one request pair named request.<offerId>.upload/.ready and one activation pair named activate.<captureEpoch>.upload/.ready, each exactly once; a marker contains only the basename and declared byte length. The host validates ownership and bounded content before consuming/cleaning these pairs. It never interprets a path supplied inside a record.

There is at most one pending request or activation pair per channel. These control files count toward the existing global storage/file caps. A failed partial producer write is not overwritten or copied repeatedly: the host expires it within the two-second transaction deadline, retires the attempt and cleans only owned files. The five-second handshake deadline still applies. Native continuation is independent of both deadlines. Start the initial five-second handshake clock when the initial offer becomes visible, a renewal clock when a current native-reset request is accepted, and a recovery clock when its offered control becomes visible. An idle standby offer in active state has no handshake deadline. Host retirement first publishes the old retired acknowledgement, then a retired control carrying the replacement offer and lastRetired tuple; the new grant publishes its epoch-zero acknowledgement before the granted control. Activation publishes active control last, so producer data cannot precede admission.

## State transitions and cursors

| Current host state | Accepted input | Atomic host outcome |
|---|---|---|
| launch prepared | owned directory initialized | offered; captureEpoch/grantId/predecessorEpoch=null; fresh offerId; no ack file yet. |
| offered | initial request with current offer, null predecessor and matching native UUID | consume offer; issue fresh epoch E; granted with grantId=request offer, predecessor=null, offerId=null; publish E/continue/ackSeq=0 before grant visibility. |
| active E | native-reset request with current offer, predecessor=E and matching UUID | retire E at its last admitted ackSeq, invalidate its Copy/review targets and cancel assembly; issue fresh epoch N/ackSeq=0; granted N with predecessor E. |
| retired E | recover request with current offer, predecessor=E and remaining recovery allowance | consume the allowance and offer; issue N/ackSeq=0, granted N; retain E's last admitted cursor only in lastRetired. |
| granted E | activation matching current epoch, grant and native UUID | active E; fresh next offerId; ackSeq remains 0; admit data beginning at seq=1. |
| active E | duplicate activation for E/current grant | return existing active control/ack unchanged; never reset the current cursor. |
| granted/active E | identical duplicate of the request whose offer is current grantId | return the same existing grant/control; do not allocate another epoch or reset seq/ack. |
| any current state | authenticated native UUID mismatch | retire current capture with IDENTITY_CHANGED, invalidate targets, failed with offerId=null; matching managed relaunch required. |
| active/granted E | owned rejection, expired transaction or health/handshake deadline | retire E with unchanged last admitted cursor and visible loss; offer one recovery if eligible, otherwise failed. |
| retired/failed or another epoch | late data/ack/request for an obsolete offer/epoch | do not admit, advance, reopen or retire a newer valid epoch. Host may clean owned obsolete files. |

An initial offered-handshake failure has no admitted data to recover: become failed and require a managed relaunch. After an admitted epoch retires, allow one automatic five-second recovery handshake. If that recovery fails, remain capture-unavailable until matching managed relaunch. A successful admission replenishes the allowance for a later independent retirement; it never causes old observations to be replayed.

Validate the managed-generation envelope/ownership first, then current offer/epoch membership, then native UUID; obsolete offers/epochs are ignored before a mismatching native UUID can affect the current epoch. Heartbeat and partial-transaction/lock deadlines use TRANSACTION_TIMEOUT; initial/activation/recovery handshake expiry uses HANDSHAKE_TIMEOUT. A malformed authenticated request for the current offer consumes/fails that attempt with CONTROL_REJECTED; unauthenticated or foreign traffic cannot consume the offer or retire valid capture. An obsolete valid-token request is stale traffic, not a current owned transaction. Host controlRevision increases on each control replacement and never wraps; revision exhaustion fails closed. The producer ignores lower revisions and stops if the current control contradicts its own pending grant.

After seeing a matching grant, the producer drops old queues, starts a new local source window, sets next data seq=1 and local acknowledged cursor=0, then writes activation. It sends no data until it observes active for that same epoch/grant. Source events lost during renewal produce a visible boundary with unknown extent; they are not joined to either epoch or replayed.

Data filenames include captureEpoch and seq, preventing seq=1 collisions after renewal. Allocate consecutive data sequence values before enqueue. A known dropped queued range is represented by one gap frame at its first sequence with coversThrough equal to its last; accepting it advances ackSeq through that range. An unknown-extent loss consumes one ordinary gap sequence with coversThrough equal to itself and an explicit unknownExtent=true, never a fabricated range. Never bridge source assembly across either gap. Sequence exhaustion retires the epoch instead of wrapping. Every data frame, heartbeat, gap and ack carries its epoch. Heartbeats/gaps use the same consecutive data sequence and acknowledgement path; a reserved gap accounts for any intentionally dropped queued observations before later data is admitted. A retired ack retains the previous cursor; a new epoch's zero is never interpreted as acknowledgement of the old epoch.

## Required exact traces

The [design trace vectors](evidence/capture-channel-cases.json) specify current state, offered identity, request/activation/data event, and expected state/epoch/cursor/admission. Transfer them to the planned capture/native-mod tests. They are not executed native tests.

Include initial admission, duplicate request/activation after data admission, same-UUID reset, old data after renewal, owned rejection at seq 5 after ack 4, health timeout, recovery success/failure, mismatched native UUID, malformed current control, foreign token, reordered control revisions and host-state loss. The host-owned native identity policy and existing queue/content budgets remain unchanged. [A; main design; native mapping]

## Sources

* **A:** [Author auto-accept of all six corrections](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6721197465).
* **R1:** [Independent readiness/codebase findings](reviews/2026-11-07-copying-v1/implementation_readiness_report.md).
* **Existing runtime boundary:** [host ownership tuple](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/composerRuntime.ts#L70-L74), [launch overlay](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/launch/sessionLaunch.ts#L5-L16), [module-local cancellation](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/media/attention/hooks/composer.js#L206-L227). These sources do not already implement this cross-process protocol.
