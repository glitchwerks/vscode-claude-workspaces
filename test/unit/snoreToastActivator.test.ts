import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createSnoreToastActivator } from "../../src/attention/snoreToastActivator";
import { createSnoreToastActivationRegistry } from "../../src/attention/snoreToastActivationServer";
import type { SnoreToastProcess } from "../../src/attention/snoreToastNotificationSink";

class NativeChild extends EventEmitter implements SnoreToastProcess {
  killed = false;
  killSucceeds = true;
  killCalls = 0;
  killError?: Error;
  unref(): void {}
  kill(): boolean {
    this.killCalls += 1;
    if (this.killError !== undefined) { this.emit("error", this.killError); }
    if (!this.killSucceeds) { return false; }
    this.killed = true;
    this.emit("exit", null, "SIGTERM");
    return true;
  }
}

class Clock {
  time = 0;
  private sequence = 0;
  readonly tasks = new Map<number, { at: number; callback: () => void }>();
  schedule = (callback: () => void, delay: number): { dispose(): void } => {
    const id = ++this.sequence;
    this.tasks.set(id, { at: this.time + delay, callback });
    return { dispose: () => { this.tasks.delete(id); } };
  };
  advance(ms: number): void {
    const until = this.time + ms;
    for (;;) {
      const next = [...this.tasks].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (next === undefined || next[1].at > until) { break; }
      this.time = next[1].at;
      this.tasks.delete(next[0]);
      next[1].callback();
    }
    this.time = until;
  }
}

function fixture() {
  const clock = new Clock();
  const children: NativeChild[] = [];
  const launches: string[][] = [];
  const failures: unknown[] = [];
  let pending = true;
  const activator = createSnoreToastActivator({
    executablePath: "signed-helper.exe",
    hasPendingNotifications: () => pending,
    now: () => clock.time,
    schedule: clock.schedule,
    launch: (executable, parameters) => {
      assert.equal(executable, "signed-helper.exe");
      launches.push([...parameters]);
      const child = new NativeChild();
      children.push(child);
      return child;
    },
    onError: (error) => failures.push(error)
  });
  return { activator, clock, children, launches, failures,
    setPending: (value: boolean) => { pending = value; } };
}

