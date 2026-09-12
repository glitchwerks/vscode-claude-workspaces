import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { JSDOM } from "jsdom";

import {
  createSessionRenderer,
  resolveTheme,
  type RendererTerminal,
  type RendererTerminalFactory,
  type RendererWindow
} from "../../src/panel/webview/renderer";
import type { TerminalFontMetrics, WebviewMessage } from "../../src/panel/protocol";
import type { ManagedSessionSnapshot } from "../../src/sessions/sessionTypes";

describe("session webview renderer", () => {
  const rendererDocumentId = "11111111-1111-4111-8111-111111111111";
  const terminalFont: TerminalFontMetrics = {
    fontFamily: "Cascadia Mono, monospace",
    fontSize: 14,
    letterSpacing: 1,
    lineHeight: 1.1
  };

  it("scopes its ready handshake to the renderer document", () => {
    const harness = createRendererHarness(false, "Win32", {
      documentId: rendererDocumentId
    });

    assert.deepEqual(harness.messages, [{ type: "ready", documentId: rendererDocumentId }]);
  });

  it("renders resumable-only sessions newest first as accessible labeled buttons without terminals", () => {
    const harness = createRendererHarness(true, "Win32", {
      formatDateTime: (date) => date.toISOString()
    });
    const older = {
      claudeSessionId: "11111111-1111-4111-8111-111111111111",
      displayName: "<Saved session>", rootId: "file:///alpha", rootLabel: "Alpha",
      rootPath: "C:/alpha", createdAt: "2026-09-01T10:00:00.000Z",
      lastLaunchedAt: "2026-09-02T10:00:00.000Z"
    };
    const newer = { ...older, claudeSessionId: "22222222-2222-4222-8222-222222222222",
      displayName: "Recent session", lastLaunchedAt: "2026-09-03T10:00:00.000Z" };
    harness.renderer.handleMessage({ type: "hydrate", sessions: [],
      activeSessionId: undefined, terminalFont, resumableSessions: [older, newer] });

    const region = harness.document.querySelector<HTMLElement>('section[aria-labelledby="resume-sessions-heading"]');
    assert.ok(region, "a separate named resume landmark is present");
    assert.equal(region.querySelector("h2")?.textContent, "Resume sessions");
    assert.ok(region.querySelector("ul"));
    const buttons = [...region.querySelectorAll<HTMLButtonElement>("li button")];
    assert.deepEqual(buttons.map((button) => button.getAttribute("aria-label")), [
      `Resume Recent session in Alpha, session ${newer.claudeSessionId}. Last opened ${newer.lastLaunchedAt}.`,
      `Resume <Saved session> in Alpha, session ${older.claudeSessionId}. Last opened ${older.lastLaunchedAt}.`
    ]);
    assert.deepEqual(buttons.map((button) => button.querySelector(".resume-session-name")?.textContent),
      ["Recent session", "<Saved session>"]);
    assert.equal(buttons[1]?.querySelector(".resume-session-root")?.textContent, "Alpha · C:/alpha");
    assert.equal(buttons[1]?.querySelector(".resume-session-path")?.textContent, "C:/alpha");
    assert.equal(region.querySelector("saved"), null, "names remain literal text");
    buttons[1]!.focus();
    assert.equal(harness.document.activeElement, buttons[1]);
    buttons[1]!.querySelector<HTMLElement>(".resume-session-path")!.click();
    assert.deepEqual(harness.messages, [{ type: "ready" },
      { type: "resumeSession", claudeSessionId: "11111111-1111-4111-8111-111111111111" }]);
    assert.equal(harness.terminals.length, 0);
    assert.equal(harness.stage.querySelectorAll(".terminal-instance").length, 0);
    assert.equal(harness.document.defaultView!.getComputedStyle(
      buttons[0]!.querySelector(".resume-session-name")!
    ).textOverflow, "ellipsis");
    harness.document.querySelector<HTMLButtonElement>("[data-sidebar-toggle]")!.click();
    assert.equal(harness.document.defaultView!.getComputedStyle(region).display, "none");
  });

  it("renders concise relative launch ages with exact local timestamps", () => {
    const now = Date.parse("2026-09-10T12:00:00.000Z");
    const harness = createRendererHarness(false, "Win32", {
      now: () => now,
      formatDateTime: (date) => `Local ${date.toISOString()}`
    });
    const launches = [
      ["11111111-1111-4111-8111-111111111111", "2026-09-10T12:05:00.000Z", "Last opened just now"],
      ["22222222-2222-4222-8222-222222222222", "2026-09-10T11:59:30.000Z", "Last opened just now"],
      ["33333333-3333-4333-8333-333333333333", "2026-09-10T11:58:00.000Z", "Last opened 2 minutes ago"],
      ["44444444-4444-4444-8444-444444444444", "2026-09-10T09:00:00.000Z", "Last opened 3 hours ago"],
      ["55555555-5555-4555-8555-555555555555", "2026-09-06T12:00:00.000Z", "Last opened 4 days ago"]
    ] as const;
    harness.renderer.handleMessage({
      type: "hydrate",
      sessions: [],
      activeSessionId: undefined,
      terminalFont,
      resumableSessions: launches.map(([claudeSessionId, lastLaunchedAt]) => ({
        claudeSessionId,
        displayName: "Saved session",
        rootId: "file:///alpha",
        rootLabel: "Alpha",
        rootPath: "C:/alpha",
        createdAt: "2026-09-01T10:00:00.000Z",
        lastLaunchedAt
      }))
    });

    for (const [claudeSessionId, lastLaunchedAt, relativeText] of launches) {
      const button = harness.document.querySelector<HTMLButtonElement>(
        `button[data-resume-session-id="${claudeSessionId}"]`
      );
      assert.ok(button, `resume row is visible for ${claudeSessionId}`);
      const time = button.querySelector<HTMLTimeElement>(".resume-session-time");
      assert.ok(time, `last-opened time is visible for ${claudeSessionId}`);
      assert.equal(time.textContent, relativeText);
      assert.equal(time.dateTime, lastLaunchedAt);
      assert.equal(time.title, `Last opened Local ${lastLaunchedAt}`);
      assert.match(button.getAttribute("aria-label") ?? "", new RegExp(
        `Last opened Local ${lastLaunchedAt.replaceAll(".", "\\.")}`,
        "u"
      ));
    }
  });

  it("refreshes launch ages with one timer and retires it when resume rows disappear", () => {
    let now = Date.parse("2026-09-10T12:00:30.000Z");
    const harness = createRendererHarness(false, "Win32", {
      now: () => now,
      formatDateTime: (date) => `Local ${date.toISOString()}`
    });
    const saved = {
      claudeSessionId: "11111111-1111-4111-8111-111111111111",
      displayName: "Saved session",
      rootId: "file:///alpha",
      rootLabel: "Alpha",
      rootPath: "C:/alpha",
      createdAt: "2026-09-01T10:00:00.000Z",
      lastLaunchedAt: "2026-09-10T12:00:00.000Z"
    };
    harness.renderer.handleMessage({
      type: "hydrate",
      sessions: [],
      activeSessionId: undefined,
      terminalFont,
      resumableSessions: [saved]
    });
    const button = harness.document.querySelector<HTMLButtonElement>(".resume-session");
    const time = button?.querySelector<HTMLTimeElement>(".resume-session-time");
    assert.ok(button);
    assert.ok(time);
    button.focus();

    assert.deepEqual(harness.scheduledIntervalMilliseconds, [60_000]);
    assert.equal(time.textContent, "Last opened just now");
    harness.renderer.handleMessage({ type: "resumableSessionsChanged", sessions: [saved] });
    const refreshedButton = harness.document.querySelector<HTMLButtonElement>(".resume-session");
    const refreshedTime = refreshedButton?.querySelector<HTMLTimeElement>(".resume-session-time");
    assert.ok(refreshedButton);
    assert.ok(refreshedTime);
    assert.deepEqual(harness.scheduledIntervalMilliseconds, [60_000]);
    assert.equal(harness.document.activeElement, refreshedButton);
    now = Date.parse("2026-09-10T12:02:00.000Z");
    harness.runScheduledIntervals();

    assert.equal(refreshedTime.textContent, "Last opened 2 minutes ago");
    assert.equal(harness.document.querySelector(".resume-session"), refreshedButton);
    assert.equal(harness.document.activeElement, refreshedButton);
    harness.renderer.handleMessage({ type: "resumableSessionsChanged", sessions: [] });
    assert.deepEqual(harness.clearedIntervalIds, [1]);
    harness.renderer.dispose();
    assert.deepEqual(harness.clearedIntervalIds, [1]);
  });

  it("keeps a resumable row usable when exact local-time formatting fails", () => {
    const lastLaunchedAt = "2026-09-10T11:00:00.000Z";
    const harness = createRendererHarness(false, "Win32", {
      now: () => Date.parse("2026-09-10T12:00:00.000Z"),
      formatDateTime: () => {
        throw new RangeError("unsupported locale");
      }
    });

    assert.doesNotThrow(() => harness.renderer.handleMessage({
      type: "hydrate",
      sessions: [],
      activeSessionId: undefined,
      terminalFont,
      resumableSessions: [{
        claudeSessionId: "11111111-1111-4111-8111-111111111111",
        displayName: "Saved session",
        rootId: "file:///alpha",
        rootLabel: "Alpha",
        rootPath: "C:/alpha",
        createdAt: "2026-09-01T10:00:00.000Z",
        lastLaunchedAt
      }]
    }));

    const button = harness.document.querySelector<HTMLButtonElement>(".resume-session");
    const time = button?.querySelector<HTMLTimeElement>(".resume-session-time");
    assert.ok(button);
    assert.ok(time);
    assert.equal(time.textContent, "Last opened 1 hour ago");
    assert.equal(time.title, `Last opened ${lastLaunchedAt}`);
    assert.ok(button.title.includes(lastLaunchedAt));
    assert.ok(button.getAttribute("aria-label")?.includes(lastLaunchedAt));
    button.click();
    assert.deepEqual(harness.messages.at(-1), {
      type: "resumeSession",
      claudeSessionId: "11111111-1111-4111-8111-111111111111"
    });
  });

  it("retains seconds, milliseconds, and timezone in the default exact timestamp", () => {
    const lastLaunchedAt = "2026-09-10T12:00:30.987Z";
    const harness = createRendererHarness(false, "Win32", {
      now: () => Date.parse("2026-09-10T13:00:30.987Z")
    });
    harness.renderer.handleMessage({
      type: "hydrate",
      sessions: [],
      activeSessionId: undefined,
      terminalFont,
      resumableSessions: [{
        claudeSessionId: "11111111-1111-4111-8111-111111111111",
        displayName: "Saved session",
        rootId: "file:///alpha",
        rootLabel: "Alpha",
        rootPath: "C:/alpha",
        createdAt: "2026-09-01T10:00:00.000Z",
        lastLaunchedAt
      }]
    });

    const time = harness.document.querySelector<HTMLTimeElement>(".resume-session-time");
    assert.ok(time);
    assert.ok(time.title.includes("30.987"), time.title);
    assert.match(time.title, /(?:GMT|UTC)(?:[+\-−]\d+(?::\d+)?)?/u);
  });

  it("keeps last-opened metadata readable in a constrained resume row", () => {
    const harness = createRendererHarness(true, "Win32", {
      now: () => Date.parse("2026-09-10T12:00:00.000Z")
    });
    harness.renderer.handleMessage({
      type: "hydrate",
      sessions: [],
      activeSessionId: undefined,
      terminalFont,
      resumableSessions: [{
        claudeSessionId: "11111111-1111-4111-8111-111111111111",
        displayName: "Saved session",
        rootId: "file:///alpha",
        rootLabel: "Alpha",
        rootPath: "C:/alpha",
        createdAt: "2026-09-01T10:00:00.000Z",
        lastLaunchedAt: "2026-09-10T11:00:00.000Z"
      }]
    });
    const time = harness.document.querySelector<HTMLElement>(".resume-session-time");
    assert.ok(time);

    const style = harness.document.defaultView!.getComputedStyle(time);
    assert.equal(style.display, "block");
    assert.equal(style.overflow, "hidden");
    assert.equal(style.textOverflow, "ellipsis");
    assert.equal(style.whiteSpace, "nowrap");
    assert.equal(style.fontSize, "10px");
  });

  it("distinguishes duplicate resume names with visible and accessible session IDs", () => {
    const harness = createRendererHarness(true);
    const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
    harness.renderer.handleMessage({ type: "hydrate", sessions: [], activeSessionId: undefined,
      terminalFont, resumableSessions: ids.map((claudeSessionId) => ({
        claudeSessionId, displayName: "Alpha 1", rootId: "file:///alpha", rootLabel: "Alpha",
        rootPath: "C:/alpha", createdAt: "2026-09-01T10:00:00Z", lastLaunchedAt: "2026-09-02T10:00:00Z"
      })) });
    const buttons = [...harness.document.querySelectorAll<HTMLButtonElement>(".resume-session")];
    assert.deepEqual(buttons.map((button) => button.querySelector(".resume-session-id")?.textContent), ids);
    buttons.forEach((button, index) => {
      assert.ok(button.getAttribute("aria-label")?.includes(ids[index]!));
      assert.ok(button.title.includes(ids[index]!));
    });
    buttons[1]!.querySelector<HTMLElement>(".resume-session-id")!.click();
    assert.deepEqual(harness.messages.at(-1), { type: "resumeSession", claudeSessionId: ids[1] });
  });

  it("shows resume-session keyboard focus inside the button bounds", () => {
    // An outward-only outline can be clipped by the constrained sidebar and hide keyboard focus.
    const harness = createRendererHarness(true);
    harness.renderer.handleMessage({
      type: "hydrate",
      sessions: [],
      activeSessionId: undefined,
      terminalFont,
      resumableSessions: [{
        claudeSessionId: "11111111-1111-4111-8111-111111111111",
        displayName: "Saved session",
        rootId: "file:///alpha",
        rootLabel: "Alpha",
        rootPath: "C:/alpha",
        createdAt: "2026-09-01T10:00:00.000Z",
        lastLaunchedAt: "2026-09-02T10:00:00.000Z"
      }]
    });
    const button = harness.document.querySelector<HTMLButtonElement>(".resume-session");
    assert.ok(button);

    button.focus();
    const style = harness.document.defaultView!.getComputedStyle(button);

    assert.match(style.outline, /\bsolid\b/u);
    assert.equal(style.outlineOffset, "-2px");
  });

  it("uses secondary sidebar actions in dark themes and primary actions in light themes", () => {
    const harness = createRendererHarness(true);
    const dark = findStyleRule(
      harness.document,
      "body.vscode-dark .session-action,body.vscode-dark .session-sidebar-toggle"
    );
    const light = findStyleRule(
      harness.document,
      "body.vscode-light .session-action,body.vscode-light .session-sidebar-toggle"
    );

    assert.equal(dark.style.background, "var(--vscode-button-secondaryBackground)");
    assert.equal(dark.style.color, "var(--vscode-button-secondaryForeground)");
    assert.equal(light.style.background, "var(--vscode-button-background)");
    assert.equal(light.style.color, "var(--vscode-button-foreground)");
    assert.equal(dark.selectorText.includes(".session-tab"), false);
    assert.equal(light.selectorText.includes(".resume-session"), false);
  });

  it("outlines sidebar controls when their background blends into the panel", () => {
    const harness = createRendererHarness(true);
    const rule = findStyleRule(harness.document, ".session-action,.session-sidebar-toggle");
    assert.equal(rule.style.borderColor,
      "color-mix(in srgb, var(--vscode-foreground) 25%, transparent)");
  });

  it("keeps sidebar focus and high-contrast borders inside each button", () => {
    const harness = createRendererHarness(true);
    const action = harness.document.querySelector<HTMLButtonElement>(".session-action");
    assert.ok(action);

    action.focus();
    const style = harness.document.defaultView!.getComputedStyle(action);
    const highContrast = findStyleRule(
      harness.document,
      "body.vscode-high-contrast .session-action,body.vscode-high-contrast .session-sidebar-toggle"
    );
    assert.equal(highContrast.style.borderColor, "var(--vscode-button-border)");
    assert.equal(style.outlineOffset, "-2px");
  });

  it("updates the resume region independently and keeps terminal focus and lifetime intact", () => {
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "Live");
    harness.renderer.handleMessage({ type: "hydrate", sessions: [alpha],
      activeSessionId: alpha.id, terminalFont, resumableSessions: [] });
    const region = harness.document.querySelector<HTMLElement>('section[aria-labelledby="resume-sessions-heading"]');
    assert.ok(region);
    assert.equal(region.querySelectorAll("button").length, 0);
    assert.equal(region.querySelector<HTMLElement>(".resume-sessions-empty")?.hidden, false);
    const focused = harness.document.activeElement;
    const saved = {
      claudeSessionId: "11111111-1111-4111-8111-111111111111", displayName: "Saved",
      rootId: "file:///alpha", rootLabel: "Alpha", rootPath: "C:/alpha",
      createdAt: "2026-09-01T10:00:00Z", lastLaunchedAt: "2026-09-02T10:00:00Z"
    };
    harness.renderer.handleMessage({ type: "resumableSessionsChanged", sessions: [saved] });
    assert.equal(region.querySelectorAll("button").length, 1);
    assert.equal(region.querySelector<HTMLElement>(".resume-sessions-empty")?.hidden, true);
    assert.equal(harness.document.activeElement, focused);
    harness.renderer.handleMessage({ type: "resumableSessionsChanged", sessions: [] });
    assert.equal(region.querySelectorAll("button").length, 0);
    assert.equal(region.querySelector<HTMLElement>(".resume-sessions-empty")?.hidden, false);
    assert.equal(harness.terminals.length, 1);
    assert.equal(harness.terminals[0]?.disposed, false);
    assert.equal(harness.document.activeElement, focused);
  });

  describe("resume keyboard focus", () => {
    const alpha = {
      claudeSessionId: "11111111-1111-4111-8111-111111111111", displayName: "Alpha session",
      rootId: "file:///alpha", rootLabel: "Alpha", rootPath: "C:/alpha",
      createdAt: "2026-09-01T10:00:00Z", lastLaunchedAt: "2026-09-03T10:00:00Z"
    };
    const beta = { ...alpha, claudeSessionId: "22222222-2222-4222-8222-222222222222",
      displayName: "Beta session", lastLaunchedAt: "2026-09-02T10:00:00Z" };
    const gamma = { ...alpha, claudeSessionId: "33333333-3333-4333-8333-333333333333",
      displayName: "Gamma session", lastLaunchedAt: "2026-09-01T10:00:00Z" };

    it("keeps focus on the same resumable UUID when incremental updates reorder its row", () => {
      const harness = createRendererHarness();
      harness.renderer.handleMessage({ type: "hydrate", sessions: [], resumableSessions: [alpha, beta],
        activeSessionId: undefined, terminalFont });
      harness.document.querySelector<HTMLButtonElement>(
        `button[data-resume-session-id="${alpha.claudeSessionId}"]`
      )!.focus();

      harness.renderer.handleMessage({ type: "resumableSessionsChanged", sessions: [
        { ...beta, lastLaunchedAt: "2026-09-04T10:00:00Z" }, alpha
      ] });

      const focused = harness.document.activeElement as HTMLButtonElement;
      assert.equal(focused.dataset.resumeSessionId, "11111111-1111-4111-8111-111111111111");
      assert.equal(focused.isConnected, true);
      focused.click();
      assert.deepEqual(harness.messages, [{ type: "ready" }, {
        type: "resumeSession", claudeSessionId: "11111111-1111-4111-8111-111111111111"
      }]);
      assert.equal(harness.terminals.length, 0);
    });

    for (const scenario of [
      { name: "the next row when a middle row disappears", selected: beta,
        remaining: [alpha, gamma], expectedLabel: `Resume Gamma session in Alpha, session ${gamma.claudeSessionId}` },
      { name: "the previous row when the final row disappears", selected: gamma,
        remaining: [alpha, beta], expectedLabel: `Resume Beta session in Alpha, session ${beta.claudeSessionId}` },
      { name: "New Session when no resume rows remain", selected: alpha,
        remaining: [], expectedLabel: "New Session" }
    ]) {
      it(`moves focus to ${scenario.name}`, () => {
        const harness = createRendererHarness();
        harness.renderer.handleMessage({ type: "hydrate", sessions: [],
          resumableSessions: [alpha, beta, gamma], activeSessionId: undefined, terminalFont });
        harness.document.querySelector<HTMLButtonElement>(
          `button[data-resume-session-id="${scenario.selected.claudeSessionId}"]`
        )!.focus();

        harness.renderer.handleMessage({ type: "resumableSessionsChanged", sessions: scenario.remaining });

        assert.equal(harness.document.activeElement?.tagName, "BUTTON");
        assert.ok(harness.document.activeElement?.getAttribute("aria-label")?.startsWith(
          scenario.expectedLabel
        ));
        assert.equal(harness.document.activeElement?.isConnected, true);
        assert.deepEqual(harness.messages, [{ type: "ready" }], "focus recovery must not launch a session");
        assert.equal(harness.terminals.length, 0);
      });
    }
  });

  it("shows the active session's launch root and exact add-dir paths in an accessible details bar", () => {
    const harness = createRendererHarness();
    const alpha = {
      ...panelSession("session-alpha", "alpha 1", [
        "C:\\workspace\\shared one",
        "D:\\workspace\\shared-two"
      ]),
      launchedRootLabel: "Alpha",
      launchedRootPath: "C:\\workspace\\alpha"
    };
    const beta = panelSession("session-beta", "beta 1");

    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha, beta],
      activeSessionId: alpha.id,
      terminalFont
    });

    const details = harness.document.querySelector<HTMLDetailsElement>(".session-details");
    const summary = details?.querySelector("summary");
    const paths = [...(details?.querySelectorAll<HTMLElement>(".session-details-path") ?? [])];
    assert.equal(details?.open, true);
    assert.equal(details?.tagName, "DETAILS");
    assert.equal(summary?.tagName, "SUMMARY");
    assert.equal(
      details?.querySelector(".session-details-list")?.getAttribute("aria-label"),
      "Directories added to this session"
    );
    assert.equal(summary?.textContent?.trim(), "Launch details — Added directories (2)");
    assert.equal(details?.querySelector(".session-launch-root-label")?.textContent, "Alpha");
    assert.equal(
      details?.querySelector(".session-launch-root-path")?.textContent,
      "C:\\workspace\\alpha"
    );
    assert.equal(
      details?.querySelector(".session-launch-root-path")?.getAttribute("title"),
      "C:\\workspace\\alpha"
    );
    assert.match(
      details?.querySelector(".session-launch-root")?.textContent ?? "",
      /Working directory when this session started/
    );
    assert.deepEqual(paths.map((path) => path.textContent), [
      "C:\\workspace\\shared one",
      "D:\\workspace\\shared-two"
    ]);
    assert.deepEqual(paths.map((path) => path.title), [
      "C:\\workspace\\shared one",
      "D:\\workspace\\shared-two"
    ]);
    assert.equal(details?.querySelector<HTMLElement>(".session-details-empty")?.hidden, true);
  });

  it("retains renamed launch identity and switches launch details immediately", () => {
    const harness = createRendererHarness();
    const alpha = {
      ...panelSession("session-alpha", "alpha 1", ["C:\\workspace\\shared"]),
      launchedRootLabel: "Alpha",
      launchedRootPath: "C:\\workspace\\alpha"
    };
    const beta = {
      ...panelSession("session-beta", "beta 1"),
      launchedRootLabel: "Beta",
      launchedRootPath: "D:\\workspace\\beta"
    };
    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha, beta],
      activeSessionId: alpha.id,
      terminalFont
    });

    harness.renderer.handleMessage({
      type: "sessionUpdated",
      session: { ...alpha, displayName: "Renamed Alpha" }
    });

    const details = harness.document.querySelector<HTMLDetailsElement>(".session-details");
    assert.equal(details?.querySelector(".session-launch-root-label")?.textContent, "Alpha");
    assert.equal(details?.querySelector(".session-launch-root-path")?.textContent, "C:\\workspace\\alpha");
    assert.equal(
      details?.querySelector(".session-launch-root-path")?.getAttribute("title"),
      "C:\\workspace\\alpha"
    );

    harness.renderer.handleMessage({ type: "activeSessionChanged", activeSessionId: beta.id });

    assert.equal(
      details?.querySelector("summary")?.textContent?.trim(),
      "Launch details — Added directories (0)"
    );
    assert.equal(details?.querySelector(".session-launch-root-label")?.textContent, "Beta");
    assert.equal(details?.querySelector(".session-launch-root-path")?.textContent, "D:\\workspace\\beta");
    assert.equal(details?.querySelector(".session-launch-root-path")?.getAttribute("title"), "D:\\workspace\\beta");
    assert.equal(details?.querySelectorAll(".session-details-path").length, 0);
    assert.equal(
      details?.querySelector<HTMLElement>(".session-details-empty")?.textContent?.trim(),
      "No added directories."
    );
    assert.equal(details?.querySelector<HTMLElement>(".session-details-empty")?.hidden, false);
  });

  it("uses the configured initial visibility and persists later disclosure toggles", () => {
    const savedStates: unknown[] = [];
    const harness = createRendererHarness(false, "Win32", {
      initiallyExpanded: false,
      saveState: (state) => savedStates.push(state)
    });
    const alpha = panelSession("session-alpha", "alpha 1");
    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha],
      activeSessionId: alpha.id,
      terminalFont
    });
    const details = harness.document.querySelector<HTMLDetailsElement>(".session-details");
    assert.equal(details?.open, false);

    details!.open = true;
    details!.dispatchEvent(new harness.document.defaultView!.Event("toggle"));
    assert.deepEqual(savedStates, [{ sessionDetailsExpanded: true }]);
    assert.deepEqual(harness.messages, [{ type: "ready" }]);

    const restored = createRendererHarness(false, "Win32", {
      initiallyExpanded: false,
      loadState: () => savedStates.at(-1)
    });
    restored.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha],
      activeSessionId: alpha.id,
      terminalFont
    });
    assert.equal(
      restored.document.querySelector<HTMLDetailsElement>(".session-details")?.open,
      true
    );
  });
  it("keeps only the active terminal canvas attached while retaining session output", () => {
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    const beta = panelSession("session-beta", "beta 1");

    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha, beta],
      activeSessionId: alpha.id,
      terminalFont
    });
    harness.renderer.handleMessage({ type: "sessionData", sessionId: beta.id, data: "beta ready" });
    harness.renderer.handleMessage({ type: "activeSessionChanged", activeSessionId: beta.id });

    assert.equal(harness.stage.querySelectorAll(".terminal-instance").length, 1);
    assert.equal(harness.stage.querySelector(".terminal-instance")?.getAttribute("data-session-id"), beta.id);
    assert.deepEqual(harness.terminals[1]?.writes, ["beta ready"]);

    harness.renderer.handleMessage({ type: "activeSessionChanged", activeSessionId: alpha.id });
    assert.equal(harness.stage.querySelectorAll(".terminal-instance").length, 1);
    assert.equal(harness.stage.querySelector(".terminal-instance")?.getAttribute("data-session-id"), alpha.id);
    assert.deepEqual(harness.terminals[1]?.writes, ["beta ready"]);

    harness.renderer.handleMessage({ type: "sessionRemoved", sessionId: beta.id });
    assert.equal(harness.terminals[1]?.disposed, true);
  });

  it("restarts a newly selected tab before the host acknowledges its activation", () => {
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    const beta = panelSession("session-beta", "beta 1");

    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha, beta],
      activeSessionId: alpha.id,
      terminalFont
    });
    harness.document.querySelector<HTMLElement>(`[data-session-id="${beta.id}"]`)?.click();
    harness.document.querySelector<HTMLElement>("[data-action=restartFresh]")?.click();

    assert.deepEqual(harness.messages.slice(1), [
      { type: "selectSession", sessionId: beta.id },
      { type: "restartFresh", sessionId: beta.id }
    ]);
  });

  it("opens a rename context menu for the right-clicked session tab", () => {
    // Targeting the active session instead of the clicked tab would rename the wrong concurrent task.
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    const beta = panelSession("session-beta", "beta 1");
    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha, beta],
      activeSessionId: alpha.id,
      terminalFont
    });
    const betaTab = harness.document.querySelector<HTMLButtonElement>(
      `[data-session-id="${beta.id}"]`
    );
    assert.ok(betaTab);

    const contextMenu = new harness.document.defaultView!.MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 24,
      clientY: 36
    });
    betaTab.dispatchEvent(contextMenu);
    const menu = harness.document.querySelector<HTMLElement>("[data-session-context-menu]");
    const rename = menu?.querySelector<HTMLButtonElement>("[data-context-action=renameSession]");

    assert.equal(contextMenu.defaultPrevented, true);
    assert.equal(menu?.hidden, false);
    assert.equal(menu?.getAttribute("role"), "menu");
    assert.equal(rename?.getAttribute("role"), "menuitem");
    assert.equal(harness.document.activeElement, rename);
    assert.equal(betaTab.getAttribute("aria-expanded"), "true");

    rename?.click();

    assert.equal(menu?.hidden, true);
    assert.deepEqual(harness.messages.slice(1), [
      { type: "requestRenameSession", sessionId: beta.id }
    ]);
  });

  it("forgets a resumable row from pointer or keyboard context menus without resuming it", () => {
    const harness = createRendererHarness();
    const saved = {
      claudeSessionId: "11111111-1111-4111-8111-111111111111", displayName: "Saved",
      rootId: "file:///alpha", rootLabel: "Alpha", rootPath: "C:/alpha",
      createdAt: "2026-09-01T10:00:00Z", lastLaunchedAt: "2026-09-02T10:00:00Z"
    };
    harness.renderer.handleMessage({ type: "hydrate", sessions: [], resumableSessions: [saved],
      activeSessionId: undefined, terminalFont });
    const row = harness.document.querySelector<HTMLButtonElement>(".resume-session")!;
    const menu = harness.document.querySelector<HTMLElement>("[data-session-context-menu]")!;
    const forget = menu.querySelector<HTMLButtonElement>("[data-context-action=forgetSession]")!;

    const pointer = new harness.document.defaultView!.MouseEvent("contextmenu", {
      bubbles: true, cancelable: true, clientX: 20, clientY: 30
    });
    row.dispatchEvent(pointer);
    assert.equal(pointer.defaultPrevented, true);
    assert.equal(menu.hidden, false);
    assert.equal(forget.hidden, false);
    assert.equal(harness.document.activeElement, forget);
    forget.dispatchEvent(new harness.document.defaultView!.KeyboardEvent("keydown", {
      key: "Escape", bubbles: true, cancelable: true
    }));
    assert.equal(menu.hidden, true);
    assert.equal(harness.document.activeElement, row);

    row.dispatchEvent(new harness.document.defaultView!.KeyboardEvent("keydown", {
      key: "ContextMenu", bubbles: true, cancelable: true
    }));
    forget.click();
    assert.deepEqual(harness.messages.slice(1), [
      { type: "forgetSession", claudeSessionId: saved.claudeSessionId }
    ]);
  });

  it("dismisses a saved-session menu and moves focus when its row disappears", () => {
    const harness = createRendererHarness();
    const first = {
      claudeSessionId: "11111111-1111-4111-8111-111111111111", displayName: "First",
      rootId: "file:///alpha", rootLabel: "Alpha", rootPath: "C:/alpha",
      createdAt: "2026-09-01T10:00:00Z", lastLaunchedAt: "2026-09-03T10:00:00Z"
    };
    const second = { ...first, claudeSessionId: "22222222-2222-4222-8222-222222222222",
      displayName: "Second", lastLaunchedAt: "2026-09-02T10:00:00Z" };
    harness.renderer.handleMessage({ type: "hydrate", sessions: [], resumableSessions: [first, second],
      activeSessionId: undefined, terminalFont });
    const rows = [...harness.document.querySelectorAll<HTMLButtonElement>(".resume-session")];
    rows[0]!.dispatchEvent(new harness.document.defaultView!.KeyboardEvent("keydown", {
      key: "F10", shiftKey: true, bubbles: true, cancelable: true
    }));

    harness.renderer.handleMessage({ type: "resumableSessionsChanged", sessions: [second] });

    assert.equal(harness.document.querySelector<HTMLElement>("[data-session-context-menu]")?.hidden, true);
    assert.equal(harness.document.activeElement?.getAttribute("data-resume-session-id"), second.claudeSessionId);
  });

  it("keeps an open saved-session menu focused across unrelated live updates", () => {
    const harness = createRendererHarness();
    const live = panelSession("session-alpha", "Live");
    const saved = {
      claudeSessionId: "11111111-1111-4111-8111-111111111111", displayName: "Saved",
      rootId: "file:///alpha", rootLabel: "Alpha", rootPath: "C:/alpha",
      createdAt: "2026-09-01T10:00:00Z", lastLaunchedAt: "2026-09-02T10:00:00Z"
    };
    harness.renderer.handleMessage({ type: "hydrate", sessions: [live], resumableSessions: [saved],
      activeSessionId: live.id, terminalFont });
    const row = harness.document.querySelector<HTMLButtonElement>(".resume-session")!;
    row.dispatchEvent(new harness.document.defaultView!.KeyboardEvent("keydown", {
      key: "ContextMenu", bubbles: true, cancelable: true
    }));

    harness.renderer.handleMessage({ type: "sessionUpdated", session: { ...live, state: "closing" } });

    assert.equal(harness.document.querySelector<HTMLElement>("[data-session-context-menu]")?.hidden, false);
    assert.equal(harness.document.activeElement?.getAttribute("data-context-action"), "forgetSession");
  });

  it("opens and dismisses the session rename menu from the keyboard", () => {
    // A mouse-only context menu would make session renaming inaccessible to keyboard users.
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha],
      activeSessionId: alpha.id,
      terminalFont
    });
    const tab = harness.document.querySelector<HTMLButtonElement>(
      `[data-session-id="${alpha.id}"]`
    );
    const menu = harness.document.querySelector<HTMLElement>("[data-session-context-menu]");
    const rename = menu?.querySelector<HTMLButtonElement>("[data-context-action=renameSession]");
    assert.ok(tab);
    assert.ok(menu);
    assert.ok(rename);
    tab.focus();

    tab.dispatchEvent(new harness.document.defaultView!.KeyboardEvent("keydown", {
      key: "F10",
      shiftKey: true,
      bubbles: true,
      cancelable: true
    }));
    assert.equal(menu.hidden, false);
    assert.equal(harness.document.activeElement, rename);

    rename.dispatchEvent(new harness.document.defaultView!.KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true
    }));
    assert.equal(menu.hidden, true);
    assert.equal(harness.document.activeElement, tab);

    tab.dispatchEvent(new harness.document.defaultView!.KeyboardEvent("keydown", {
      key: "ContextMenu",
      bubbles: true,
      cancelable: true
    }));
    rename.click();
    assert.deepEqual(harness.messages.slice(1), [
      { type: "requestRenameSession", sessionId: alpha.id }
    ]);
  });

  it("keeps an open rename menu operable across live session updates", () => {
    // A lifecycle rerender that refocuses xterm strands keyboard users outside the visible menu.
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha],
      activeSessionId: alpha.id,
      terminalFont
    });
    const tab = harness.document.querySelector<HTMLButtonElement>(
      `[data-session-id="${alpha.id}"]`
    );
    assert.ok(tab);
    tab.dispatchEvent(new harness.document.defaultView!.KeyboardEvent("keydown", {
      key: "F10",
      shiftKey: true,
      bubbles: true,
      cancelable: true
    }));

    harness.renderer.handleMessage({
      type: "sessionUpdated",
      session: { ...alpha, state: "closing" }
    });

    const menu = harness.document.querySelector<HTMLElement>("[data-session-context-menu]");
    const rename = menu?.querySelector<HTMLButtonElement>("[data-context-action=renameSession]");
    assert.equal(menu?.hidden, false);
    assert.equal(harness.document.activeElement, rename);
    rename?.click();
    assert.deepEqual(harness.messages.slice(1), [
      { type: "requestRenameSession", sessionId: alpha.id }
    ]);
  });

  it("keeps the rename menu inside the webview viewport", () => {
    // Directly using pointer coordinates can clip the only menu action at the right or bottom edge.
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha],
      activeSessionId: alpha.id,
      terminalFont
    });
    const tab = harness.document.querySelector<HTMLButtonElement>(
      `[data-session-id="${alpha.id}"]`
    );
    const menu = harness.document.querySelector<HTMLElement>("[data-session-context-menu]");
    assert.ok(tab);
    assert.ok(menu);
    Object.defineProperties(harness.document.documentElement, {
      clientWidth: { value: 100, configurable: true },
      clientHeight: { value: 80, configurable: true }
    });
    Object.defineProperties(menu, {
      offsetWidth: { value: 60, configurable: true },
      offsetHeight: { value: 30, configurable: true }
    });

    tab.dispatchEvent(new harness.document.defaultView!.MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 90,
      clientY: 75
    }));

    assert.equal(menu.style.left, "40px");
    assert.equal(menu.style.top, "50px");
  });

  it("collapses the expanded right action sidebar into an accessible icon rail", () => {
    // Moving actions back into the scrolling tab rail or hiding them when collapsed must fail.
    const harness = createRendererHarness(true);
    const workspace = harness.document.querySelector<HTMLElement>(".session-workspace");
    const sidebar = harness.document.querySelector<HTMLElement>(".session-sidebar");
    const tabs = harness.document.querySelector<HTMLElement>(".session-tabs");
    const toggle = harness.document.querySelector<HTMLButtonElement>("[data-sidebar-toggle]");
    const actionButtons = [...harness.document.querySelectorAll<HTMLButtonElement>("[data-action]")];

    assert.ok(workspace, "session workspace was rendered");
    assert.ok(sidebar, "right action sidebar was rendered");
    assert.ok(tabs, "session tab strip was rendered");
    assert.ok(toggle, "sidebar toggle was rendered");
    assert.equal(workspace.lastElementChild, sidebar);
    assert.equal(sidebar.classList.contains("is-collapsed"), false);
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    assert.equal(toggle.getAttribute("aria-label"), "Collapse session actions");
    assert.equal(actionButtons.length, 7);
    assert.deepEqual(actionButtons.map((button) => button.getAttribute("aria-label")), [
      "New Session",
      "New in Folder…",
      "Close Session",
      "Restart Fresh",
      "Previous Session",
      "Next Session",
      "Configure Workspace…"
    ]);
    assert.equal(actionButtons.every((button) => button.tabIndex === 0), true);
    assert.equal(harness.document.querySelector(".session-rail .session-actions"), null);
    const actionGroup = sidebar.querySelector<HTMLElement>(".session-actions");
    assert.ok(actionGroup, "sidebar action group was rendered");
    assert.equal(actionGroup.getAttribute("role"), null);
    assert.equal(actionGroup.getAttribute("aria-orientation"), null);
    assert.equal(harness.document.defaultView?.getComputedStyle(tabs).overflowX, "auto");

    toggle.focus();
    assert.equal(harness.document.activeElement, toggle);
    toggle.click();

    assert.equal(sidebar.classList.contains("is-collapsed"), true);
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(toggle.getAttribute("aria-label"), "Expand session actions");
    assert.equal(toggle.title, "Expand session actions");
    assert.equal(
      harness.document.defaultView?.getComputedStyle(
        harness.document.querySelector<HTMLElement>(".session-action-label")!
      ).display,
      "none"
    );
    assert.equal(actionButtons.every((button) => button.title.length > 0), true);

    toggle.click();
    assert.equal(sidebar.classList.contains("is-collapsed"), false);
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    assert.equal(toggle.getAttribute("aria-label"), "Collapse session actions");
    assert.equal(toggle.title, "Collapse session actions");
  });

  it("uses a distinct directory icon for New in Folder", () => {
    const harness = createRendererHarness(true);
    const newSession = harness.document.querySelector<HTMLButtonElement>(
      "[data-action=newSession]"
    );
    const newInFolder = harness.document.querySelector<HTMLButtonElement>(
      "[data-action=newInFolder]"
    );
    const closeSession = harness.document.querySelector<HTMLButtonElement>(
      "[data-action=closeSession]"
    );
    assert.ok(newSession);
    assert.ok(newInFolder);
    assert.ok(closeSession);

    const iconText = (button: HTMLButtonElement): string | null =>
      button.querySelector(".session-action-icon")?.textContent ?? null;

    assert.equal(iconText(newInFolder), "⌂");
    assert.notEqual(iconText(newInFolder), iconText(newSession));
    assert.notEqual(iconText(newInFolder), iconText(closeSession));
    assert.equal(newInFolder.getAttribute("aria-label"), "New in Folder…");
    assert.equal(newInFolder.title, "New in Folder…");
  });

  it("dispatches sidebar actions when their icon is clicked in either sidebar state", () => {
    // Event delegation that reads only the direct target loses actions when nested icons receive the click.
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    harness.renderer.handleMessage({ type: "hydrate", resumableSessions: [], sessions: [alpha], activeSessionId: alpha.id, terminalFont });

    harness.document.querySelector<HTMLElement>("[data-action=restartFresh] .session-action-icon")?.click();
    harness.document.querySelector<HTMLElement>("[data-sidebar-toggle]")?.click();
    harness.document.querySelector<HTMLElement>("[data-action=nextSession] .session-action-icon")?.click();

    assert.deepEqual(harness.messages.slice(1), [
      { type: "restartFresh", sessionId: alpha.id },
      { type: "nextSession" }
    ]);
  });

  it("does not select a session when terminal content is clicked", () => {
    // Delegating all data-session-id ancestors treats the terminal container as a session tab.
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    harness.renderer.handleMessage({ type: "hydrate", resumableSessions: [], sessions: [alpha], activeSessionId: alpha.id, terminalFont });

    harness.terminals[0]?.element.click();

    assert.deepEqual(harness.messages, [{ type: "ready" }]);
  });

  it("reserves usable terminal width when the expanded sidebar is constrained", () => {
    // A zero-minimum terminal track lets the expanded sidebar consume the entire narrow panel.
    const harness = createRendererHarness(true);
    const workspace = harness.document.querySelector<HTMLElement>(".session-workspace");
    const sidebar = harness.document.querySelector<HTMLElement>(".session-sidebar");
    assert.ok(workspace, "session workspace was rendered");
    assert.ok(sidebar, "session sidebar was rendered");

    assert.equal(
      harness.document.defaultView?.getComputedStyle(workspace).gridTemplateColumns,
      "minmax(96px, 1fr) auto"
    );
    assert.equal(
      harness.document.defaultView?.getComputedStyle(sidebar).maxInlineSize,
      "calc(100vw - 96px)"
    );
  });

  it("keeps the workspace in the fill row as session details appear and disappear", () => {
    const harness = createRendererHarness(true);
    const workspace = harness.document.querySelector<HTMLElement>(".session-workspace");
    const details = harness.document.querySelector<HTMLDetailsElement>(".session-details");
    assert.ok(workspace);
    assert.ok(details);
    const workspaceRow = (): string =>
      harness.document.defaultView!.getComputedStyle(workspace).gridRow;

    assert.equal(details.hidden, true);
    assert.equal(workspaceRow(), "3");

    const alpha = panelSession("session-alpha", "alpha 1", ["C:\\workspace\\shared"]);
    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha],
      activeSessionId: alpha.id,
      terminalFont
    });
    assert.equal(details.hidden, false);
    assert.equal(workspaceRow(), "3");

    harness.document.querySelector<HTMLButtonElement>("[data-sidebar-toggle]")?.click();
    harness.document.defaultView!.dispatchEvent(new harness.document.defaultView!.Event("resize"));
    assert.equal(workspaceRow(), "3");

    harness.renderer.handleMessage({ type: "sessionRemoved", sessionId: alpha.id });
    assert.equal(details.hidden, true);
    assert.equal(workspaceRow(), "3");
  });

  it("forwards active terminal input and resize through the closed protocol", () => {
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");

    harness.renderer.handleMessage({ type: "hydrate", resumableSessions: [], sessions: [alpha], activeSessionId: alpha.id, terminalFont });
    harness.terminals[0]?.emitData("hello");
    harness.terminals[0]?.emitResize(120, 40);

    assert.deepEqual(harness.messages.slice(1), [
      { type: "input", sessionId: alpha.id, data: "hello" },
      { type: "resize", sessionId: alpha.id, columns: 120, rows: 40 }
    ]);
  });

  it("opens links only from the active terminal with the platform modifier", () => {
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    const beta = panelSession("session-beta", "beta 1");
    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha, beta],
      activeSessionId: alpha.id,
      terminalFont
    });

    harness.terminals[0]?.emitLink("https://example.com/plain", { ctrlKey: false });
    harness.terminals[1]?.emitLink("https://example.com/inactive", { ctrlKey: true });
    harness.terminals[0]?.emitLink("https://example.com/active", { ctrlKey: true });
    harness.renderer.handleMessage({ type: "activeSessionChanged", activeSessionId: beta.id });
    harness.terminals[0]?.emitLink("https://example.com/stale", { ctrlKey: true });
    harness.terminals[1]?.emitLink("https://example.com/switched", { ctrlKey: true });
    harness.renderer.handleMessage({ type: "sessionRemoved", sessionId: beta.id });
    harness.terminals[1]?.emitLink("https://example.com/disposed", { ctrlKey: true });

    assert.deepEqual(harness.messages.slice(1), [
      { type: "openExternal", sessionId: alpha.id, uri: "https://example.com/active" },
      { type: "openExternal", sessionId: beta.id, uri: "https://example.com/switched" }
    ]);
  });

  it("uses Command rather than Control to open links on macOS", () => {
    const harness = createRendererHarness(false, "MacIntel");
    const alpha = panelSession("session-alpha", "alpha 1");
    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha],
      activeSessionId: alpha.id,
      terminalFont
    });

    harness.terminals[0]?.emitLink("https://example.com/control", { ctrlKey: true });
    harness.terminals[0]?.emitLink("https://example.com/command", { metaKey: true });

    assert.deepEqual(harness.messages.slice(1), [
      { type: "openExternal", sessionId: alpha.id, uri: "https://example.com/command" }
    ]);
  });

  it("requests host paste exactly once for Ctrl+V and Ctrl+Shift+V in the active terminal", () => {
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    harness.renderer.handleMessage({ type: "hydrate", resumableSessions: [], sessions: [alpha], activeSessionId: alpha.id, terminalFont });
    harness.stage.querySelector<HTMLElement>(".terminal-instance")?.focus();

    for (const shiftKey of [false, true]) {
      const keydown = new harness.document.defaultView!.KeyboardEvent("keydown", {
        key: "v",
        ctrlKey: true,
        shiftKey,
        bubbles: true,
        cancelable: true
      });
      const processed = harness.terminals[0]?.emitKey(keydown);
      harness.terminals[0]?.emitKey(new harness.document.defaultView!.KeyboardEvent("keypress", {
        key: "v",
        ctrlKey: true,
        shiftKey
      }));
      harness.terminals[0]?.emitKey(new harness.document.defaultView!.KeyboardEvent("keyup", {
        key: "v",
        ctrlKey: true,
        shiftKey
      }));

      assert.equal(processed, false);
      assert.equal(keydown.defaultPrevented, true);
    }

    assert.deepEqual(harness.messages.slice(1), [
      { type: "requestPaste", sessionId: alpha.id },
      { type: "requestPaste", sessionId: alpha.id }
    ]);
  });

  it("does not request paste for an unfocused or inactive terminal", () => {
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    const beta = panelSession("session-beta", "beta 1");
    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha, beta],
      activeSessionId: alpha.id,
      terminalFont
    });
    harness.document.querySelector<HTMLButtonElement>("[data-sidebar-toggle]")?.focus();

    const unfocused = new harness.document.defaultView!.KeyboardEvent("keydown", {
      key: "v",
      ctrlKey: true,
      cancelable: true
    });
    assert.equal(harness.terminals[0]?.emitKey(unfocused), true);

    harness.stage.querySelector<HTMLElement>(".terminal-instance")?.focus();
    const inactive = new harness.document.defaultView!.KeyboardEvent("keydown", {
      key: "v",
      ctrlKey: true,
      cancelable: true
    });
    assert.equal(harness.terminals[1]?.emitKey(inactive), true);
    assert.deepEqual(harness.messages, [{ type: "ready" }]);
  });

  it("routes native paste events through the focused active terminal's paste semantics", () => {
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    harness.renderer.handleMessage({ type: "hydrate", resumableSessions: [], sessions: [alpha], activeSessionId: alpha.id, terminalFont });
    const terminalElement = harness.stage.querySelector<HTMLElement>(".terminal-instance");
    terminalElement?.focus();
    const paste = new harness.document.defaultView!.Event("paste", {
      bubbles: true,
      cancelable: true
    }) as ClipboardEvent;
    Object.defineProperty(paste, "clipboardData", {
      value: { getData: (format: string) => format === "text" ? "native paste" : "" }
    });

    terminalElement?.dispatchEvent(paste);

    assert.equal(paste.defaultPrevented, true);
    assert.deepEqual(harness.terminals[0]?.pastes, ["native paste"]);
    assert.deepEqual(harness.messages, [
      { type: "ready" },
      { type: "input", sessionId: alpha.id, data: "native paste" }
    ]);
  });

  it("routes host clipboard text through paste semantics for only the active terminal", () => {
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    const beta = panelSession("session-beta", "beta 1");
    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha, beta],
      activeSessionId: alpha.id,
      terminalFont
    });

    harness.renderer.handleMessage({ type: "paste", sessionId: beta.id, data: "inactive" });
    harness.renderer.handleMessage({
      type: "paste",
      sessionId: alpha.id,
      data: "first line\nsecond line"
    });

    assert.deepEqual(harness.terminals[0]?.pastes, ["first line\nsecond line"]);
    assert.deepEqual(harness.terminals[1]?.pastes, []);
    assert.deepEqual(harness.messages, [
      { type: "ready" },
      { type: "input", sessionId: alpha.id, data: "first line\rsecond line" }
    ]);
  });

  it("preserves Ctrl+C selection copy without sending terminal input", async () => {
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    const copied: string[] = [];
    Object.defineProperty(harness.document.defaultView!.navigator, "clipboard", {
      value: { writeText: async (text: string) => { copied.push(text); } },
      configurable: true
    });
    harness.renderer.handleMessage({ type: "hydrate", resumableSessions: [], sessions: [alpha], activeSessionId: alpha.id, terminalFont });
    harness.terminals[0]?.selectText("selected output");

    const processed = harness.terminals[0]?.emitKey(new harness.document.defaultView!.KeyboardEvent(
      "keydown",
      { key: "c", ctrlKey: true }
    ));
    harness.terminals[0]?.emitKey(new harness.document.defaultView!.KeyboardEvent(
      "keyup",
      { key: "c", ctrlKey: true }
    ));
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(processed, false);
    assert.deepEqual(copied, ["selected output"]);
    assert.deepEqual(harness.messages, [{ type: "ready" }]);
  });

  it("resolves VS Code theme values and updates existing terminals when the theme mutates", async () => {
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    harness.document.documentElement.style.setProperty("--vscode-terminal-background", "#112233");
    harness.document.documentElement.style.setProperty("--vscode-terminal-foreground", "#ddeeff");
    harness.document.documentElement.style.setProperty(
      "--vscode-terminal-selectionBackground",
      "#335577"
    );

    harness.renderer.handleMessage({ type: "hydrate", resumableSessions: [], sessions: [alpha], activeSessionId: alpha.id, terminalFont });
    assert.deepEqual(harness.terminals[0]?.theme, {
      background: "#112233",
      foreground: "#ddeeff",
      selectionBackground: "#335577"
    });

    harness.document.documentElement.style.setProperty("--vscode-terminal-background", "#445566");
    harness.document.documentElement.style.setProperty(
      "--vscode-terminal-selectionBackground",
      "#557799"
    );
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.deepEqual(harness.terminals[0]?.theme, {
      background: "#445566",
      foreground: "#ddeeff",
      selectionBackground: "#557799"
    });
  });

  it("constructs terminals with the complete metrics supplied by the extension host", () => {
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");

    harness.renderer.handleMessage({ type: "hydrate", resumableSessions: [], sessions: [alpha], activeSessionId: alpha.id, terminalFont });

    assert.deepEqual(harness.terminals[0]?.terminalFont, terminalFont);
  });

  it("uses editor theme colors when terminal colors are unavailable", () => {
    const dom = new JSDOM("<main id=\"app\"></main>", { pretendToBeVisual: true });
    dom.window.document.documentElement.style.setProperty(
      "--vscode-editor-background",
      "#f4f4f4"
    );
    dom.window.document.documentElement.style.setProperty(
      "--vscode-editor-foreground",
      "#242424"
    );

    assert.deepEqual(resolveTheme(dom.window.document), {
      background: "#f4f4f4",
      foreground: "#242424",
      selectionBackground: "rgba(128, 128, 128, 0.45)"
    });
  });

  it("uses the editor selection token when the terminal token is unavailable", () => {
    const dom = new JSDOM("<main id=\"app\"></main>", { pretendToBeVisual: true });
    dom.window.document.documentElement.style.setProperty(
      "--vscode-editor-selectionBackground",
      "#224466"
    );

    assert.equal(resolveTheme(dom.window.document).selectionBackground, "#224466");
  });

  it("uses a visible selection fallback when VS Code exposes no selection token", () => {
    const dom = new JSDOM("<main id=\"app\"></main>", { pretendToBeVisual: true });

    assert.equal(
      resolveTheme(dom.window.document).selectionBackground,
      "rgba(128, 128, 128, 0.45)"
    );
  });

  it("gives the terminal surface the full pane width without a fixed inset", () => {
    const harness = createRendererHarness(true);
    const styles = harness.document.defaultView?.getComputedStyle(harness.stage);

    assert.equal(styles?.paddingLeft, "0px");
    assert.equal(styles?.paddingRight, "0px");
    assert.equal(styles?.paddingTop, "8px");
    assert.equal(styles?.paddingBottom, "8px");
  });
});

