import assert from "node:assert/strict";

import { ComposerStore } from "../../src/composer/composerStore";
import { COMPOSER_STATE_KEY } from "../../src/composer/composerTypes";
import { ComposerMemento, composerFirstUuid as first, composerSecondUuid as second, composerSession } from "../support/composerHarness";

describe("composer persistence", () => {
  it("restores drafts by Claude UUID across new store instances", async () => {
    const state = new ComposerMemento();
    await state.update("claudeWorkspaces.resumableSessions", { original: true });
    const store = new ComposerStore(state);
    await store.saveDraft(composerSession(first, "first", 1));
    await store.saveDraft(composerSession(second, "second", 7));
    const restored = new ComposerStore(state);
    assert.deepEqual(restored.get(first)?.draft, { revision: 1, text: "first", selection: { anchor: 0, head: 5 } });
    assert.equal(restored.get(second)?.draft.text, "second");
    assert.deepEqual(state.get("claudeWorkspaces.resumableSessions"), { original: true });
    assert.ok(Object.isFrozen(restored.get(first)?.draft.selection));
  });

  it("failed writes never report saved", async () => {
    const state = new ComposerMemento();
    const store = new ComposerStore(state);
    state.failNext = true;
    assert.equal(await store.saveDraft(composerSession()), "failed");
    assert.equal(store.get(first), undefined);
    assert.equal(new ComposerStore(state).get(first), undefined);
    assert.equal(await store.saveDraft(composerSession()), "saved");
  });

  it("late writes cannot resurrect a forgotten UUID", async () => {
    const state = new ComposerMemento();
    const store = new ComposerStore(state);
    const hold = state.holdNextWrite();
    const saving = store.saveDraft(composerSession());
    await hold.started;
    const forgetting = store.forget(first);
    const late = store.saveDraft(composerSession(first, "late", 9));
    hold.release();
    assert.equal(await saving, "forgotten");
    await forgetting;
    assert.equal(await late, "forgotten");
    assert.equal(new ComposerStore(state).get(first), undefined);
    assert.equal(await new ComposerStore(state).saveDraft(composerSession()), "forgotten");
  });

  it("older revisions cannot replace newer drafts", async () => {
    const store = new ComposerStore(new ComposerMemento());
    const newer = store.saveDraft(composerSession(first, "newer draft", 2));
    const older = store.saveDraft(composerSession(first, "old", 1));
    assert.equal(await newer, "saved");
    assert.equal(await older, "stale");
    assert.equal(await store.saveDraft(composerSession(first, "conflicting same revision", 2)), "stale");
    assert.equal(store.get(first)?.draft.text, "newer draft");
  });

  it("draft-only transfer preserves source until destination persists", async () => {
    const state = new ComposerMemento();
    const store = new ComposerStore(state);
    await store.saveDraft(composerSession());
    state.failNext = true;
    await assert.rejects(store.transferDraft(first, composerSession(second)), /storage/i);
    assert.equal(store.get(first)?.draft.text, "first draft");
    assert.equal(store.get(second), undefined);
    const hold = state.holdNextWrite();
    const transfer = store.transferDraft(first, composerSession(second));
    await hold.started;
    assert.equal(store.get(first)?.draft.text, "first draft");
    hold.release();
    await transfer;
    const restored = new ComposerStore(state);
    assert.equal(restored.get(first), undefined);
    assert.equal(restored.get(second)?.draft.text, "first draft");
    assert.equal(await restored.saveDraft(composerSession()), "forgotten");
  });

  it("recent history is accepted-composer-only and bounded", async () => {
    const state = new ComposerMemento();
    const store = new ComposerStore(state);
    await store.saveDraft(composerSession());
    assert.deepEqual(store.get(first)?.recent, []);
    for (let i = 1; i <= 23; i++) {
      await store.recordAccepted(first, `00000000-0000-4000-8000-${String(i).padStart(12,"0")}`, `message ${i}`);
    }
    await store.recordAccepted(first, "00000000-0000-4000-8000-000000000023", "duplicate");
    await store.saveDraft(composerSession(first, "next draft", 2));
    const recent = new ComposerStore(state).get(first)?.recent;
    assert.equal(recent?.length, 20);
    assert.equal(recent?.[0], "message 4");
    assert.equal(recent?.[19], "message 23");
    await store.forget(first);
    assert.equal(new ComposerStore(state).get(first), undefined);
  });

  it("persists workspace split and favorites without claiming failed writes", async () => {
    const state = new ComposerMemento();
    const store = new ComposerStore(state);
    await store.setLayout({ splitRatio: 0.4 });
    await store.setFavorite("/fixture:review", true);
    await store.setFavorite("/fixture:review", true);
    const restored = new ComposerStore(state);
    assert.deepEqual(restored.getLayout(), { splitRatio: 0.4 });
    assert.deepEqual(restored.favorites, ["/fixture:review"]);
    for (const splitRatio of [NaN, Infinity, 0.14, 0.76]) {
      await assert.rejects(store.setLayout({ splitRatio }), /layout/i);
    }
    state.failNext = true;
    await assert.rejects(store.setLayout({ splitRatio: 0.5 }));
    assert.equal(store.getLayout().splitRatio, 0.4);
    await store.setFavorite("/fixture:review", false);
    assert.deepEqual(new ComposerStore(state).favorites, []);
  });

  it("enumerates immutable text-free recovery pages and rejects stale cursors", async () => {
    const state = new ComposerMemento();
    const sessions = Array.from({length: 103}, (_, index) => composerSession(`00000000-0000-4000-8000-${String(index).padStart(12,"0")}`));
    await state.update(COMPOSER_STATE_KEY, { schemaVersion: 1, sessions, favorites: [], layout: {splitRatio: 0.3}, forgotten: [], accepted: {} });
    const store = new ComposerStore(state);
    let changes = 0;
    const subscription = store.onDidChangeRecovery(() => { changes++; });
    const page = store.recoveryPage();
    assert.equal(page.rows.length, 100);
    assert.ok(Object.isFrozen(page.rows[0]));
    assert.deepEqual(Object.keys(page.rows[0]!).sort(), ["claudeSessionId","displayName","draftRevision","rootId","rootPath"]);
    assert.equal(store.recoveryPage(page.nextCursor).rows.length, 3);
    await store.forget(sessions[0]!.claudeSessionId);
    assert.equal(changes, 1);
    assert.throws(() => store.recoveryPage(page.nextCursor), /stale/i);
    assert.equal(store.recoveryPage().rows.length, 100);
    assert.equal(store.recoveryPage(store.recoveryPage().nextCursor).rows.length, 2);
    state.failNext = true;
    assert.equal(await store.saveDraft(composerSession()), "failed");
    assert.equal(changes, 2);
    const failedPage = store.recoveryPage(store.recoveryPage().nextCursor);
    assert.equal(failedPage.rows.find(row => row.claudeSessionId === first)?.storageStatus, "error");
    await store.saveDraft(composerSession());
    assert.equal(changes, 3);
    subscription.dispose();
  });

  it("keeps failed drafts discoverable in memory without claiming durable storage", async () => {
    const state = new ComposerMemento();
    const store = new ComposerStore(state);
    state.failNext = true;
    assert.equal(await store.saveDraft(composerSession()), "failed");
    assert.equal(store.get(first), undefined);
    assert.equal(store.getRecoverable(first)?.draft.text, "first draft");
    assert.equal(store.recoveryPage().rows[0]?.storageStatus, "error");
    assert.equal(new ComposerStore(state).getRecoverable(first), undefined);
    await store.saveDraft(composerSession(first, "newer", 2));
    assert.equal(store.getRecoverable(first)?.draft.text, "newer");
    assert.equal(store.recoveryPage().rows[0]?.storageStatus, undefined);
    state.failNext = true;
    await store.saveDraft(composerSession(first, "latest", 3));
    await store.forget(first);
    assert.equal(store.getRecoverable(first), undefined);
    assert.deepEqual(store.recoveryPage().rows, []);
  });
  it("keeps newly accepted history visible alongside a failed newer draft",async()=>{
    const state=new ComposerMemento();const store=new ComposerStore(state);await store.saveDraft(composerSession());
    state.failNext=true;await store.saveDraft(composerSession(first,"failed newer draft",2));
    await store.recordAccepted(first,second,"accepted composer prompt");
    assert.equal(store.getRecoverable(first)?.draft.text,"failed newer draft");
    assert.deepEqual(store.getRecoverable(first)?.recent,["accepted composer prompt"]);
    assert.equal(Object.isFrozen(store.getRecoverable(first)),true);
  });

  it("pins Restore draft to the source revision when the queued transfer executes", async () => {
    const state = new ComposerMemento();
    const store = new ComposerStore(state);
    await store.saveDraft(composerSession());
    const hold = state.holdNextWrite();
    const saving = store.saveDraft(composerSession(first, "newer", 2));
    await hold.started;
    const transfer = store.transferDraft(first, composerSession(second), 1);
    const rejected = assert.rejects(transfer, /revision/i);
    hold.release();
    await saving;
    await rejected;
    assert.equal(store.get(first)?.draft.text, "newer");
    assert.equal(store.get(second), undefined);
  });

  it("keeps valid recoverable records when a neighboring record is corrupt", async () => {
    const state = new ComposerMemento();
    await state.update(COMPOSER_STATE_KEY, { schemaVersion: 1, sessions: [composerSession(), {claudeSessionId: second, draft: {text: "recoverable raw text"}}], favorites: [], forgotten: [], accepted: {}, layout: {splitRatio: NaN} });
    const store = new ComposerStore(state);
    assert.equal(store.get(first)?.draft.text, "first draft");
    assert.equal(store.get(second), undefined);
    await store.setFavorite("/compact", true);
    assert.match(JSON.stringify(state.get(COMPOSER_STATE_KEY)), /recoverable raw text/);
    assert.equal(new ComposerStore(state).get(first)?.draft.text, "first draft");
    await store.forget(second);
    assert.doesNotMatch(JSON.stringify(state.get(COMPOSER_STATE_KEY)), /recoverable raw text/);
  });

  it("does not publish a transferred draft when Forget arrives during its write", async () => {
    const state = new ComposerMemento();
    const store = new ComposerStore(state);
    await store.saveDraft(composerSession());
    const hold = state.holdNextWrite();
    const transfer = store.transferDraft(first, composerSession(second));
    const rejected = assert.rejects(transfer, /forgotten/i);
    await hold.started;
    const forgetting = store.forget(first);
    hold.release();
    await rejected;
    await forgetting;
    assert.equal(store.get(first), undefined);
    assert.equal(store.get(second), undefined);
    assert.equal(new ComposerStore(state).get(second), undefined);
  });

  it("bounds drafts by UTF-8 bytes and keeps the original text intact", async () => {
    const state = new ComposerMemento();
    const store = new ComposerStore(state);
    const text = "😀".repeat(262144);
    assert.equal(await store.saveDraft(composerSession(first, text, 1)), "saved");
    assert.equal(await store.saveDraft(composerSession(first, text + "😀", 2)), "too-large");
    assert.equal(new ComposerStore(state).get(first)?.draft.text, text);
  });

  it("validates UTF-16 selections without splitting surrogate pairs", async () => {
    const store = new ComposerStore(new ComposerMemento());
    const session = composerSession(first, "A😀Z");
    assert.equal(await store.saveDraft({ ...session, draft: { ...session.draft, selection: {anchor: 3, head: 1} } }), "saved");
    assert.deepEqual(store.get(first)?.draft.selection, {anchor: 3, head: 1});
    for (const head of [2, -1, 5, 1.5, NaN, Infinity]) {
      assert.equal(await store.saveDraft({ ...session, draft: { ...session.draft, revision: 2, selection: {anchor: 0, head} } }), "failed");
    }
    assert.equal(store.get(first)?.draft.revision, 1);
  });

  it("evicts whole history entries by bytes and deduplicates across restart", async () => {
    const state = new ComposerMemento();
    const store = new ComposerStore(state);
    await store.saveDraft({...composerSession(), recent: ["forged history"]});
    assert.deepEqual(store.get(first)?.recent, []);
    const id = "00000000-0000-4000-8000-000000000001";
    await store.recordAccepted(first, id, "é".repeat(80000));
    await store.recordAccepted(first, "00000000-0000-4000-8000-000000000002", "終".repeat(60000));
    const restored = new ComposerStore(state);
    await restored.recordAccepted(first, id, "duplicate after eviction");
    await restored.recordAccepted(first, "00000000-0000-4000-8000-000000000003", "x".repeat(262145));
    assert.deepEqual(restored.get(first)?.recent, ["終".repeat(60000)]);
    assert.equal(restored.get(first)?.draft.text, "first draft");
  });

  it("preserves a future schema and refuses to overwrite it", async () => {
    const state = new ComposerMemento();
    const future = {schemaVersion: 2, sessions: [composerSession()], extra: "future data"};
    await state.update(COMPOSER_STATE_KEY, future);
    const store = new ComposerStore(state);
    assert.equal(await store.saveDraft(composerSession()), "failed");
    await assert.rejects(store.setFavorite("/compact", true));
    assert.deepEqual(state.get(COMPOSER_STATE_KEY), future);
  });

  it("does not expose unknown persisted selection metadata in a recoverable draft", async () => {
    const state=new ComposerMemento();
    const saved=composerSession();
    await state.update(COMPOSER_STATE_KEY,{schemaVersion:1,sessions:[{...saved,draft:{...saved.draft,selection:{anchor:0,head:11,privateMetadata:"unrecognized"}}}]});
    const store=new ComposerStore(state);
    assert.deepEqual(store.get(first)?.draft.selection,{anchor:0,head:11});
    assert.equal(store.get(first)?.draft.text,"first draft");
  });
});
