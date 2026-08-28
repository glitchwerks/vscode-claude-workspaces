import assert from "node:assert/strict";

import { FakeManagedPty } from "../support/fakeManagedPty";

describe("FakeManagedPty", () => {
  it("allows termination to be retried after its configured one-shot failure", async () => {
    // A fake that keeps throwing the same configured failure must fail this test.
    const pty = new FakeManagedPty();
    pty.terminateError = new Error("kill failed");

    await assert.rejects(pty.terminate(), /kill failed/);
    await pty.terminate();

    assert.equal(pty.terminated, true);
  });

  it("disposes through termination while swallowing a termination failure", async () => {
    // A fake whose disposal skips the production termination path must fail this test.
    const pty = new FakeManagedPty();
    pty.terminateError = new Error("kill failed");
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown): void => {
      unhandledRejections.push(reason);
    };
    process.on("unhandledRejection", onUnhandledRejection);

    try {
      pty.dispose();
      await new Promise<void>((resolve) => setImmediate(resolve));

      assert.equal(pty.disposed, true);
      assert.equal(pty.terminateError, undefined);
      assert.deepEqual(unhandledRejections, []);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });
});