/** Returns one parsed CSS rule so style behavior can be checked without string matching. */
function findStyleRule(document: Document, selector: string): CSSStyleRule {
  const normalizedSelector = selector.replace(/\s/gu, "");
  for (const styleSheet of [...document.styleSheets]) {
    for (const rule of [...styleSheet.cssRules]) {
      if (rule instanceof document.defaultView!.CSSStyleRule &&
          rule.selectorText.replace(/\s/gu, "") === normalizedSelector) {
        return rule;
      }
    }
  }
  throw new Error(`Missing CSS rule: ${selector}`);
}

/** Creates a real DOM renderer harness with a fake terminal implementation. */
function createRendererHarness(
  loadStyles = false,
  platform = "Win32",
  options: {
    readonly documentId?: string;
    readonly initiallyExpanded?: boolean;
    readonly loadState?: () => unknown;
    readonly saveState?: (state: unknown) => void;
    readonly now?: () => number;
    readonly formatDateTime?: (date: Date) => string;
  } = {}
): {
  readonly document: Document;
  readonly messages: WebviewMessage[];
  readonly renderer: ReturnType<typeof createSessionRenderer>;
  readonly stage: HTMLElement;
  readonly terminals: FakeTerminal[];
  readonly scheduledIntervalMilliseconds: readonly number[];
  readonly clearedIntervalIds: readonly number[];
  readonly runScheduledIntervals: () => void;
} {
  const dom = new JSDOM("<main id=\"app\"></main>", { pretendToBeVisual: true });
  dom.window.document.querySelector<HTMLElement>("#app")?.setAttribute(
    "data-session-details-initially-expanded",
    String(options.initiallyExpanded ?? true)
  );
  if (loadStyles) {
    const style = dom.window.document.createElement("style");
    style.textContent = readFileSync(
      resolve(__dirname, "../../../src/panel/webview/styles.css"),
      "utf8"
    );
    dom.window.document.head.append(style);
  }
  const messages: WebviewMessage[] = [];
  const terminals: FakeTerminal[] = [];
  const intervalCallbacks = new Map<number, () => void>();
  const scheduledIntervalMilliseconds: number[] = [];
  const clearedIntervalIds: number[] = [];
  let nextIntervalId = 1;
  const terminalFactory: RendererTerminalFactory = {
    create: (theme, font, openLink) => {
      const terminal = new FakeTerminal(dom.window.document, theme, font, openLink);
      terminals.push(terminal);
      return terminal;
    }
  };
  const dependencies = {
    document: dom.window.document,
    window: rendererWindow(dom.window as unknown as Window, platform),
    postMessage: (message: WebviewMessage) => messages.push(message),
    documentId: options.documentId,
    loadState: options.loadState,
    saveState: options.saveState,
    now: options.now,
    formatDateTime: options.formatDateTime,
    setInterval: (callback: () => void, milliseconds: number) => {
      const id = nextIntervalId++;
      intervalCallbacks.set(id, callback);
      scheduledIntervalMilliseconds.push(milliseconds);
      return id;
    },
    clearInterval: (id: number) => {
      intervalCallbacks.delete(id);
      clearedIntervalIds.push(id);
    },
    terminalFactory,
    fitTerminal: () => undefined
  };
  const renderer = createSessionRenderer(dependencies);
  const stage = dom.window.document.querySelector<HTMLElement>(".terminal-stage");
  assert.ok(stage, "terminal stage was rendered");
  return {
    document: dom.window.document,
    messages,
    renderer,
    stage,
    terminals,
    scheduledIntervalMilliseconds,
    clearedIntervalIds,
    runScheduledIntervals: () => {
      for (const callback of intervalCallbacks.values()) {
        callback();
      }
    }
  };
}

