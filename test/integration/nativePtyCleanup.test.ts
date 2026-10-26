import { verifyWindowsCommandScriptCleanup } from "../support/windowsCommandScriptPtyChild";

describe("native PTY cleanup in the extension host", () => {
  it("releases workers and sockets across repeated natural Windows session exits", async function () {
    if (process.platform !== "win32") {
      this.skip();
    }
    this.timeout(30_000);
    await verifyWindowsCommandScriptCleanup();
  });
});
