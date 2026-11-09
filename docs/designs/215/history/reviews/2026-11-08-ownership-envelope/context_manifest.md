# Ownership/envelope correction re-review context

* **Date:** 2026-11-08; source retrieval times are UTC.
* **Frozen target:** eb11873050cbcc09ece0ea3c32de1f4d39c4a345; [design draft](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/design_draft.md), 408 lines. Feature 1–177; Detailed Implementation 178–408.
* **Target Git blob:** 0749048ce0e46a2b23d98d0b46b6d40c511c613a; CRLF SHA-256 2ec4a0caea4c411cb2d1759d6b254f36bb19e3903e1a05835e67dfc1412b00be.
* **Mode:** previously selected consolidated five-stage EGM review; ten fresh-context reviewers requested; one pass.
* **Authorization:** [Author instruction to continue](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6725008369).
* **Status:** complete: 10/10 requested reviewers completed; zero not run. Original observations: 0 Blockers / 3 Majors / 0 Nits; duplicate exit-proof observations merge to **0 Blockers / 2 Majors / 0 Nits**, two open actions. One pass, not clean or converged. [Consolidated findings](consolidated_review_report.md).
* **Isolation:** fork_turns=none; no parent transcript or memory supplied. Host instruction-file exclusion remains unverified.

## Evidence and limits

[Portable source catalog](review-context.json), [full archived personas/standards/workflows/license](review_tools.json). The current 59-input [manifest](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/implementation-inputs.json) and [Ready record](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6724623895) remain frozen at the correction commit. These publication reports do not expand runtime D0 or change source authority. All 59 existing input hashes are checked before publication.

The reading list contains 23 direct local inputs and 56 approved direct URL references through 55 materializations: 26 immutable Git files, 27 issue comments, current issue body and the official plugin-reference page (fetched 2026-11-08). Current linked contracts/fixture expectations are incorporated inputs; prior author approval, resolution status and static-check claims are not correctness proof. Each reviewer records actual source/body read extents; index inspection does not mean every listed source was read. Transient cache/tool locators in receipts identify provenance, not required runtime artifacts.

Scope remains subscription-backed CLI, copying-only, private files, native Variant A/Escape/Raw. Run/Run again/C2/direct companion responses remain deferred. No target edits, product implementation/compiler/tests/build/package, native/Claude/model/clipboard/ACL probes, merge or release. [Active design](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/design_draft.md), [applied F1–F6 record](../2026-11-08-wire-outcomes/resolution/goldfish_review_report.md).

## Direct local inputs

