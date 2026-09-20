import assert from "node:assert/strict";

import {
  createAttentionNotificationCoordinator,
  type AttentionNotificationRequest
} from "../../src/attention/attentionNotificationCoordinator";
import type { ManagedSessionSnapshot } from "../../src/sessions/sessionTypes";

function session(): ManagedSessionSnapshot {
  return {
    id: "managed-session-1",
    claudeSessionId: "claude-session-1",
    rootId: "alpha",
    displayName: "Fix the build",
    ordinalWithinRoot: 1,
    state: "running",
    activity: "waiting",
    launchedImportIds: [],
    launchedAddDirPaths: [],
    launchedRootLabel: "API",
    launchedRootPath: "C:\\projects\\api",
    launchedAt: 1
  };
}

describe("attention notification coordination", () => {
  it("notifies an unfocused window when a waiting stage opens", () => {
    // Dropping the opened branch would leave background sessions waiting silently.
    const notifications: AttentionNotificationRequest[] = [];
    const coordinate = createAttentionNotificationCoordinator({
      sessions: () => [session()],
      isWindowFocused: () => false,
      notify: (notification) => notifications.push(notification)
    });

    coordinate({
      kind: "opened",
      sessionId: "managed-session-1",
      signal: {
        schemaVersion: 1,
        managedSessionId: "managed-session-1",
        claudeSessionId: "claude-session-1",
        hookEventName: "Notification",
        notificationType: "permission_prompt",
        createdAt: "2026-09-20T12:00:00.000Z"
      }
    });

    assert.deepEqual(notifications, [{
      sessionId: "managed-session-1",
      workspaceLabel: "API",
      sessionName: "Fix the build"
    }]);
  });

  it("suppresses a stage opened while focused without firing later on blur", () => {
    // Replaying an update after focus changes would interrupt work for a stage already seen in-window.
    const notifications: AttentionNotificationRequest[] = [];
    let focused = true;
    const coordinate = createAttentionNotificationCoordinator({
      sessions: () => [session()],
      isWindowFocused: () => focused,
      notify: (notification) => notifications.push(notification)
    });
    const signal = {
      schemaVersion: 1 as const,
      managedSessionId: "managed-session-1",
      claudeSessionId: "claude-session-1",
      hookEventName: "Notification",
      notificationType: "permission_prompt",
      createdAt: "2026-09-20T12:00:00.000Z"
    };

    coordinate({ kind: "opened", sessionId: "managed-session-1", signal });
    focused = false;
    coordinate({ kind: "updated", sessionId: "managed-session-1", signal });

    assert.deepEqual(notifications, []);
  });

  it("resolves session identity at the moment the stage opens", () => {
    // Capturing the activation-time array would miss every session launched later.
    const notifications: AttentionNotificationRequest[] = [];
    let sessions: readonly ManagedSessionSnapshot[] = [];
    const coordinate = createAttentionNotificationCoordinator({
      sessions: () => sessions,
      isWindowFocused: () => false,
      notify: (notification) => notifications.push(notification)
    });
    sessions = [session()];

    coordinate({
      kind: "opened",
      sessionId: "managed-session-1",
      signal: {
        schemaVersion: 1,
        managedSessionId: "managed-session-1",
        claudeSessionId: "claude-session-1",
        hookEventName: "Notification",
        notificationType: "permission_prompt",
        createdAt: "2026-09-20T12:00:00.000Z"
      }
    });

    assert.equal(notifications.length, 1);
  });

  it("reports a notification failure without throwing into signal processing", () => {
    // A native notification failure must not block the session activity transition.
    const failure = new Error("toast unavailable");
    const failures: unknown[] = [];
    const coordinate = createAttentionNotificationCoordinator({
      sessions: () => [session()],
      isWindowFocused: () => false,
      notify: () => {
        throw failure;
      },
      onError: (error) => failures.push(error)
    });

    assert.doesNotThrow(() => coordinate({
      kind: "opened",
      sessionId: "managed-session-1",
      signal: {
        schemaVersion: 1,
        managedSessionId: "managed-session-1",
        claudeSessionId: "claude-session-1",
        hookEventName: "Notification",
        notificationType: "permission_prompt",
        createdAt: "2026-09-20T12:00:00.000Z"
      }
    }));
    assert.deepEqual(failures, [failure]);
  });
});
