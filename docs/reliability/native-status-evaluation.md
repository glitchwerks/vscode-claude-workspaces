# Native status evaluation — 0.11.0

Status: investigation in progress. Successful Claude support negotiation and the background-work matrix remain unverified. This checkpoint records controlled Windows transport results; it does not select an activity authority or close the reported typing/rendering bugs. Scope and gates: #158, #180, #183.

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

Writing a reply is not an acknowledgement. A completed foreground answer without state reports does not establish whether negotiation was accepted, whether later states would appear, or how native state represents background work. The #158 foreground/background comparison remains gated on an actual positive Claude status observation (#158 acceptance criteria).

## Completion mod preflight

An owned copy of the shipped attention plugin passed `claude plugin validate`. Its static output recognized `session.start`, `turn.complete`, `classic.SubagentStart`, `$.process.run` and `$.env.set`. The module-free `claude plugin test` check returned `no hooks module to load`, the documented available outcome. Static validation and generated declarations do not prove runtime admission: https://code.claude.com/docs/en/plugins/mods/create and https://code.claude.com/docs/en/plugins/mods/troubleshoot#check-whether-mods-can-load (fetched 2026-10-30 UTC); #158 controlled follow-up.

The copied files' SHA256 fingerprint was `298583e30fbbc4da62af65ac2b03f364724a4b17a2e90a46336a469f31b86308`, calculated by concatenating each relative UTF-8 filename and its original bytes, in this order under the plugin root: `.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.js`, `report-activity.ps1`. The original files are committed under `media/attention/` at source baseline `f7af62a8b6f35467d281aa1aabe84c1ed0a48142`; the owned copy's generated declarations are not a shipped deliverable (#158 controlled follow-up).

The launch-argument foreground turn with the owned plugin produced one actual parent `TurnComplete` signal at **4411.2 ms**, `completionReporterReady=true`, `reason=answer`, `isAborted=false`, and no agent identity. The result completed at **2026-10-30T00:12:44.505Z**; the signal watcher reported zero errors and zero pending files. Its session identity was salted/hashed in the retained metadata. Native observation remained one query and zero state reports. An earlier prompt-via-PTY plugin control produced no mod events; that difference is unresolved. This confirms one real foreground completion path only (#158 controlled follow-up).

## Remaining evidence

The following #158 acceptance cases are still open: confirmed Claude negotiation; root versus child ownership; parent completion with a live child; concurrent/nested agents; shell jobs; separate background sessions; permission/question waits; blocked Stop continuation; cancellation/failure; exit/restart; panel hide/recreation and replay; comparison with the admitted completion mod; notification delivery and duplicate ownership. No reporter replacement, higher support floor or notification change is selected (#158; #183).

The original 0.9.0 typing failure remains unlocalized. The original affected machine is unavailable; physical keyboard testing on another Windows machine and a current visual-corruption reproduction remain outstanding (#180, #56). A native-status transport result cannot satisfy those acceptance gates (#183).