| Input | Working CRLF SHA-256 |
|---|---|
| [docs/designs/215/concepts_brief.md](../../concepts_brief.md) | 707a7a606a44788f8c2377a93a37aaa8dcf6fc7fc8c0d9cd6bfd0047a920bbb5 |
| [docs/designs/215/technical_choices.md](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/technical_choices.md) | 215f8fe5f1d80c4b0c3563b14cd3d1d1d9999ad582f348bd93b15dbd2cdb8e06 |
| [docs/designs/215/run-amendment.md](../../run-amendment.md) | 05d95d0dc9378f60ecdbaeb2a276f31575457312a04f0436e338f1cd1bf5ca1b |
| [docs/designs/215/implementation-inputs.json](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/implementation-inputs.json) | 4c7cc0ef554535479288e654917e508314a23910eb7a8c594b27e61df2262054 |
| [docs/designs/215/documentation-handoff.md](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/documentation-handoff.md) | c22f88780039e8c3d71cee57e1e438b6c76b26e4b56847c0b4cca90d6824c8cb |
| [docs/designs/215/capture-channel-contract.md](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/capture-channel-contract.md) | bfa48b5f4bdab607ef610b09a5c7901f5f0c00ff58a5e4e5eeaa5908a5ed8259 |
| [docs/designs/215/evidence/capture-channel-cases.json](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/evidence/capture-channel-cases.json) | 7c03cb2bf755315e1810b85e6f68f988015e0c5b94e825bba4a9a475d5ed4e76 |
| [docs/designs/215/path-copy-contract.md](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/path-copy-contract.md) | a53048b1601b76a5495b49f8ae82266c31d5737604023a2c207296fadd9c12cc |
| [docs/designs/215/evidence/path-copy-cases.json](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/evidence/path-copy-cases.json) | f0533ae484076bd8ef5edface776b73df00489960cc502f311cca8a854d02ffc |
| [docs/designs/215/companion-view-contract.md](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/companion-view-contract.md) | f1fba888940ca92d36350336d0d3d2260d81d0600227f9edd89082b16ed20e2b |
| [docs/designs/215/evidence/companion-view-cases.json](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/evidence/companion-view-cases.json) | c4c6602593036e3423121316de0cbafcf3a89c44d16d09b507609a198bb8ff9c |
| [docs/designs/215/capture-provenance-contract.md](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/capture-provenance-contract.md) | d9276f1cf848b2fa6b7ce16415468e85ec3a11e2129bd68c862808cc06e4f922 |
| [docs/designs/215/evidence/c4-native-evidence.md](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/evidence/c4-native-evidence.md) | 80128059d2ab0485c0906c3272643729cdb8aaed43b14d6eec545a2b92854029 |
| [docs/designs/215/evidence/c4-adapter-cases.json](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/evidence/c4-adapter-cases.json) | 942ed9c1933ed6dd9eee69d8ace82bf85ce513d6823c015bd76f94641c0c4a20 |
| [docs/designs/215/c2-experiment-results.md](../../c2-experiment-results.md) | 792dbc71225fbb7a3be1b71d67d62cdeab07f8863a580ae2ae1655d69a744a42 |
| [docs/designs/215/reviews/2026-11-08-corrected-copying-v1/resolution/goldfish_review_report.md](../2026-11-08-corrected-copying-v1/resolution/goldfish_review_report.md) | 56817d1de7f533d74301ad83c060eea492cc555b35aa33593fe3567b6eb85d9f |
| [docs/designs/215/working_hypothesis.md](../../working_hypothesis.md) | d8a761403b3ce25c151ec58521c72869b1f45bf17b294b1b0d44be0c1dee0963 |
| [docs/designs/215/goldfish_review_report.md](../../goldfish_review_report.md) | a1f81511a31c6f2361427d3f1e6d98a424d8bd535e4a115e02f93abb825f75c5 |
| [docs/designs/215/reviews/2026-11-08-wire-outcomes/resolution/goldfish_review_report.md](../2026-11-08-wire-outcomes/resolution/goldfish_review_report.md) | a3c237b4e313b9597344bfdad5671555de4a2942c1916b707942a397f1b80969 |
| [docs/designs/215/reviews/2026-11-08-wire-outcomes/consolidated_review_report.md](../2026-11-08-wire-outcomes/consolidated_review_report.md) | b807076da8df5f4af23c14828e9d1f150e9edb4a44554c4efecaf319d4fce987 |
| [docs/designs/215/reviews/2026-11-07-copying-v1/resolution/goldfish_review_report.md](../2026-11-07-copying-v1/resolution/goldfish_review_report.md) | 8e7a1696ea5ac282877342631364412a5b060b4e20e38cf4164b983373c9e653 |
| [docs/designs/215/reviews/2026-11-07/consolidated_review_report.md](../2026-11-07/consolidated_review_report.md) | 05b3c32d5758546b04f69c9106098e6b550f9cc7709a140a735749d12a889c5a |
| [docs/designs/215/reviews/2026-11-07/resolution/goldfish_review_report.md](../2026-11-07/resolution/goldfish_review_report.md) | 5519cc998ddab64415ba54975cbc3848625c4a4d4fea5009727082aaf6fcbfe7 |

## Canonical URL sources