/** Converts JSDOM's browser globals into the renderer's explicit window boundary. */
function rendererWindow(window: Window, platform = "Win32"): RendererWindow {
  const globals = window as unknown as {
    readonly HTMLElement: typeof HTMLElement;
    readonly MutationObserver: typeof MutationObserver;
    readonly ResizeObserver?: typeof ResizeObserver;
  };
  const navigator = Object.create(window.navigator) as Navigator;
  Object.defineProperty(navigator, "platform", { value: platform });
  return {
    HTMLElement: globals.HTMLElement,
    MutationObserver: globals.MutationObserver,
    ResizeObserver: globals.ResizeObserver,
    navigator,
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window)
  };
}

/** Represents a hand-derived live session snapshot. */
function panelSession(
  id: string,
  displayName: string,
  launchedAddDirPaths: readonly string[] = []
): ManagedSessionSnapshot {
  return {
    id,
    claudeSessionId: null,
    rootId: `file:///workspace/${id}`,
    displayName,
    ordinalWithinRoot: 1,
    state: "running",
    launchedImportIds: [],
    launchedAddDirPaths,
    launchedRootLabel: id,
    launchedRootPath: `C:\\workspace\\${id}`,
    launchedAt: 1234
  };
}

/** Implements just enough terminal behavior to observe renderer boundary effects. */
class FakeTerminal implements RendererTerminal {
  readonly element: HTMLElement;
  readonly writes: string[] = [];
  readonly pastes: string[] = [];
  readonly theme: { background: string; foreground: string; selectionBackground?: string };
  readonly terminalFont: TerminalFontMetrics;
  disposed = false;
  private selection = "";
  private dataListener: ((data: string) => void) | undefined;
  private resizeListener: ((size: { cols: number; rows: number }) => void) | undefined;
  private keyEventHandler: ((event: KeyboardEvent) => boolean) | undefined;
  private readonly openLink: (event: MouseEvent, uri: string) => void;

