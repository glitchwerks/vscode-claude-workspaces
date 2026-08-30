import assert from "node:assert/strict";

import { resolveTerminalFontMetrics } from "../../src/panel/terminalFont";

describe("terminal font metrics", () => {
  it("normalizes settings to the effective xterm metric domain", () => {
    assert.deepEqual(resolveTerminalFontMetrics({
      terminalFontFamily: "Cascadia Mono",
      editorFontFamily: "Fira Code",
      fontSize: 200,
      letterSpacing: -5.8,
      lineHeight: 0.5,
      platform: "win32"
    }), {
      fontFamily: "Cascadia Mono, monospace",
      fontSize: 100,
      letterSpacing: -5,
      lineHeight: 1
    });
  });

  it("uses editor defaults and the macOS braille fallback", () => {
    assert.deepEqual(resolveTerminalFontMetrics({
      terminalFontFamily: "",
      editorFontFamily: "Fira Code",
      platform: "darwin"
    }), {
      fontFamily: "Fira Code, monospace, AppleBraille",
      fontSize: 12,
      letterSpacing: 0,
      lineHeight: 1
    });
  });

  it("preserves fractional font sizes accepted by VS Code", () => {
    assert.equal(resolveTerminalFontMetrics({
      terminalFontFamily: "monospace",
      fontSize: 13.5,
      platform: "win32"
    }).fontSize, 13.5);
  });
});
