# Controlled Windows echo baseline — 2026-10-29

Tracking: #180 and #183. The reported 0.9.0 failure remains **unlocalized**.
This synthetic workload did not reproduce a multi-second echo stall; it does
not substitute for the affected-machine Claude/background-work case (#180;
`docs/reliability/controlled-echo-data-2026-10-29.md:L61-L532`).

## Environment and provenance

The retained run completed at 12:26:55 UTC on Windows 10.0.26300 x64, VS Code 1.136.1,
Node 24.18.1, Electron 42.10.0 and Chromium 148.0.7778.280. Installed xterm was
6.0.0, WebGL addon 0.19.0, Fit addon 0.11.0 and node-pty 1.1.0. Exact runtime,
fixture and dependency-lock fingerprints are retained with the numeric data
(`docs/reliability/controlled-echo-data-2026-10-29.md:L7-L60`).

The viewport was 792×808 CSS pixels, the terminal stage 604×668, device-pixel
ratio 1, and font monospace 14 px with line height 1 and letter spacing 0.
Session ages at trial start ranged from 197 to 9,342 ms; these are fresh-session
measurements, not a long-running soak
(`docs/reliability/controlled-echo-data-2026-10-29.md:L46-L60,L541-L548,L2955-L2959,L6926-L6930`).

The source was the uncommitted diagnostics topic based on integration commit
`9133673fa539dc6994e25296245cca12d5c46120`, not an installed 0.9.0 build or a
published candidate. The listed source files can be checked against their
LF-canonicalized fingerprints; the hash algorithm also includes each relative
path and null separators (`test/manual/terminalEcho.test.ts:L66-L89`).

## Method

Run `npm run measure:terminal-echo` on Windows. Each of four scenarios creates
fresh owned PTYs and a real VS Code webview: one/four sessions, with the active
session's indicator explicitly set to idle/working. Additional sessions wait
for input. A working indicator is presentation state here, not evidence of
Claude or a subagent doing work (`test/manual/terminalEcho.test.ts:L30-L35,L98-L127`).

Each scenario has three trials per capture mode and 12 samples per trial:
288 ordered samples overall. Mode order is off/on, on/off, off/on, with a
125 ms delay after each returned sample. Trials reuse their scenario's PTYs
and webview. Fresh-session effects remain in the first trial rather than
being discarded as warm-up (`test/manual/terminalEcho.test.ts:L37-L64`).

The browser starts its local timer before synthetic paste, which travels
through the production renderer/provider/manager, a Windows command echo
child, and the actual production xterm adapter. The matching synthetic result
is recognized in a bounded rolling buffer; completion is observed inside
xterm's write callback. The same observation wrapper is present in both modes
(`test/manual/terminalEchoWebview.ts:L17-L49`; `test/fixtures/terminal-echo.cmd:L1-L9`).

The fixture waits for the final frontend timing window before stopping
capture. Its separately recorded next-animation-frame interval is scheduling
evidence, not proof that a glyph was painted or that a physical key was
received (`test/manual/terminalEcho.test.ts:L168-L176`;
`test/manual/terminalEchoWebview.ts:L25-L34`).

## Paste-to-parser observations

Values are milliseconds, rounded to two decimals. Each row contains 36
samples. Median averages the two middle values; p95 uses nearest rank.
Individual samples and per-trial/first-sample values remain in the dataset.

| Sessions | Indicator | Capture | Median | p95 | Maximum | Numeric source |
| --- | --- | --- | ---: | ---: | ---: | --- |
| 1 | idle | off | 1.30 | 12.90 | 37.60 | `docs/reliability/controlled-echo-data-2026-10-29.md:L62-L92` |
| 1 | idle | on | 1.60 | 11.70 | 12.00 | `docs/reliability/controlled-echo-data-2026-10-29.md:L93-L179` |
| 1 | working | off | 1.40 | 12.70 | 13.80 | `docs/reliability/controlled-echo-data-2026-10-29.md:L180-L210` |
| 1 | working | on | 1.40 | 11.70 | 12.00 | `docs/reliability/controlled-echo-data-2026-10-29.md:L211-L297` |
| 4 | idle | off | 1.30 | 12.00 | 12.10 | `docs/reliability/controlled-echo-data-2026-10-29.md:L298-L328` |
| 4 | idle | on | 1.40 | 11.50 | 11.70 | `docs/reliability/controlled-echo-data-2026-10-29.md:L329-L415` |
| 4 | working | off | 1.40 | 12.20 | 12.20 | `docs/reliability/controlled-echo-data-2026-10-29.md:L416-L446` |
| 4 | working | on | 1.50 | 12.40 | 14.30 | `docs/reliability/controlled-echo-data-2026-10-29.md:L447-L532` |

The descriptive on-minus-off median differences are +0.30, 0.00, +0.10 and
+0.10 ms in table order. First-trial medians differ substantially from later
trials, so these short measurements do not establish a general overhead
budget or a causal benefit from capture
(`docs/reliability/controlled-echo-data-2026-10-29.md:L61-L532`).

## Boundary evidence with capture enabled

These are maxima across the four enabled conditions. Counts differ because
the input/output correlations are sampled. All 144 enabled input samples
have an input round-trip observation; terminal output chunks are not assumed
to correspond one-for-one with input samples. Sources are the four enabled
summary groups (`docs/reliability/controlled-echo-data-2026-10-29.md:L93-L179,L211-L297,L329-L415,L447-L532`).

| Boundary | Maximum | Interpretation |
| --- | ---: | --- |
| Host input queue residence | 0.2430 ms | Host receipt to scheduled action |
| Actual PTY write call | 0.1220 ms | Synchronous write span |
| Host output handling | 0.3210 ms | Logging, listener delivery, replay preparation and posting |
| Input acknowledgement round trip | 1.60 ms | Same frontend clock |
| Output acknowledgement round trip | 1.3765 ms | Same host clock |
| Sampled frontend parsing | 0.4000 ms | Receipt to parser callback |
| Host timer gap | 3.3308 ms | Excess over the one-second schedule |
| Frontend timer gap | 4.50 ms | Independent frontend clock |
| Sampled pending parser writes | 0 | At observation points; not a universal queue bound |
| Observed pending delivery promises | 3 | Bounded host delivery observers |

Host output handling can overlap the posting portion of the output round
trip; these spans must not be summed as disjoint components
(`src/sessions/sessionManager.ts:L167-L176`;
`src/panel/sessionPanelProvider.ts:L602-L605`).

## Decision and remaining evidence

No correction or numeric acceptance budget is selected from this run. The
original report includes intermittent batches/halts on another 0.9.0 system,
possible background work and physical typing; those conditions remain
unmeasured here. Capture off/on is a within-topic comparison, not an
unmodified 0.10.0 versus fixed-build comparison (#180; #183;
`docs/reliability/controlled-echo-data-2026-10-29.md:L46-L60`).

Physical keyboard/display timing, real Claude/subagent/shell-job cases,
long-running sessions, dense output and metadata churn remain to be measured
before a root-cause fix is selected. Keep #180 open and obtain an affected-case
capture rather than interpreting this non-reproduction as resolution
(#180; `docs/reliability/baseline-and-workloads.md:L35-L84`).
