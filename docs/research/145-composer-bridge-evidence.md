# Composer bridge feasibility evidence

Captured 2026-10-30. Parent: #145. This checkpoint contains a test-only native probe, not a product composer.

## Authority and baseline

The maintainer approved moving #145 into active 0.11.x in comment 6537257117. The runtime base is `dd3cd09f03fff5bfbeefde904d862a00eba848dc`, immutable published `v0.11.0`. #196 is no longer required. Publication and #183's reliability validation remain separate gates. [#145; #183; #196; `test/fixtures/composer/bridge-contract.json:L1-L5`]

The unchanged baseline passed `npm ci`, typecheck, lint, and 984 unit tests. Nine new probe-control tests subsequently passed after observed failing runs. A wider run passed 992 unit tests and four sets of 109 extension-host tests, using saved-workspace/folder configurations on pinned VS Code 1.128.0 and 1.136.1. That run began before the final probe-only failure guard was added; the latest nine probe tests then passed separately. Exact-head CI is still required. [`test/fixtures/composer/bridge-contract.json:L60-L60`; `test/unit/composerNativeProbe.test.ts:L20-L140`]

## Method and privacy

The opt-in runner starts owned CLI processes through production `NodePtyFactory`, in isolated fixture directories. Import/default execution starts no native/model work. Live runs require `--run-live` and an absolute executable; fixed Haiku scenarios additionally require `--allow-model`. Only controlled fixture prompts are admitted. Probe code does not rewrite user settings, replace the configured CLI, or change the attention reporter or product code. [`test/support/composerNativeProbe.ts:L14-L105`; `test/fixtures/composer/probe-plugin/hooks/register.js:L1-L225`; `test/unit/composerNativeProbe.test.ts:L20-L106`]

After `npm ci` and `npm run compile:tests`, reproduce using an executable of the recorded version:

```text
node out/test/support/composerNativeProbe.js --run-live --claude-executable <absolute-claude-executable>
node out/test/support/composerNativeProbe.js --run-live --allow-model --claude-executable <absolute-claude-executable> --scenario live-busy
node out/test/support/composerNativeProbe.js --run-live --claude-executable <absolute-claude-executable> --scenario drop-skill
```

Transient captures, generated declarations, downloaded binaries and diagnostics remain ignored scratch. The committed receipt contains version/hash metadata and boolean observations, not credentials, account data, user paths, captured prompt bodies or captured answers. Explicit negative results are retained for identity, dialog and compatibility controls. Synthetic text is intentionally part of the test fixture source. [`test/support/composerNativeProbe.ts:L180-L252`; `test/unit/composerNativeProbe.test.ts:L87-L106`; `test/fixtures/composer/bridge-contract.json:L1-L61`]

## Observed native route

The candidate route reads the native prompt, refuses a nonempty native draft, fills the native prompt, and invokes Claude's native queue-submit action. Acceptance is observed through the native submission/command chain rather than a successful PTY write. The tested default chord is Ctrl+X, Enter, which Claude documents as queue-submit rather than native Ctrl+Enter send-now; it also bypasses autocomplete. Resolving native binding overrides belongs in the actual Task 3 adapter, not a guessed hard-coded browser map. [`test/support/composerNativeProbe.ts:L110-L190`; `test/fixtures/composer/probe-plugin/hooks/register.js:L125-L225`; https://code.claude.com/docs/en/keybindings (fetched 2026-10-30); #145]

On 2.1.287 and 2.1.312, the probe demonstrated discovery, namespaced skills, multiline preservation, quoted spaced-file references, busy queuing, rejection for an existing terminal draft or active question, deliberately dropped prompts, interrupted work and missing acknowledgments. The busy prompt was acknowledged against the running first turn before it completed. The 2.1.299 option then passed the same critical controls. [`test/fixtures/composer/bridge-contract.json:L11-L36,L44-L55`]

The portable file control uses a unique per-run marker with model tools and MCP servers disabled. Observing that marker in the answer supports native file expansion as an inference from these controlled inputs; the marker was absent from the submitted prompt. The probe does not need the later mention event on the older CLI. [`test/support/composerNativeProbe.ts:L73-L103`; `test/fixtures/composer/probe-plugin/hooks/register.js:L1-L22,L150-L185`; `test/fixtures/composer/bridge-contract.json:L13-L13,L21-L21,L45-L45`]

Late-dialog controls opened a question or permission dialog after fill, then sent queue-submit. The fixture command ran while the dialog stayed pending, input stayed unavailable to fill, and the dialog was not answered. A lost-ack control intentionally suppressed the receipt after one native command execution; it stayed unconfirmed and sent no retry. These are controlled observations, not a claim about every possible plugin or UI race. [`test/fixtures/composer/bridge-contract.json:L31-L36,L51-L53`]

The direct prompt API rejected slash-command text in the current-version control. Native command parsing must not be replaced by that single direct API. [`test/fixtures/composer/bridge-contract.json:L58-L58`; https://code.claude.com/docs/en/plugins/mods/api (fetched 2026-10-30)]

## Compatibility decision required

**Observed constraint:** 2.1.287 and 2.1.290 completed the command hook before the deliberately dropped skill prompt was observed, and omitted the command metadata needed to correlate that result. A generic command-completion acknowledgment could therefore clear a draft before the later drop. The probe intentionally fails this control on those builds. 2.1.299, 2.1.302, 2.1.305, 2.1.307 and 2.1.312 passed the dropped-skill control. [`test/fixtures/composer/bridge-contract.json:L37-L43`]

**Proposal, not an approved floor change:** require CLI **2.1.299+ for automatic composer sending**, while keeping ordinary terminal/activity support at **2.1.287**. 2.1.299 is the lowest tested passing build, not a claim about the earliest possible passing release. Its critical native matrix passed. A more conservative older-version compatibility path has not been exhausted and would require additional design/validation. No product minimum or capability code has been changed. [`test/fixtures/composer/bridge-contract.json:L40-L55,L59-L59`; `src/launch/claudeCapabilities.ts:L101-L107`; #145]

The approved plan requires bringing API-floor changes back to the maintainer. Task 1 therefore remains open for this decision; Tasks 2–9 have not started. Production transport authentication/lifecycle/native-binding handling and real composer/keyboard/focus validation remain Tasks 3–4 and 8. The installed VS Code 1.142.0 record is environment inventory, not an extension-host UI result. [#145; `test/fixtures/composer/bridge-contract.json:L6-L10,L57-L59`]

The 2.1.287 and newly downloaded compatibility binaries were checked against their official Windows x64 manifests; the already-installed 2.1.305/2.1.307 copies were hashed and version-checked. None was installed over the configured 2.1.312 binary. [`test/fixtures/composer/bridge-contract.json:L9-L9`; https://downloads.claude.ai/claude-code-releases/2.1.287/manifest.json (fetched 2026-10-30); https://downloads.claude.ai/claude-code-releases/2.1.299/manifest.json (fetched 2026-10-30)]
