import { MemoryMemento } from "./memoryMemento";
import type { SavedComposerSession } from "../../src/composer/composerTypes";

export const composerFirstUuid = "11111111-1111-4111-8111-111111111111";
export const composerSecondUuid = "22222222-2222-4222-8222-222222222222";

/** A hand-authored session snapshot; callers choose revisions explicitly. */
export function composerSession(
  uuid = composerFirstUuid, text = "first draft", revision = 1
): SavedComposerSession {
  return {
    claudeSessionId: uuid, rootId: "root-one", rootPath: "I:/fixture", displayName: "Fixture",
    draft: { revision, text, selection: { anchor: 0, head: text.length } }, recent: []
  };
}

/** Controls only the external Memento write, retaining real serialization and copies. */
export class ComposerMemento extends MemoryMemento {
  failNext = false;
  private pause: { started: () => void; release: Promise<void> } | undefined;

  holdNextWrite(): { started: Promise<void>; release: () => void } {
    let started!: () => void;
    let release!: () => void;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    const releasePromise = new Promise<void>((resolve) => { release = resolve; });
    this.pause = { started, release: releasePromise };
    return { started: startedPromise, release };
  }

  override async update(key: string, value: unknown): Promise<void> {
    const pause = this.pause;
    this.pause = undefined;
    if (pause !== undefined) {
      pause.started();
      await pause.release;
    }
    if (this.failNext) {
      this.failNext = false;
      throw new Error("Controlled storage failure");
    }
    await super.update(key, value);
  }
}
