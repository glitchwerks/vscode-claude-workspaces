import assert from "node:assert/strict";

import { MemoryMemento } from "../support/memoryMemento";

describe("MemoryMemento", () => {
  it("round-trips non-undefined writes through JSON serialization", async () => {
    const memento = new MemoryMemento();
    const value = {
      nested: { name: "persisted", omitted: undefined },
      sessions: ["first"]
    };

    await memento.update("state", value);
    value.nested.name = "mutated";
    value.sessions.push("second");

    assert.deepEqual(memento.get("state"), {
      nested: { name: "persisted" },
      sessions: ["first"]
    });
  });
});
