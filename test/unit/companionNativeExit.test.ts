import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash, webcrypto } from "node:crypto";
import { runInNewContext } from "node:vm";
type Json = ReturnType<typeof JSON.parse>;
function source(file: string): Json {
    const filename = resolve("test/manual", file);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return existsSync(filename) ? require(filename) : {};
}
const control = source("companionNativeExitControl.cjs");
const N = source("companionNativeExit.smoke.cjs");
const nonce = "a".repeat(32);
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
    const pending = () => ({ start: time, end: time, state: "absent", bytes: null, sha256: null });
    const io = {
        now: () => time, alive: () => alive, send: (message: string) => { sent++; writes.push(message); },
        release: async () => { released++; }, checkpoint: async () => { }, sleep: async (ms: number) => { time += ms; },
        exit: () => alive ? null : { at: time - (time % 100), code: 0, signal: null, emergency: false },
        sample: async () => {
            if (sent && time >= 100 + (change === "expiry" ? 7000 : 500))
                alive = false;
            const marks: Json = { started: { nonce, version: "2.1.322", turns: 0 }, entry: { nonce, origin: "workspaces-attention", tier: "user", targetKind: "epoch-request-upload", bytes: 5, sha256: sha("epoch"), forwardCount: 0 } };
            if (sent && (change !== "expiry" || time >= 6100)) {
                marks["end-entry"] = { nonce, reason: change === "mismatch" ? "clear" : "prompt_input_exit" };
                if (change === "aborted")
                    marks.aborted = { nonce };
                if (change === "exit")
                    alive = false;
            }
            let file: Json = pending();
            if (released && change === "complete") {
                marks.forward = { nonce };
                marks.returned = { nonce, coreVerified: true };
                marks["end-returned"] = { nonce };
                file = { start: time, end: time, state: "matching", bytes: 5, sha256: sha("epoch") };
            }
            const roles = ["started", "entry", "forward", "returned", "rejected", "aborted", "failed", "unexpected", "end-entry", "end-returned", "end-rejected", "ack-failed"];
            return { marks, intervals: roles.map(k => [time, time, marks[k] ? "present" : "absent"]), file, complete: true };
        }
    };
    let firstExit: Json = null;
    io.exit = () => { if (!alive)
        firstExit ??= { at: time, code: 0, signal: null, emergency: false }; return firstExit; };
    return { io, writes, counts: () => [sent, released] };
}
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
/** Execute generated SDK callbacks against an in-memory filesystem and one continuation per event. */
function sdk() {
    assert.equal(typeof control.createControlPluginSource, "function", "missing diagnostic control");
    const generated = control.createControlPluginSource({ target, control: "C:/owned/markers", nonce });
    const hooks = new Map<string, Json>(), failures = new Map<string, Json>(), files = new Map<string, string>();
    const state = { time: 0, remaining: 8000, abort: false, failMarker: "", reject: false, calls: 0, release: "", during: (name: string) => { void name; } };
    const register = runInNewContext(generated.replace("export function register", "function register") + "\nregister", { performance: { now: () => state.time }, TextEncoder, crypto: webcrypto });
    register((kind: string, handle: Json) => {
        assert.equal(hooks.has(kind), false, "one literal handler per event");
        hooks.set(kind, handle);
        return { catch: (handler: Json) => failures.set(kind, handler) };
    });
    const api = { fs: {
            write: async (p: string, value: string) => { const name = p.split("/").pop()!; state.during(name); if (name === state.failMarker)
                throw Error("private"); files.set(name, value); },
            exists: async () => !!state.release, read: async () => state.release
        }, clock: { sleep: async (ms: number) => { state.time += ms; } }, session: { version: async () => ({ base: "2.1.322", version: "2.1.322" }), turns: async () => 0 } };
    const invoke = async (kind: string, event: Json) => {
        const next = Object.assign(async (received: Json) => { assert.equal(received, event); state.calls++; if (state.reject)
            throw Error("original downstream"); return event; }, { signal: { get aborted() { return state.abort; } }, budget: { get remainingMs() { return state.remaining; } }, origin: { plugin: "workspaces-attention", tier: "user" },
            trace: [{ plugin: "engine", tier: "core", event: "fs.write", outcome: "returned", received: event }] });
        try {
            return await hooks.get(kind)(api, event, next);
        }
        catch (error) {
            if (failures.has(kind))
                return failures.get(kind)(api, event, Object.assign(next, { error: { kind: "throw", message: (error as Error).message } }));
            throw error;
        }
    };
    return { invoke, state, files, hooks };
}
describe("preservation-only normal-exit control", () => {
    it("forwards the original matching write once and records separate entry/forward/return", async () => {
        const { state, invoke, files } = sdk();
        state.release = nonce;
        const event = { path: target, text: "epoch" };
        assert.equal(await invoke("fs.write", event), event);
        assert.equal(state.calls, 1);
        assert.deepEqual(JSON.parse(files.get("entry.json")!), { nonce, origin: "workspaces-attention", tier: "user", targetKind: "epoch-request-upload", bytes: 5, sha256: sha("epoch"), forwardCount: 0 });
        assert.ok(files.has("forward.json") && files.has("returned.json"));
        await invoke("fs.write", event);
        assert.equal(state.calls, 1);
    });
    for (const condition of ["abort", "budget", "hold", "wrong nonce", "forward-marker failure"]) {
        it("refuses forwarding after " + condition, async () => {
            const { state, invoke, files } = sdk();
            state.release = condition === "wrong nonce" ? "b".repeat(32) : nonce;
            state.during = name => { if (name === "forward.json") {
                if (condition === "abort")
                    state.abort = true;
                if (condition === "budget")
                    state.remaining = 500;
                if (condition === "hold")
                    state.time = 7000;
            } };
            if (condition === "forward-marker failure")
                state.failMarker = "forward.json";
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