  constructor(
    document: Document,
    theme: { background: string; foreground: string; selectionBackground?: string },
    terminalFont: TerminalFontMetrics,
    openLink: (event: MouseEvent, uri: string) => void
  ) {
    this.theme = theme;
    this.terminalFont = terminalFont;
    this.openLink = openLink;
    this.element = document.createElement("div");
    this.element.tabIndex = 0;
  }

  open(parent: HTMLElement): void { parent.append(this.element); }
  write(data: string): void { this.writes.push(data); }
  paste(data: string): void {
    this.pastes.push(data);
    this.dataListener?.(data.replace(/\r?\n/g, "\r"));
  }
  dispose(): void { this.disposed = true; }
  focus(): void { this.element.focus(); }
  onData(listener: (data: string) => void): void { this.dataListener = listener; }
  onResize(listener: (size: { cols: number; rows: number }) => void): void { this.resizeListener = listener; }
  attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean): void {
    this.keyEventHandler = handler;
  }
  updateTheme(theme: { background: string; foreground: string; selectionBackground?: string }): void {
    this.theme.background = theme.background;
    this.theme.foreground = theme.foreground;
    this.theme.selectionBackground = theme.selectionBackground;
  }
  hasSelection(): boolean { return this.selection.length > 0; }
  getSelection(): string { return this.selection; }
  selectText(text: string): void { this.selection = text; }
  emitData(data: string): void { this.dataListener?.(data); }
  emitResize(cols: number, rows: number): void { this.resizeListener?.({ cols, rows }); }
  emitKey(event: KeyboardEvent): boolean | undefined { return this.keyEventHandler?.(event); }
  emitLink(
    uri: string,
    options: { readonly ctrlKey?: boolean; readonly metaKey?: boolean }
  ): void {
    const event = new this.element.ownerDocument.defaultView!.MouseEvent("click", options);
    this.openLink(event, uri);
  }
}
