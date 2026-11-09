# Deterministic path Copy candidates

* **State:** Selected through the 2026-11-08 auto-accepted R3 correction. These are exact v1 recognition rules and design vectors, not measured detector coverage.
* **Needs retained:** full explanation context, one-click Copy for clear paths, editable Review for uncertain candidates and no filesystem lookup/expansion/normalization. [A; P]
* **Precedence:** existing command/fence targets first; mapped inline-code interiors and matched prose quotes second; this unquoted scanner last. Never add path actions inside an existing command/code target.

## Source units and lexical starts

Offsets are zero-based UTF-16 indices into the immutable retained source revision, end exclusive. Literal values come from that exact slice, except already-selected enclosing code/quote delimiters. Count limits in UTF-8 bytes. Do not normalize Unicode, slashes, variables, percent encodings, case or line suffixes.

Scan only plain prose spans supplied by the source-mapped Markdown layer. Skip code/fence spans, Markdown link destinations, and explicit URI tokens beginning with scheme://, mailto: or www.; never start a path inside a skipped token. An unclosed fence/quote or unverifiable Markdown mapping cannot produce a clear path action.

A start occurs at the first character of one of these forms, with a prose boundary before it (start of span, whitespace, colon, or opening bracket/quote; never a preceding letter/digit/underscore):

1. Drive root: ASCII letter, colon, slash or backslash.
2. POSIX root: one slash; UNC: two identical leading separators followed by nonempty server/share components.
3. Explicit relative/home prefix: ./, ../, ~/ and corresponding backslash relative forms.
4. A maximal non-whitespace token containing an internal slash/backslash and nonempty components. This is a syntactic candidate, not an existence or intent claim.
5. Variable/device forms permitted by the main grammar are Review-only; retain their raw spelling.

Bare prose words without a root/prefix/separator get no path action. Bare inline folder names still use the main file/folder/directory/path cue rule. Quoted/code paths use their explicit interiors and stay one-click when their literal mapping is clear, including spaces.

## Unquoted endpoint and action algorithm

For each earliest unmasked seed S, find its candidate segment end E using the following precedence. A nested relative token cannot split an already open spaced candidate; it might be part of that path.

| Boundary | Exact end |
|---|---|
| End of plain-prose span or CR/LF | Before the boundary; exclude external whitespace immediately before it. |
| Next explicit rooted/prefixed seed after whitespace | Before the whitespace separating the next seed; independently scan the next seed. Drive/UNC/POSIX/./../~/ starts split; an unrooted folder/a token does not. |
| Comma, semicolon, or ASCII . ! ? followed by whitespace or end of span | Immediately after that punctuation. It remains in the Review candidate; do not silently strip it. Dots followed by a nonspace character, such as the dot in a.txt or v1.2/f, do not terminate. |
| None of the above | End of span, excluding external trailing whitespace. |

Ambiguous indicators are exact: a terminal character from . , ; : ! ? ) ] } > single-quote or double-quote; any bracket/quote character within an unquoted candidate; a terminal suffix matching :digits or :digits:digits; a variable marker $ or a paired %name%; a device prefix (two backslashes followed by ? or . and a separator); backslash immediately before a quote; or an unmatched opening quote immediately before the seed. Ordinary path-separator backslashes and the supported ~/ prefix alone are not escape/variable ambiguity.

Let H be the maximal initial non-whitespace token from S before E. Do not infer a later word is outside a path just because it is English prose. Candidate C is source[S:E].

**Clear:** C equals H, has no terminal ambiguous punctuation/line suffix/unbalanced quote or bracket/device/variable/uncertain-escape indicator, and belongs to the supported syntactic path forms. Copy that entire literal C with one click.

**Review:** C has internal whitespace, ambiguous terminal punctuation, a possible :line/:line:column suffix, or an uncertain syntactic indicator. Review the entire C; do not expose a separate clear Copy for its initial H. The user may remove trailing explanation/punctuation in the existing editable dialog. A candidate containing spaces is never silently treated as an exact complete path.

**Unavailable/omitted:** empty/unmapped spans, NUL, invalid source boundaries or candidate longer than 32 KiB have no path Copy/Review target; keep the explanation and existing Raw access. Do not shorten the candidate to make it fit. Skipped URI/code spans get no additional path target.

This conservative rule intentionally sends unquoted paths followed by ordinary prose to Review, even when a human might guess the first token is complete. Explicit code/quotes and isolated unquoted paths retain one-click Copy. It avoids truncating a potentially spaced path while preserving the approved uncertain-path interaction; v1 does not claim semantic detection of a filename's end. [A; P; R3]

## Exact examples

The [path-copy vectors](evidence/path-copy-cases.json) specify every action's exact source span and literal candidate. Required examples include:

| Input | Action / exact candidate |
|---|---|
| Open C:/repo/a.txt | Copy C:/repo/a.txt |
| Open C:/repo/a.txt now. | Review C:/repo/a.txt now. |
| Open C:/repo folder/a.txt now. | Review C:/repo folder/a.txt now. |
| Paths C:/a.txt D:/b.txt | Two Copy targets: C:/a.txt and D:/b.txt |
| Compare C:/a b/file.txt and D:/c.txt now. | Review C:/a b/file.txt and; Review D:/c.txt now. |
| C:/a.txt, D:/b.txt | Review C:/a.txt,; Copy D:/b.txt |
| /repo/v1.2/a.txt | Copy the entire path; filename periods do not split it. |
| /repo/a.txt. Then continue | Review /repo/a.txt.; no action for ordinary following words. |
| Path followed by newline and prose | Stop before newline; never bridge lines to manufacture a path. |

The multiple-path example deliberately retains the connector in the first uncertain candidate rather than inventing a language-specific trimming rule. Expose that exact value and full context before any user-confirmed edited Copy. Displayed Review candidates may include prose; ordinary one-click path targets never do so by guessing.

Include Windows/POSIX/UNC/relative files and folders, trailing separators, spaces, Unicode and emoji, sentence/filename periods, adjacent rooted paths, paired/unbalanced punctuation, line suffixes, literal variables, URI exclusions, Markdown/code precedence and over-limit omissions. Quotes/code controls confirm that the conservative prose rule does not impose Review on explicit clear boundaries.

Unquoted mixed URI/path syntax, paths whose boundaries depend on language semantics, and unquoted literal punctuation followed by spaces are not exact one-click forms. They are Review or omitted under the rules above. No filesystem existence check or additional model call resolves ambiguity.

## Transfer and sources

Transfer vectors to the already-planned copy-cases fixture and companionContent tests. A verifier may check source slices, scalar boundaries, expected actions and byte budgets now; actual extraction/DOM/clipboard qualification remains future work. No existing Run or shell-family module is introduced.

* **A:** [Author auto-accept of all six corrections](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6721197465).
* **P:** [Approved clear versus uncertain path behavior](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6684329277).
* **R3:** [Fresh readiness finding and concrete ambiguity](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/reviews/2026-11-07-copying-v1/consolidated_review_report.md#r3--major-make-unquoted-prose-path-boundaries-deterministic).
* **Source/value boundaries:** [main design](design_draft.md), [view Review lifetime](companion-view-contract.md).
