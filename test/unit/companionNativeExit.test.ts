import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash, webcrypto } from "node:crypto";
import { runInNewContext } from "node:vm";
import * as ts from "typescript";
type Json = ReturnType<typeof JSON.parse>;
function source(file: string): Json {
    const filename = resolve("test/manual", file);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return existsSync(filename) ? require(filename) : {};
}
const control = source("companionNativeExitControl.cjs");
const N = source("companionNativeExit.smoke.cjs");
const nonce = "a".repeat(32);
const frame = "11".repeat(16);
describe("owned normal-exit envelope", () => {
    it("can replay a complete offline envelope without authenticating it as actual evidence", async () => {
        const o = await N.observeExit(timeline("complete").io, nonce);
        const fixture = "test/fixtures/companion/native-qualification/native-f-108f14b.receipt.json";
        const f = source("companionNativeLifetimeSupport.cjs").parseFPrerequisite(readFileSync(fixture));
        const sources = f.receipt.sources.map((s: Json) => ({ label: sha(s.path), sha256: s.sha256 }));
        const extra = [fixture, "test/manual/companionNativeLifetime.smoke.cjs", "test/manual/companionNativeLifetimeSupport.cjs", "test/manual/companionNativeExit.smoke.cjs", "test/manual/companionNativeExitControl.cjs"];
        sources.push(...extra.map(n => ({ label: sha(n), sha256: sha(n) })));
        const before = { head: "f".repeat(40), config: sha("config"), prerequisite: sha256Buffer(f.raw), pins: f.receipt.before, profile: f.receipt.runtime, index: sha("index"), sources };
        const intent = { state: "present", bytes: 32, sha256: sha("intent"), identity: sha("inode") }, channel = sha("channel"), parent = { state: "present", identity: sha("parent") };
        const inventory = { format: "lifetime-inventory-v1", observation: "bounded-stable-scan/non-atomic", method: "companionCapture.ts@108f14b:590-639/no-host-transaction-reservations",
            unknownRoot: { files: 0, bytes: 0, chargedByProduction: false }, bindings: { retained: 1, exposed: 1 }, physical: { bytes: 232, files: 3, directories: 1, withinLimits: true },
            future: { bytes: 2125824, files: 32, rootEntries: 12, withinLimits: true, nextPrepare: { bytes: 4240384, files: 53, rootEntries: 13, slotAvailable: true, withinLimits: true } },
            slots: [{ slot: 0, bytes: 32, sha256: intent.sha256, identity: intent.identity, channelLabel: channel }], channels: [{ label: channel, identity: parent.identity, claimed: true, bytes: 200, files: 2,
                    staging: { transactions: 0, files: 0, bytes: 0, withinLimits: true }, unknown: { files: 0, bytes: 0 } }], violations: [], watch: { parent, intent } };
        const generated = [...Array(5).fill(sha("generated")), ...sources.slice(0, 11).map((s: Json) => s.sha256)];
        const finalRead = structuredClone(o.samples.at(-1));
        finalRead.file.start = finalRead.file.end = o.end + 1;
        finalRead.intervals.forEach((v: Json) => { v[0] = v[1] = o.end + 1; });
        const proof = { parent: sha("p"), intent: sha("i"), sha256: intent.sha256 };
        const r = { format: "native-exit-diagnostic-v1", scope: "diagnostic-not-E", topology: "injected-qualification-probe-only/development", synthetic: false, nativeExecuted: true,
            eQualified: false, admission: false, workerQuiescence: "unestablished", storage: "preserved", status: "diagnostic-observed", reason: "none", before, after: before, generated, generatedAfter: generated,
            inspections: ["version", "auth", "version", "auth"].map(kind => ({ kind, close: "observed", termination: "not-requested", reason: "none", exit: "zero" })),
            ipc: ["init", "prepare-primary", "expose-primary", "snapshot", "snapshot", "stop"].map((kind, i) => ({ id: "l-" + (i + 1), kind, phase: "settled", late: false, outcome: "ok", reason: "none", atMs: i < 4 ? i : o.end + 1, binding: null })),
            baseline: inventory, finalInventory: inventory, retainedBefore: proof, retainedAfter: proof, observation: { ...o, synthetic: false, nativeExecuted: true }, finalRead, readBack: finalRead,
            producerExit: o.exit, hostExit: { at: o.end + 1, code: 0, signal: null }, hostClose: true, gitCloses: true, teardown: "owned-exits-observed" };
        assert.ok(N.validateReceipt(r));
        assert.equal(N.validateActualReceipt(r), false);
        assert.equal(N.validateReceipt({ ...r, readBack: { ...finalRead, complete: false } }), false);
        assert.equal(N.validateReceipt({ ...r, ipc: r.ipc.map(m => ({ ...m, atMs: 0 })) }), false);
        assert.equal(N.validateReceipt({ ...r, retainedAfter: { ...proof, intent: sha("changed") } }), false);
    });
    it("permits bounded compact checkpoints through 1 MiB and rejects the first excess byte", () => {
        assert.equal(typeof N.encodeCheckpoint, "function", "missing bounded compact receipt encoder");
        const fixed = Buffer.byteLength('{"value":""}\n'), v = { value: "a".repeat(1048576 - fixed) };
        assert.equal(Buffer.byteLength(N.encodeCheckpoint(v)), 1048576);
        v.value += "b";
        assert.throws(() => N.encodeCheckpoint(v), /receipt-limit/);
    });
    it("checks all pins, the closed local config and clipped IPC deadlines", () => {
        assert.equal(typeof N.validateConfig, "function", "missing closed config pin gate");
        const config = { nativeExecutable: "C:/owned/native", declarationPath: "C:/owned/types", ownedParent: "C:/owned/fresh", sourceSha: "c".repeat(40),
            nativeVersion: "2.1.322", nativeSha256: "345996b4bdbae21d817f750fae2f34cbf8d81224a5444c78136091d121beb298", declarationSha256: "bfbbc814e3c033d7d9942f58a73cd57cbc5fa1edba0a664653ff4103ad4201bc",
            hostProfile: { platform: "win32", arch: "x64", node: "24.14.0", uv: "1.51.0", electron: null } };
        assert.deepEqual(N.validateConfig(config), config);
        for (const change of [{ healthy: true }, { nativeSha256: "0".repeat(64) }, { hostProfile: { ...config.hostProfile, node: "24.14.1" } }])
            assert.throws(() => N.validateConfig({ ...config, ...change }));
        assert.equal(N.ipcBudget(21), 2000);
        assert.equal(N.ipcBudget(289993), 7);
        assert.throws(() => N.ipcBudget(290000));
    });
    it("refuses a partial or caller-asserted observation as an actual completed receipt", () => {
        assert.equal(typeof N.validateReceipt, "function", "missing closed envelope validator");
        for (const r of [null, {}, { status: "diagnostic-observed", synthetic: false, nativeExecuted: true, eQualified: true }]) {
            assert.equal(N.validateReceipt(r), false);
            assert.equal(N.validateActualReceipt(r), false);
        }
    });
});
describe("normal-exit read and replay boundaries", () => {
    it("defers only same-identity intermediate instability and preserves hard/final errors", async () => {
        assert.equal(typeof N.readObservation, "function", "missing strict read adapter");
        const error = (operation: string, classification: string) => Object.assign(Error("private-path"), { readIssue: { operation, classification } });
        const read = (err: Error, final = false) => N.readObservation(async () => { throw err; }, () => 10, "file", final, nonce);
        assert.deepEqual(await read(error("fstat-after", "unstable")), { start: 10, end: 10, state: "unstable", operation: "fstat-after", classification: "unstable" });
        for (const [op, kind, final] of [["fstat-after", "unstable", true], ["lstat-before", "links", false], ["canonical-before", "canonical", false]] as const) {
            const actual = await read(error(op, kind), final);
            assert.equal(actual.state, "hard");
            assert.equal(actual.classification, kind);
            assert.ok(!JSON.stringify(actual).includes("private"));
        }
        const missing = await read(Object.assign(error("lstat-before", "io"), { code: "ENOENT" }));
        assert.equal(missing.state, "absent");
    });
    it("replays only closed observations and never converts a synthetic receipt to live evidence", async () => {
        assert.equal(typeof N.validateObservation, "function", "missing closed replay");
        const o = await N.observeExit(timeline().io, nonce);
        assert.ok(N.validateObservation(o));
        for (const altered of [{ ...o, admission: true }, { ...o, arbitrary: "private" }, { ...o, workerQuiescence: "established" },
            { ...o, releaseRequested: o.b1 + 6000 }, { ...o, sent: o.b1 - 1 }, { ...o, synthetic: false, nativeExecuted: true }])
            assert.equal(N.validateObservation(altered), false);
        assert.equal(N.validateActualReceipt({ ...o, synthetic: false, nativeExecuted: true }), false);
    });
});
/** Exercise the decision protocol using monotonic synthetic observations. */
function timeline(change = "") {
    let time = 100, alive = true, sent = 0, released = 0;
    const writes: string[] = [];
    const challenges: Record<string, string> = {};
    const pending = () => ({ start: time, end: time, state: "absent", bytes: null, sha256: null });
    const io = {
        now: () => time, alive: () => alive, send: (message: string) => { sent++; writes.push(message); },
        challenge: async (phase: string, token: string) => { challenges[phase] = token; },
        release: async () => { released++; }, checkpoint: async () => { }, sleep: async (ms: number) => { time += ms; },
        exit: () => alive ? null : { at: time - (time % 100), code: 0, signal: null, emergency: false },
        sample: async () => {
            if (sent && time >= 100 + (change === "expiry" ? 9000 : 1200))
                alive = false;
            const marks: Json = { started: { nonce, version: "2.1.322", turns: 0 }, entry: { nonce, frame, origin: "workspaces-attention", tier: "user", targetKind: "epoch-request-upload", bytes: 5, sha256: sha("epoch"), forwardCount: 0 } };
            if (sent && (change !== "expiry" || time >= 6100)) {
                marks["end-entry"] = { nonce, reason: change === "mismatch" ? "clear" : "prompt_input_exit" };
                if (change === "aborted")
                    marks.aborted = { nonce, frame };
                if (change === "exit")
                    alive = false;
            }
            let file: Json = pending();
            for (const phase of ["send", "release"]) {
                if (challenges[phase] && change !== "stale-" + phase)
                    marks[phase + "-participation"] = { nonce, frame, challenge: challenges[phase] };
            }
            if (released && change === "intent-only")
                marks.intent = { nonce, frame };
            if (released && change === "complete") {
                marks.intent = { nonce, frame };
                marks.returned = { nonce, frame, coreVerified: true };
                marks["end-returned"] = { nonce };
                file = { start: time, end: time, state: "matching", bytes: 5, sha256: sha("epoch") };
            }
            const roles = ["started", "entry", "intent", "returned", "rejected", "aborted", "failed", "unexpected", "end-entry", "end-returned", "end-rejected", "ack-failed", "send-participation", "release-participation"];
            return { marks, intervals: roles.map(k => [time, time, marks[k] ? "present" : "absent"]), file, complete: true };
        }
    };
    let firstExit: Json = null;
    io.exit = () => {
        if (!alive)
            firstExit ??= { at: time, code: 0, signal: null, emergency: false };
        return firstExit;
    };
    return { io, writes, counts: () => [sent, released] };
}
describe("normal-exit review regressions", () => {
    it("keeps an oversized snapshotted checkpoint latched as a persistence failure", async () => {
        const r = { text: "a".repeat(1048576) }, writes: string[] = [], faults: string[] = [];
        const p = N.createReceiptPersistence(r, async (v: string) => { writes.push(v); }, (reason: string) => faults.push(reason));
        await assert.rejects(p.checkpoint(1000));
        r.text = "smaller";
        await assert.rejects(p.checkpoint(1000));
        assert.deepEqual(writes, []);
        assert.deepEqual(faults, ["checkpoint-failed"]);
    });
    it("freezes full receipt bytes at checkpoint submission, including overlapping requests", async () => {
        assert.equal(typeof N.createReceiptPersistence, "function", "missing by-value checkpoint boundary");
        const receipt = { observation: { stage: "submitted" } }, writes: string[] = [], faults: string[] = [];
        const persistence = N.createReceiptPersistence(receipt, async (bytes: string) => { writes.push(bytes); }, (reason: string) => faults.push(reason));
        const first = persistence.checkpoint(1000);
        receipt.observation.stage = "advanced";
        await first;
        assert.equal(JSON.parse(writes[0]!).observation.stage, "submitted");
        const next = persistence.checkpoint(1000);
        receipt.observation.stage = "later";
        await Promise.all([assert.rejects(next, /checkpoint-failed/), assert.rejects(persistence.checkpoint(1000), /checkpoint-failed/)]);
        assert.equal(JSON.parse(writes[1]!).observation.stage, "advanced");
        assert.deepEqual(faults, ["checkpoint-failed"]);
    });
    it("persists detached partial snapshots whose summaries replay before and after PTY exit", async () => {
        const { io } = timeline("complete"), saved: {
            snapshot: Json;
            text: string;
        }[] = [];
        const outcome = await N.observeExit({ ...io, checkpoint: async (snapshot: Json) => {
                saved.push({ snapshot, text: JSON.stringify(snapshot) });
            } }, nonce);
        assert.equal(outcome.status, "diagnostic-observed");
        const copies = saved.map(x => JSON.parse(x.text));
        assert.ok(copies.some(p => p.exit && p.samples.at(-1).marks.returned && p.status === "unestablished"));
        for (const p of copies) {
            assert.ok(N.validateObservation(p), "each serialized checkpoint must replay independently");
            if (p.exit && p.samples.at(-1).marks.returned) {
                assert.equal(p.dispatch, "confirmed-returned");
                assert.ok(p.coverage);
            }
        }
        for (const captured of saved)
            assert.equal(JSON.stringify(captured.snapshot), captured.text);
    });
    for (const changed of [false, true]) {
        it("resolves a target against the retained B1 digest on an incomplete entry read, changed=" + changed, async () => {
            const { io } = timeline("complete"), read = io.sample;
            let unstableAt: number | null = null;
            const o = await N.observeExit({ ...io, sample: async () => {
                    const s = await read();
                    if (unstableAt === null && io.exit() && s.file.state === "matching") {
                        unstableAt = io.now();
                        delete s.marks.entry;
                        s.complete = false;
                        s.intervals[1] = [unstableAt, unstableAt, "unstable", "fstat-after", "unstable"];
                        // The physical read returned stable bytes. The per-read entry comparison has no current marker.
                        s.file.state = "unmatched";
                        if (changed)
                            s.file.sha256 = sha("different stable bytes");
                    }
                    return s;
                } }, nonce);
            assert.notEqual(unstableAt, null);
            assert.equal(o.reason, changed ? "evidence-conflict" : "none");
            const at = o.samples.findIndex((s: Json) => s.file.start === unstableAt);
            assert.equal(o.samples[at].complete, false);
            assert.equal(o.samples[at].marks.entry, undefined);
            assert.equal(o.samples[at].file.state, changed ? "unmatched" : "matching");
            if (!changed) {
                assert.equal(o.samples[at + 1].complete, true);
                assert.equal(o.status, "diagnostic-observed");
            }
            assert.ok(N.validateObservation(o));
        });
    }
    it("rejects another frame echoing the correct challenge for the same nonce and payload", async () => {
        const { io, counts } = timeline(), sample = io.sample;
        io.sample = async () => {
            const s = await sample();
            const ack = s.marks["send-participation"];
            if (ack)
                ack.frame = "22".repeat(16);
            return s;
        };
        const o = await N.observeExit(io, nonce);
        assert.deepEqual(counts(), [0, 0]);
        assert.equal(o.reason, "evidence-conflict");
        assert.ok(N.validateObservation(o));
    });
    it("does not reuse an acknowledgement first observed with an incomplete decision sample", async () => {
        const { io, counts } = timeline(), sample = io.sample;
        let interrupted = false;
        io.sample = async () => {
            const s = await sample();
            if (!interrupted && s.marks["send-participation"]) {
                interrupted = true;
                s.intervals[4] = [io.now(), io.now(), "unstable", "fstat-after", "unstable"];
                s.complete = false;
            }
            return s;
        };
        const o = await N.observeExit(io, nonce);
        assert.deepEqual(counts(), [0, 0]);
        assert.equal(o.reason, "participation-unestablished");
        assert.ok(N.validateObservation(o));
    });
    it("retains a downstream witness outside the matched B1 release as conflicting rather than confirmed", async () => {
        const { io, counts } = timeline(), sample = io.sample;
        io.sample = async () => { const s = await sample(); s.marks.returned = { nonce, frame, coreVerified: true }; s.intervals[3]![2] = "present"; return s; };
        const o = await N.observeExit(io, nonce);
        assert.deepEqual(counts(), [0, 0]);
        assert.equal(o.reason, "evidence-conflict");
        assert.equal(o.dispatch, "unknown");
        assert.equal(o.mutation, "unknown");
        assert.ok(N.validateObservation(o));
    });
    it("retains a wrong fresh challenge response without allowing a stimulus", async () => {
        const { io, counts } = timeline(), sample = io.sample;
        io.sample = async () => {
            const s = await sample();
            if (s.marks["send-participation"])
                s.marks["send-participation"].challenge = "0".repeat(32);
            return s;
        };
        const o = await N.observeExit(io, nonce);
        assert.deepEqual(counts(), [0, 0]);
        assert.equal(o.reason, "evidence-conflict");
        assert.ok(N.validateObservation(o));
    });
    it("rejects a replaced generated host before handing it to fork", async () => {
        assert.equal(typeof N.forkVerifiedHost, "function", "missing pre-fork identity check");
        const calls: string[] = [];
        const launch = () => { calls.push("fork"); return "child"; };
        const read = async () => Buffer.from("changed");
        await assert.rejects(() => N.forkVerifiedHost("owned/host", sha("reviewed"), launch, read), /identity-mismatch/);
        assert.deepEqual(calls, []);
        assert.equal(await N.forkVerifiedHost("owned/host", sha("changed"), launch, read), "child");
    });
    it("begins producer-first shutdown on a missing normal exit before any inspection", async () => {
        assert.equal(typeof N.afterObservation, "function", "missing bounded shutdown branch");
        const events: string[] = [];
        const h = { exited: false, closed: false, child: { kill: () => { events.push("host-stop"); h.exited = true; h.closed = true; return true; } } };
        const owned = { h1: h, h2: null, producerExited: false, pty: { terminate: async () => { events.push("producer-stop"); owned.producerExited = true; } } };
        const o = { reason: "normal-exit-unobserved", exit: null };
        const result = await N.afterObservation(o, owned, () => 61000, async () => { events.push("inspect"); });
        assert.deepEqual(events, ["producer-stop", "host-stop"]);
        assert.deepEqual(result, { reason: "normal-exit-unobserved", teardown: "emergency-owned-exits-observed" });
    });
    it("does not send on stale entry or release on an abandoned frame with missing terminal markers", async () => {
        for (const missing of ["stale-send", "stale-release"]) {
            const { io, counts } = timeline(missing);
            const o = await N.observeExit(io, nonce);
            assert.deepEqual(counts(), missing === "stale-send" ? [0, 0] : [1, 0]);
            assert.equal(o.status, "unestablished");
            assert.ok(N.validateObservation(o));
        }
    });
    it("rejects an uncovered post-exit tail even when end, return and target were observed", async () => {
        const { io } = timeline("complete"), advance = io.sleep;
        io.sleep = async (ms) => advance(io.exit() && io.now() > 2000 ? 60000 : ms);
        const o = await N.observeExit(io, nonce);
        assert.equal(o.status, "unestablished");
        assert.equal(o.reason, "coverage-gap");
        assert.ok(o.coverage.maxGap > 1000);
        assert.ok(N.validateObservation(o));
        assert.equal(N.validateObservation({ ...o, status: "diagnostic-observed", reason: "none" }), false);
    });
    it("retains conflicting payload evidence as an explicit failure without a definite mutation", async () => {
        const { io } = timeline("complete"), sample = io.sample;
        io.sample = async () => {
            const s = await sample();
            if (io.now() >= 3000) {
                s.marks.entry.sha256 = sha("changed");
                s.file.sha256 = sha("changed");
            }
            return s;
        };
        const o = await N.observeExit(io, nonce);
        assert.equal(o.reason, "evidence-conflict");
        assert.equal(o.mutation, "unknown");
        assert.ok(N.validateObservation(o));
        assert.equal(N.validateObservation({ ...o, reason: "unestablished", mutation: "observed-post-exit-mutation" }), false);
    });
    it("keeps pre-call intent unconfirmed when the terminal acknowledgement is missing", async () => {
        const { io } = timeline("intent-only");
        const o = await N.observeExit(io, nonce);
        assert.equal(o.dispatch, "unknown");
        assert.equal(o.status, "unestablished");
        assert.ok(o.samples.some((s: Json) => s.marks.intent));
        assert.ok(N.validateObservation(o));
        assert.equal(N.validateObservation({ ...o, dispatch: "confirmed-returned" }), false);
    });
});
describe("explicit normal-exit schedule", () => {
    it("records an unconfirmed write when receipt persistence crosses the original release deadline", async () => {
        const { io } = timeline("complete");
        const release = io.release;
        io.release = async () => { await release(); await io.sleep(6100); };
        const o = await N.observeExit(io, nonce);
        assert.equal(o.status, "unestablished");
        assert.ok(o.releaseRequested !== null);
        assert.equal(o.reason, "release-late");
    });
    it("rejects forged ordering, expired or fabricated terminal observations during replay", async () => {
        const { io } = timeline("complete");
        const o = await N.observeExit(io, nonce);
        assert.equal(o.status, "diagnostic-observed");
        assert.ok(N.validateObservation(o));
        const early = structuredClone(o);
        early.samples[0].marks["end-entry"] = { nonce, reason: "prompt_input_exit" };
        early.samples[0].intervals[8][2] = "present";
        assert.equal(N.validateObservation(early), false);
        const reversed = structuredClone(o);
        reversed.samples.at(-1).intervals[0][0] = reversed.samples.at(-2).file.end - 1;
        assert.equal(N.validateObservation(reversed), false);
        const unsampled = structuredClone(o);
        unsampled.samples = unsampled.samples.filter((s: Json) => s.file.end <= o.exit.at);
        unsampled.mutation = "unknown";
        assert.equal(N.validateObservation(unsampled), false);
        const disappeared = structuredClone(o);
        delete disappeared.samples.at(-2).marks.returned;
        disappeared.samples.at(-2).intervals[3][2] = "absent";
        assert.equal(N.validateObservation(disappeared), false);
        assert.equal(N.validateObservation({ ...o, releaseRequested: o.releaseRequested + 900, releaseAccepted: o.releaseAccepted + 900 }), false);
        assert.equal(N.validateObservation({ ...o, exit: { ...o.exit, emergency: true } }), false);
        assert.equal(N.validateObservation({ ...o, end: 289999 }), false);
    });
    it("preserves uncertainty for bounded checkpoint, output and controller failures", async () => {
        for (const reason of ["checkpoint-failed", "output-limit", "controller-deadline"]) {
            const { io } = timeline("complete");
            io.checkpoint = async () => { throw Error(reason); };
            const o = await N.observeExit(io, nonce);
            assert.equal(o.reason, reason);
            assert.equal(o.status, "unestablished");
            assert.equal(o.storage, "preserved");
        }
    });
    for (const [condition, count] of [["ordinary", 1], ["aborted", 0], ["expiry", 0], ["mismatch", 0], ["exit", 0]] as const) {
        it("uses one original input and bounds release for " + condition, async () => {
            assert.equal(typeof N.observeExit, "function", "missing schedule");
            const scenario = timeline(condition);
            const observation = await N.observeExit(scenario.io, nonce);
            assert.deepEqual(scenario.writes, ["/exit\r"]);
            assert.deepEqual(scenario.counts(), [1, count]);
            assert.equal(observation.synthetic, true);
            assert.equal(observation.nativeExecuted, false);
            assert.equal(observation.eQualified, false);
            assert.equal(observation.workerQuiescence, "unestablished");
            assert.equal(observation.storage, "preserved");
        });
    }
});
const target = "C:/owned/channel/request." + "f".repeat(32) + ".upload";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const sha256Buffer = (value: Buffer) => createHash("sha256").update(value).digest("hex");
/** Check the loader's placement rule for direct calls that pass the SDK binding. */
function nonModuleSdkHelperCalls(source: string): string[] {
    const file = ts.createSourceFile("control.js", source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
    const options: ts.CompilerOptions = { allowJs: true, noLib: true, noResolve: true, types: [] };
    const host = ts.createCompilerHost(options);
    host.getSourceFile = name => name === file.fileName ? file : undefined;
    const checker = ts.createProgram([file.fileName], options, host).getTypeChecker();
    const rejected = new Set<string>();

    function isModuleHelper(declaration: ts.Declaration): boolean {
        if (ts.isFunctionDeclaration(declaration))
            return declaration.parent === file && declaration.body !== undefined;
        if (ts.isVariableDeclaration(declaration)) {
            const list = declaration.parent, initializer = declaration.initializer;
            return ts.isVariableDeclarationList(list) && (list.flags & ts.NodeFlags.Const) !== 0 &&
                ts.isVariableStatement(list.parent) && list.parent.parent === file &&
                initializer !== undefined && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer));
        }
        if (ts.isImportSpecifier(declaration) || ts.isImportClause(declaration)) {
            const imported = ts.findAncestor(declaration, ts.isImportDeclaration)?.moduleSpecifier;
            return imported !== undefined && ts.isStringLiteral(imported) &&
                imported.text.startsWith("./") && !imported.text.split("/").includes("..");
        }
        return false;
    }

    function visit(node: ts.Node): void {
        if (ts.isCallExpression(node) && node.arguments.some(arg => ts.isIdentifier(arg) && arg.text === "$")) {
            const callee = node.expression;
            const declarations = ts.isIdentifier(callee) ? checker.getSymbolAtLocation(callee)?.declarations : undefined;
            if (!declarations?.some(isModuleHelper))
                rejected.add(callee.getText(file));
        }
        ts.forEachChild(node, visit);
    }
    visit(file);
    return Array.from(rejected);
}
/** Execute generated SDK callbacks against an in-memory filesystem and one continuation per event. */
function sdk() {
    assert.equal(typeof control.createControlPluginSource, "function", "missing diagnostic control");
    const generated = control.createControlPluginSource({ target, control: "C:/owned/markers", nonce });
    const hooks = new Map<string, Json>(), failures = new Map<string, Json>(), files = new Map<string, string>();
    const state = { time: 0, remaining: 8000, abort: false, failMarker: "", reject: false, calls: 0, release: "",
        lookup: null as null | (() => Promise<boolean>), readToken: null as null | (() => string),
        sendGate: null as null | (() => Promise<boolean>), rejection: new Error("original downstream"),
        during: (name: string) => { void name; } };
    const register = runInNewContext(generated.replace("export function register", "function register") + "\nregister", { performance: { now: () => state.time }, TextEncoder, crypto: { subtle: webcrypto.subtle, getRandomValues: (bytes: Uint8Array) => bytes.fill(0x11) } });
    register((kind: string, handle: Json) => {
        assert.equal(hooks.has(kind), false, "one literal handler per event");
        hooks.set(kind, handle);
        return { catch: (handler: Json) => failures.set(kind, handler) };
    });
    const api = { fs: {
            write: async (p: string, value: string) => {
                const name = p.split("/").pop()!;
                state.during(name);
                if (name === state.failMarker)
                    throw Error("private");
                files.set(name, value);
            },
            exists: async (file: string) => file.endsWith("challenge-send") && state.sendGate ? state.sendGate() :
                file.includes("challenge-") || (state.lookup ? await state.lookup() : !!state.release),
            read: async (file: string) => file.endsWith("challenge-send") ? nonce + ":" + frame + ":" + "c".repeat(32) : file.endsWith("challenge-release") ?
                nonce + ":" + frame + ":" + "d".repeat(32) : state.readToken ? state.readToken() : state.release + ":" + frame + ":" + "d".repeat(32)
        }, clock: { sleep: async (ms: number) => { state.time += ms; } }, session: { version: async () => ({ base: "2.1.322", version: "2.1.322" }), turns: async () => 0 } };
    const invoke = async (kind: string, event: Json) => {
        let downstream: Promise<Json> | undefined;
        const run = async (received: Json) => {
            assert.equal(received, event);
            state.calls++;
            if (state.reject)
                throw state.rejection;
            return event;
        };
        const next = Object.assign((received: Json) => { downstream = run(received); return downstream; }, { signal: { get aborted() { return state.abort; } }, budget: { get remainingMs() { return state.remaining; } }, origin: { plugin: "workspaces-attention", tier: "user" },
            trace: [{ plugin: "engine", tier: "core", event: "fs.write", outcome: "returned", received: event }] });
        try {
            return await hooks.get(kind)(api, event, next);
        }
        catch (error) {
            if (failures.has(kind))
                return failures.get(kind)(api, event, Object.assign((e: Json) => downstream ?? next(e), next, { called: downstream !== undefined, error: { kind: "throw", message: (error as Error).message } }));
            throw error;
        }
    };
    return { invoke, state, files, hooks };
}
describe("preservation-only normal-exit control", () => {
    it("passes the SDK only to module-scoped helpers", () => {
        const generated = control.createControlPluginSource({ target, control: "C:/owned/markers", nonce });
        assert.deepEqual(nonModuleSdkHelperCalls(generated), []);
    });
    it("rejects a nested SDK helper even when a module-scoped function has the same name", () => {
        const fixture = `
import { marker } from "./markers.js";
function relay($) { return marker($); }
const write = $ => relay($);
export function register(on) {
    on('session.start', $ => write($));
    on('session.end', $ => {
        const write = $ => marker($);
        return write($);
    });
}`;
        assert.deepEqual(nonModuleSdkHelperCalls(fixture), ["write"]);
    });
    it("isolates an unrelated rejection and duplicate write from the parked original invocation", async () => {
        const { state, invoke, files } = sdk();
        let parked!: () => void, resume!: (v: boolean) => void;
        const atGate = new Promise<void>(ok => { parked = ok; }), gate = new Promise<boolean>(ok => { resume = ok; });
        state.sendGate = async () => { parked(); return gate; };
        state.release = nonce;
        const event = { path: target, text: "epoch" }, original = invoke("fs.write", event);
        try {
            await atGate;
            assert.ok(files.has("entry.json"));
            state.reject = true;
            state.abort = true;
            await assert.rejects(() => invoke("fs.write", { path: "C:/owned/unrelated", text: "other" }), e => e === state.rejection);
            assert.equal(state.calls, 1);
            assert.equal(files.has("failed.json"), false);
            assert.equal(files.has("aborted.json"), false);
            state.abort = false;
            state.reject = false;
            const duplicate = await invoke("fs.write", { ...event });
            assert.equal(typeof duplicate.deny, "string");
            assert.equal(files.has("failed.json"), false);
            assert.equal(files.has("aborted.json"), false);
            assert.deepEqual(JSON.parse(files.get("unexpected.json")!), { nonce, event: "duplicate-write" });
        }
        finally {
            state.abort = false;
            state.reject = false;
            resume(true);
            await original;
        }
        assert.ok(files.has("returned.json"));
        assert.equal(state.calls, 2);
    });
    for (const visibility of [5999, 6000, 6001]) {
        it("enforces the original Native six-second cutoff at token visibility " + visibility, async () => {
            const { invoke, state, files } = sdk(), stored = new Map<string, string>();
            let allowRename!: () => void;
            const gate = new Promise<void>(ok => { allowRename = ok; });
            const name = resolve("owned", "release"), value = nonce + ":" + frame + ":" + "d".repeat(32);
            const publishing = N.publishToken(resolve("owned"), "release", value, {
                writeFile: async (p: string, v: string) => { assert.notEqual(p, name); stored.set(p, v); },
                rename: async (from: string, to: string) => { await gate; assert.equal(to, name); state.time = visibility; stored.set(to, stored.get(from)!); stored.delete(from); }
            });
            state.lookup = async () => { assert.equal(stored.has(name), false); allowRename(); await publishing; return stored.has(name); };
            let reads = 0;
            state.readToken = () => { reads++; return stored.get(name)!; };
            await invoke("fs.write", { path: target, text: "epoch" });
            assert.equal(state.calls, visibility < 6000 ? 1 : 0);
            assert.equal(reads, visibility < 6000 ? 1 : 0);
            assert.ok(files.has("release-participation.json"));
            assert.equal(stored.get(name), value);
        });
    }
    it("forwards the original matching write once and records separate entry/forward/return", async () => {
        const { state, invoke, files } = sdk();
        state.release = nonce;
        const event = { path: target, text: "epoch" };
        assert.equal(await invoke("fs.write", event), event);
        assert.equal(state.calls, 1);
        assert.deepEqual(JSON.parse(files.get("entry.json")!), { nonce, frame, origin: "workspaces-attention", tier: "user", targetKind: "epoch-request-upload", bytes: 5, sha256: sha("epoch"), forwardCount: 0 });
        assert.ok(files.has("intent.json") && files.has("returned.json"));
        assert.equal(JSON.parse(files.get("send-participation.json")!).challenge, "c".repeat(32));
        assert.equal(JSON.parse(files.get("release-participation.json")!).challenge, "d".repeat(32));
        await invoke("fs.write", event);
        assert.equal(state.calls, 1);
    });
    for (const condition of ["abort", "budget", "hold", "exact cutoff during intent", "wrong nonce", "forward-marker failure"]) {
        it("refuses forwarding after " + condition, async () => {
            const { state, invoke, files } = sdk();
            state.release = condition === "wrong nonce" ? "b".repeat(32) : nonce;
            state.during = name => {
                if (name === "intent.json") {
                    if (condition === "abort")
                        state.abort = true;
                    if (condition === "budget")
                        state.remaining = 500;
                    if (condition === "hold")
                        state.time = 7000;
                    if (condition === "exact cutoff during intent")
                        state.time = 6000;
                }
            };
            if (condition === "forward-marker failure")
                state.failMarker = "intent.json";
            await invoke("fs.write", { path: target, text: "epoch" });
            assert.equal(state.calls, 0);
            assert.equal(files.has("returned.json"), false);
            assert.ok(files.has(condition === "abort" ? "aborted.json" : "failed.json"));
        });
    }
    it("preserves the end continuation when entry persistence fails and records downstream failure separately", async () => {
        const { invoke, state, files } = sdk();
        state.failMarker = "end-entry.json";
        const event = { reason: "prompt_input_exit", sessionId: "private" };
        assert.equal(await invoke("session.end", event), event);
        assert.equal(state.calls, 1);
        assert.ok(files.has("ack-failed.json") && files.has("end-returned.json"));
        assert.ok(!Array.from(files.values()).some(value => value.includes("private")));
        state.reject = true;
        await assert.rejects(() => invoke("session.end", event), /original downstream/);
        assert.equal(state.calls, 2);
        assert.ok(files.has("end-rejected.json"));
    });
});
describe("preservation-only normal-exit controller", () => {
    it("keeps plan and self-test inert, and refuses incomplete opt-in", async () => {
        assert.equal(typeof N.main, "function", "missing normal-exit entry point");
        for (const args of [[], ["--plan"], ["--self-test"]])
            assert.equal(await N.main(args), 0);
        for (const args of [["--run-live"], ["--plan", "--config", "missing"], ["--run-live", "--config", "relative"]])
            assert.equal(await N.main(args), 2);
    });
    it("requires a stable absence starting strictly after the actual exit for observed post-exit mutation", () => {
        assert.equal(typeof N.classifyMutation, "function", "missing causal classifier");
        const read = (start: number, end: number, state: string) => ({ start, end, state, bytes: state === "matching" ? 5 : null, sha256: state === "matching" ? sha("epoch") : null });
        assert.equal(N.classifyMutation(10, [read(9, 12, "matching")]), "first-observed-after-exit");
        assert.equal(N.classifyMutation(10, [read(10, 11, "absent"), read(12, 13, "matching")]), "first-observed-after-exit");
        assert.equal(N.classifyMutation(10, [read(11, 12, "absent"), read(13, 14, "matching")]), "observed-post-exit-mutation");
        assert.equal(N.classifyMutation(10, [read(11, 12, "unstable")]), "unknown");
    });
});