| ID | Canonical source | SHA-256 |
|---|---|---|
| issue-215 | [issue-215](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215) | f8292fa8674e10ed555c076bee91e42a64afd91e6f702682b7e1149cf2a1c186 |
| comment-6724623895 | [comment-6724623895](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6724623895) | fdabb846619080a2de01fff655d90577231c3b2c936423c8cf1b023ae5f17fe5 |
| repo-1 | [docs/designs/215/design_draft.md](https://github.com/glitchwerks/vscode-claude-workspaces/blob/f761ebbd7805039517bcc29a5fa82c8684c83d84/docs/designs/215/design_draft.md) | c03118d47af5afb893f7eac88bfcf2b1da34d8bf394ceee571b6ac3ec3ae4159 |
| repo-2 | [docs/designs/215/concepts_brief.md](https://github.com/glitchwerks/vscode-claude-workspaces/blob/3b096d8de36f596d42276e78bcf60c25c7d3a0bb/docs/designs/215/concepts_brief.md) | c648352ccd2b82b0bfc6161f9f4c2641d04fad1c5fafb5df1dd25dcf138e0e84 |
| repo-3 | [docs/designs/215/working_hypothesis.md](https://github.com/glitchwerks/vscode-claude-workspaces/blob/fe9d42be1890b060fd0522d956f28082b6018861/docs/designs/215/working_hypothesis.md) | 834bc0a897a4465e25697c0feaf0193a87a18ca7399d8b61ed2bd9b0401f6318 |
| repo-4 | [docs/designs/215/goldfish_review_report.md](https://github.com/glitchwerks/vscode-claude-workspaces/blob/fe9d42be1890b060fd0522d956f28082b6018861/docs/designs/215/goldfish_review_report.md) | 5ae8e402f15f10c4fecc659467289b5cb0b4272993807d0551e5a4cf937ab779 |
| comment-6684810864 | [comment-6684810864](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6684810864) | 5c8efee7d03ca7b986d10aee7f0569bf7895bc725d5f7abcce927ca91ae1e0b3 |
| comment-6684329277 | [comment-6684329277](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6684329277) | 4dde929a678d73cce801d5b8a04bb57181152e64704be8c68735a8afd26a0fae |
| comment-6684608334 | [comment-6684608334](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6684608334) | 979b0344610a3e884be09173cc072d216fda75171fee58851271879212a45330 |
| comment-6685022793 | [comment-6685022793](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6685022793) | 1cc783916dd66f36dea39ee6f13b6422ea9f54f17fde6f105aca93e715108193 |
| comment-6700896861 | [comment-6700896861](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6700896861) | b888ae1ee3f38605b2b80e239076024da20662b53f03ae82c478a6d934aa28dc |
| comment-6701115191 | [comment-6701115191](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6701115191) | e42fe1dedd43d3a95e8715bbb0ce926d3d64723f3dd4e29e085910f75814149f |
| comment-6701274240 | [comment-6701274240](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6701274240) | 0412bb3afa0384e6535904e7571cc2a7c8f4977803b695d4d6d2955e0fbf3973 |
| comment-6706751545 | [comment-6706751545](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6706751545) | d40933f1d26f94eca4be8c7f0569b1bb53cf720ec895ad4d575f485cc8705edc |
| comment-6707126769 | [comment-6707126769](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6707126769) | 1af912b7c3176547517382fbe9d8bce2032f99b58f9a4996b30d5ca5af097996 |
| comment-6707453909 | [comment-6707453909](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6707453909) | 0f09efb8c9054bdf104615e05952e82e7dff5b84eedaefabc540132337d9c6dc |
| comment-6724605631 | [comment-6724605631](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6724605631) | 627a839eba18078fe6e8d42deecb730e9e23216a56ed994207ebf3bb3351f8a6 |
| comment-6722972512 | [comment-6722972512](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6722972512) | ca5d40063813d46f3bc639400dbf3ce445ffa5f09f42c8a6f1a5dc4c060daf5d |
| comment-6721197465 | [comment-6721197465](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6721197465) | db421ab5cfaf1e989582dc2dea674c7c32cdfd250a2f95134aa743e1025db012 |
| comment-6715993295 | [comment-6715993295](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6715993295) | 45b7010ced1f62cf2c93de1c0d6c55f3b4fdc3dd233383afd8964fb4a70354be |
| comment-6709462362 | [comment-6709462362](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6709462362) | 6bd8069b58f78265de9a45cfc61afc9e5ecb1e1ff1c23bb8a310fcfab2ad3baa |
| comment-6711102784 | [comment-6711102784](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6711102784) | 3b2bc237eccac9c4089c73ac7ec04b54a763256868260834bec2be2e117a756b |
| repo-5 | [docs/designs/215/reviews/2026-11-07/consolidated_review_report.md](https://github.com/glitchwerks/vscode-claude-workspaces/blob/4b7e967e3e7aba91535c890f4541e7372decef9b/docs/designs/215/reviews/2026-11-07/consolidated_review_report.md) | 1995e7abb8c53889f70c6b90d8bc0071ebcf30ff46b6f888b300a3cd924e47e5 |
| repo-6 | [CONTRIBUTING.md](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/CONTRIBUTING.md) | 0d3f7c3f451e520715c6b3df6fbe4eca5db4227adf122877d424485c7fe56fc6 |
| repo-7 | [docs/versioning-policy.md](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/docs/versioning-policy.md) | 176852c1951bec676cdd784f5a924071742a05517b8c4718f51fba65d250bfbe |
| repo-8 | [test/unit/attentionCompletionMod.test.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/test/unit/attentionCompletionMod.test.ts) | af7f01b38f0fca338121887213d378878fac2ec1c5c41d852508e82d19b5e335 |
| repo-9 | [test/unit/webviewRenderer.test.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/test/unit/webviewRenderer.test.ts) | 65152d5e3b5935915b6d031d01951ea4b8f8b849ca36e56d13c5fd2d9285de2d |
| repo-10 | [src/composer/composerRuntime.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/composerRuntime.ts) | c11c70f4c2f2ed79aaaa6c09f70451853bd50ce437f6e938737ddb192b7bcde7 |
| comment-6701284701 | [comment-6701284701](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6701284701) | b9db1958ee9d44c3e04dc0e0a87b30c4f26e519d48976209128550abd04aa7a4 |
| official-plugins-reference | [official-plugins-reference](https://code.claude.com/docs/en/plugins-reference) | 8bba2273677948379b383479c968293fee1cb55025c67a004af0cf789251fd92 |
| repo-11 | [src/extension.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/extension.ts) | de3958693f55bb45c7806299896e144b53106ee416036232bdae8095994bda34 |
| repo-12 | [src/launch/sessionLaunch.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/launch/sessionLaunch.ts) | bd0b1ea2163207cb492e9d5bdb24f163e40f37bd8f56ae4b469bb69dfe8c5e86 |
| repo-13 | [src/panel/protocol.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/protocol.ts) | 1f44db1edb0adb9aae4177001fe8c5ed442cb1bfdfe069dde9a2580efdf902ef |
| repo-14 | [src/panel/webview/index.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/index.ts) | 6f6ea8df1811ada1f80cbb9c7f6dc3575c9e2f27a3ae107aa18a559d819de5dc |
| repo-15 | [esbuild.js](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/esbuild.js) | 81cf3d74583d18b911f460dd759072312620a1e1435fcfc6858aced8cef46b48 |
| repo-16 | [.vscodeignore](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/.vscodeignore) | d19b5e322661724c36d04bdef527890739d49353c59edc0437c1740f3247cc50 |
| repo-17 | [test/unit/packageAssets.test.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/test/unit/packageAssets.test.ts) | 6a8a28d48c7dd9c9900fd4f48316b62d8c37cd307193c312f552cbf6e2a439a4 |
| repo-18 | [package.json](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/package.json) | ad4dee06448d7424218a08f71e41e639a85304d2cc2a049e75cae13a92e36b9b |
| repo-19 | [test/integration/composer.test.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/test/integration/composer.test.ts) | b25d69a143fda2ed072569bc76068ba693e5c0cb5ffafc21766cbd11e168cc93 |
| comment-6685055630 | [comment-6685055630](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6685055630) | 4016923f918ddb13956eb6a8aa8a91b71fc800aeeec0ea80d8747fed52a63177 |
| comment-6646355033 | [comment-6646355033](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646355033) | ddf1fa062e8ce2ff3efd7e0b5afab1a416c43ba5e2feaf97bbffa3af0138b630 |
| comment-6646341085 | [comment-6646341085](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646341085) | a31474a6a5426c104214c8414207bd3cc08a85cbc2c2b4f5d75f5812ca872a8f |
| comment-6647481988 | [comment-6647481988](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6647481988) | 9dd762893e9951ae527efb372daeafe97d8312e38972451282b2586c70c74d26 |
| comment-6647462596 | [comment-6647462596](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6647462596) | 52eaf986422f65703b491a04688642f3d64c60f2f832eb4cb1dca1dd9dbb6b36 |
| comment-6646855408 | [comment-6646855408](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646855408) | 5a2a2fcf7b66d6d6953fe3a92428dd0fa04339be7a2249366ee8522bff659cfb |
| comment-6646833619 | [comment-6646833619](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646833619) | d11ad5cdeff6e3802d040c96015e2a7dec6032a102ab76a83aecf48e6f9574ef |
| comment-6647613612 | [comment-6647613612](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6647613612) | 245971616555eec15a421cf26238456c656956382b7fb2da50a64dccd8c429d6 |
| comment-6645475201 | [comment-6645475201](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6645475201) | 4d68caa8770a744c4d5780a00aab2cd20a5755cd9ecbf0eb57547375212e39e9 |
| repo-20 | [media/attention/hooks/register.js](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/media/attention/hooks/register.js) | 63dc8aaa42f7436803afd292bdc341c2ead2aef69a630ee1707d9a4e2db545da |
| repo-21 | [src/panel/webview/xtermTerminal.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/xtermTerminal.ts) | ad9a88a7a60f0ecf79a2f19b7913b9de706bde9b47fad5f0ee35243f6c795a39 |
| repo-22 | [src/panel/sessionPanelProvider.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/sessionPanelProvider.ts) | 7a2c4d97b7414941e5ca739ffce45e531f81cb49029b579d7e660bfaf575ba56 |
| repo-23 | [src/panel/webview/composer/markdownPreview.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/composer/markdownPreview.ts) | e9068f6146633cd2a318b976dbc6f0595fef80b6739b0221904afb0f7529fbca |
| repo-24 | [src/panel/webview/composer/references.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/composer/references.ts) | f6eb2df8d218b7a865bd78429ac2925f8005eb2a9b5863b6557317e562b4c2ad |
| repo-25 | [src/sessions/sessionManager.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/sessions/sessionManager.ts) | 3fdbf3df63d1e89bc6be6274e1bdda9f18a7ca96344af3d7be7b39645ea75cea |
| repo-26 | [src/panel/webview/renderer.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/renderer.ts) | a506de0fed6f97cf6e4111bacaf4b3d454abbd1c482482693b519c196d1c9136 |

## Input artifact context

Context: git ls-tree HEAD -- docs/designs/215/design_draft.md docs/designs/215/capture-channel-contract.md docs/designs/215/companion-view-contract.md docs/designs/215/evidence/capture-channel-cases.json docs/designs/215/evidence/companion-view-cases.json docs/designs/215/implementation-inputs.json at eb11873050cbcc09ece0ea3c32de1f4d39c4a345 verifies current corrected inputs. Future Create files are future implementation work, not missing publication outputs. Final source/report persistence checks are recorded on #215.

## Publication validation

All ten complete reviewer responses are retained without citation normalization or omissions. All 59 frozen input hashes remain unchanged. The nine new artifacts passed JSON/CRLF/whitespace/fence validation, 68 local links/one anchor and 72 pinned file/range references across 39 source blobs. One literal URL recipe using <path>/line placeholders is metadata for an explicit source table, not an additional file reference. These are artifact/source checks, not product qualification. Final committed-tree and PR scope checks are recorded on #215 after publication.
