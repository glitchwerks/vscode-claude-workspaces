import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";

const loadModule = createRequire(__filename);
const { patchNodePty } = loadModule(path.resolve("scripts/patch-node-pty.js")) as {
  patchNodePty(directory?: string): void;
};
const dependencyDirectory = path.dirname(loadModule.resolve("node-pty/package.json"));

describe("pinned Windows PTY cleanup patch", () => {
  it("is idempotent on the installed dependency", () => {
    const agentPath = path.join(dependencyDirectory, "lib/windowsPtyAgent.js");
    const workerPath = path.join(dependencyDirectory, "lib/worker/conoutSocketWorker.js");
    const before = [fs.readFileSync(agentPath), fs.readFileSync(workerPath)];
    patchNodePty();
    assert.deepEqual([fs.readFileSync(agentPath), fs.readFileSync(workerPath)], before);
  });

  it("rejects upgrades until the compatibility patch is revalidated", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pty-patch-"));
    try {
      fs.writeFileSync(path.join(directory, "package.json"), '{"version":"1.2.0"}');
      assert.throws(() => patchNodePty(directory), /Revalidate or remove/);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects unexpected source without changing either file", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pty-patch-"));
    try {
      fs.cpSync(dependencyDirectory, directory, { recursive: true });
      const agentPath = path.join(directory, "lib/windowsPtyAgent.js");
      const workerPath = path.join(directory, "lib/worker/conoutSocketWorker.js");
      fs.appendFileSync(workerPath, "\n// Unexpected dependency content\n");
      const before = [fs.readFileSync(agentPath), fs.readFileSync(workerPath)];
      assert.throws(() => patchNodePty(directory), /Unexpected node-pty source/);
      assert.deepEqual([fs.readFileSync(agentPath), fs.readFileSync(workerPath)], before);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  for (const code of ["EPIPE", "ECONNRESET", "EACCES"]) {
    it(`${code === "EACCES" ? "surfaces unexpected" : "handles expected"} worker socket error ${code}`, () => {
      let receiveConnection: ((socket: unknown) => void) | undefined;
      let receiveError: ((error: NodeJS.ErrnoException) => void) | undefined;
      let unpiped = false;
      let destroyed = false;
      class SourceSocket {
        setEncoding(): void {}
        connect(_pipe: string, connected: () => void): void { connected(); }
        pipe(): void {}
        unpipe(): void { unpiped = true; }
      }
      vm.runInNewContext(fs.readFileSync(
        path.join(dependencyDirectory, "lib/worker/conoutSocketWorker.js"), "utf8"
      ), {
        exports: {},
        require: (name: string): unknown => {
          if (name === "worker_threads") {
            return { workerData: { conoutPipeName: "test-pipe" }, parentPort: { postMessage() {} } };
          }
          if (name === "net") {
            return {
              Socket: SourceSocket,
              createServer: (listener: (socket: unknown) => void) => {
                receiveConnection = listener;
                return { listen() {} };
              }
            };
          }
          if (name === "../shared/conout") {
            return { getWorkerPipeName: (pipe: string) => pipe };
          }
          throw new Error(`Unexpected module ${name}`);
        }
      });
      assert.ok(receiveConnection);
      receiveConnection({
        on: (event: string, listener: (error: NodeJS.ErrnoException) => void) => {
          assert.equal(event, "error");
          receiveError = listener;
        },
        destroy: () => { destroyed = true; }
      });
      assert.ok(receiveError, "Worker destination must handle disconnects");
      const error = Object.assign(new Error(code), { code });
      if (code === "EACCES") {
        assert.throws(() => receiveError?.(error), (thrown) => thrown === error);
        assert.equal(destroyed, false);
      } else {
        receiveError(error);
        assert.equal(unpiped, true);
        assert.equal(destroyed, true);
      }
    });
  }
});
