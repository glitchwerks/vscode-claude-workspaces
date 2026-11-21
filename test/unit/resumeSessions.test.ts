import assert from "node:assert/strict";
import type { ResumableSessionSnapshot } from "../../src/sessions/resumableSessionStore";
import { filterResumableSessions } from "../../src/panel/webview/resumeSessions";

const saved: ResumableSessionSnapshot = {
  claudeSessionId: "11111111-1111-4111-8111-111111111111",
  displayName: "Migration handoff",
  rootId: "file:///alpha",
  rootLabel: "Infra",
  rootPath: "C:\\Work Trees\\Übersicht",
  createdAt: "2026-04-01T10:00:00Z",
  lastLaunchedAt: "2026-04-02T10:00:00Z"
};

describe("resume session search", () => {
  it("filters duplicate session names by literal launch path", () => {
    const sibling = { ...saved, claudeSessionId: "22222222-2222-4222-8222-222222222222",
      rootId: "file:///other", rootPath: "D:/Archive" };
    assert.deepEqual(filterResumableSessions([sibling, saved], " c:/work trees/übersicht "), [saved]);
    assert.deepEqual(filterResumableSessions([sibling, saved], "infra"), [saved, sibling]);
    assert.deepEqual(filterResumableSessions([sibling, saved], "MIGRATION"), [saved, sibling]);
  });

  it("keeps 250 saved sessions searchable in last-opened order", () => {
    const history = Array.from({ length: 250 }, (_, index) => ({
      ...saved,
      claudeSessionId: "11111111-1111-4111-8111-" + String(index).padStart(12, "0"),
      displayName: index === 249 ? "Older handoff" : "Current work",
      lastLaunchedAt: new Date(Date.UTC(2026, 3, 250 - index)).toISOString()
    })).reverse();
    const all = filterResumableSessions(history, "");
    assert.equal(all.length, 250);
    assert.equal(all[0]?.claudeSessionId, "11111111-1111-4111-8111-000000000000");
    assert.equal(all.at(-1)?.displayName, "Older handoff");
    assert.deepEqual(filterResumableSessions(history, "older"), [history[0]]);
  });
});