describe("SnoreToast resident activation", () => {
  it("retains ownership when failed termination emits a synchronous error", () => {
    const f = fixture();
    f.activator.ensureRunning();
    const first = f.children[0]!;
    first.killSucceeds = false;
    first.killError = Object.assign(new Error("permission denied"), { syscall: "kill", code: "EPERM" });
    f.clock.advance(27_000);
    assert.equal(first.killed, false);
    f.activator.dispose();
    assert.equal(first.killCalls, 2);
    assert.equal(first.killed, false);
    first.killError = undefined;
    first.killSucceeds = true;
    f.activator.dispose();
    assert.equal(first.killCalls, 3);
    assert.ok(f.children.every((child) => child.killed));
    assert.equal(f.failures.length, 2);
    assert.equal(f.clock.tasks.size, 0);
  });

  it("retains a worker after failed retirement and retries termination on disposal", () => {
    const f = fixture();
    f.activator.ensureRunning();
    const first = f.children[0]!;
    first.killSucceeds = false;
    f.clock.advance(27_000);
    assert.equal(first.killCalls, 1);
    assert.equal(first.killed, false);
    assert.equal(f.failures.length, 1);
    first.killSucceeds = true;
    f.activator.dispose();
    assert.equal(first.killCalls, 2);
    assert.ok(f.children.every((child) => child.killed));
    assert.equal(f.clock.tasks.size, 0);
  });

  it("keeps a second registered helper available when a click ends the first", () => {
    const f = fixture();
    try {
      f.activator.ensureRunning();
      assert.deepEqual(f.launches, [["-Embedding"], ["-Embedding"]]);
      f.clock.advance(2_000);
      f.children[0]!.emit("exit", 0, null);
      assert.equal(f.children[1]!.killed, false);
      f.clock.advance(1_000);
      assert.equal(f.children.length, 3);
    } finally { f.activator.dispose(); }
  });

  it("overlaps renewal before the pinned helper's one-minute deadline", () => {
    const f = fixture();
    try {
      f.activator.ensureRunning();
      f.clock.advance(25_000);
      assert.equal(f.children.length, 3);
      assert.equal(f.children[0]!.killed, false);
      f.clock.advance(2_000);
      assert.equal(f.children[0]!.killed, true);
      assert.equal(f.children[1]!.killed, false);
      f.clock.advance(23_000);
      assert.equal(f.children.length, 4);
      f.clock.advance(2_000);
      assert.equal(f.children[1]!.killed, true);
      assert.equal(f.children[2]!.killed, false);
      assert.equal(f.children[3]!.killed, false);
    } finally { f.activator.dispose(); }
  });

  it("stops owned helpers and all renewal work when callbacks no longer remain", () => {
    const f = fixture();
    f.activator.ensureRunning();
    f.setPending(false);
    f.clock.advance(25_000);
    assert.equal(f.children.length, 2);
    assert.ok(f.children.every((child) => child.killed));
    assert.equal(f.clock.tasks.size, 0);
    f.setPending(true);
    f.activator.ensureRunning();
    assert.equal(f.children.length, 4);
    f.activator.dispose();
  });

  it("immediately releases helpers when a lifecycle update cancels the last registration", () => {
    const f = fixture();
    try {
      f.activator.ensureRunning();
      f.clock.advance(25_000);
      assert.equal(f.children.length, 3, "exercise the overlapping renewal worker too");
      f.setPending(false);
      f.activator.ensureRunning();
      assert.ok(f.children.every((child) => child.killed));
      assert.equal(f.clock.tasks.size, 0);
      f.clock.advance(7 * 24 * 60 * 60 * 1_000);
      assert.equal(f.children.length, 3, "closed sessions must not renew for the correlation TTL");
      f.setPending(true);
      f.activator.ensureRunning();
      assert.equal(f.children.length, 5, "a future live notification can restart the pool");
    } finally { f.activator.dispose(); }
  });

  it("keeps renewing for another live session after a closed session is pruned", () => {
    const clock = new Clock();
    const liveSessions = new Set(["closed-session", "live-session"]);
    const registry = createSnoreToastActivationRegistry({
      now: () => clock.time,
      isSessionLive: (sessionId) => liveSessions.has(sessionId)
    });
    const children: NativeChild[] = [];
    const activator = createSnoreToastActivator({
      executablePath: "signed-helper.exe", hasPendingNotifications: registry.hasPendingNotifications,
      now: () => clock.time, schedule: clock.schedule,
      launch: () => {
        const child = new NativeChild();
        children.push(child);
        return child;
      }
    });
    try {
      registry.register("closed-toast", "closed-session");
      registry.register("live-toast", "live-session");
      activator.ensureRunning();
      liveSessions.delete("closed-session");
      activator.ensureRunning();
      assert.ok(children.every((child) => !child.killed));
      clock.advance(65_000);
      assert.equal(children.length, 4, "another live registration must retain renewal beyond one helper lifetime");
      registry.accept(Buffer.from("action=clicked;notificationId=live-toast;", "utf16le"));
      activator.ensureRunning();
      assert.ok(children.every((child) => child.killed));
      assert.equal(clock.tasks.size, 0);
    } finally {
      activator.dispose();
      registry.dispose();
    }
  });

  it("does not launch when unused or after disposal, including during overlap", () => {
    const f = fixture();
    f.setPending(false);
    f.activator.ensureRunning();
    assert.equal(f.children.length, 0);
    f.setPending(true);
    f.activator.ensureRunning();
    f.activator.ensureRunning();
    f.clock.advance(25_000);
    assert.equal(f.children.length, 3);
    f.activator.dispose();
    f.activator.dispose();
    assert.ok(f.children.every((child) => child.killed));
    assert.equal(f.clock.tasks.size, 0);
    f.activator.ensureRunning();
    f.clock.advance(120_000);
    assert.equal(f.children.length, 3);
  });

  it("bounds retries and reports an error/exit pair only once", () => {
    const f = fixture();
    try {
      f.activator.ensureRunning();
      assert.equal(f.children.length, 2);
      const error = new Error("native launch rejected");
      f.children[0]!.emit("error", error);
      f.children[0]!.emit("exit", -1, null);
      assert.deepEqual(f.failures, [error]);
      f.clock.advance(999);
      assert.equal(f.children.length, 2);
      f.clock.advance(1);
      assert.equal(f.children.length, 3);
      assert.equal(f.children[1]!.killed, false);
    } finally { f.activator.dispose(); }
  });

  it("retains the old registration when a replacement fails during overlap", () => {
    const f = fixture();
    try {
      f.activator.ensureRunning();
      f.clock.advance(25_000);
      f.children[2]!.emit("error", new Error("replacement blocked"));
      f.clock.advance(2_000);
      assert.equal(f.children[0]!.killed, false);
      assert.equal(f.children[1]!.killed, false);
      assert.equal(f.children.length, 4);
      f.clock.advance(1_000);
      assert.equal(f.children[0]!.killed, true);
      assert.equal(f.children[3]!.killed, false);
    } finally { f.activator.dispose(); }
  });

  it("handles synchronous launch rejection without spinning or leaking scheduled work", () => {
    const clock = new Clock();
    let launches = 0;
    const activator = createSnoreToastActivator({
      executablePath: "blocked.exe", hasPendingNotifications: () => true,
      now: () => clock.time, schedule: clock.schedule,
      launch: () => { launches += 1; throw new Error("blocked"); },
      onError: () => { throw new Error("diagnostics also failed"); }
    });
    activator.ensureRunning();
    assert.equal(launches, 2);
    clock.advance(999);
    assert.equal(launches, 2);
    clock.advance(1);
    assert.equal(launches, 4);
    activator.dispose();
    assert.equal(clock.tasks.size, 0);
  });
});
