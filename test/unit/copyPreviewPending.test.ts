import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { CopyPreview } from "../../src/panel/webview/companion/copyPreview";

function setup() {
  const dom = new JSDOM("<!doctype html><section></section>");
  const root = dom.window.document.querySelector("section")!;
  const writes: string[] = [];
  let dismissals = 0;
  const preview = new CopyPreview(root, {
    value: "C:/repo folder/a.txt",
    label: "Path",
    restoreFocus: () => {},
    copy: value => {
      writes.push(value);
      preview.setPending(true);
    },
    cancel: () => {
      dismissals++;
      preview.close();
    }
  });
  const dialog = root.querySelector("dialog")!;
  const editor = dialog.querySelector("textarea")!;
  const status = dialog.querySelector("[role=status]")!;
  const [submit, dismiss] = dialog.querySelectorAll("button");
  assert.ok(submit && dismiss);
  return { dom, root, preview, editor, status, submit, dismiss, writes, dismissals: () => dismissals };
}

describe("copy preview pending dismissal", () => {
  it("allows cancelling before submitting without requesting a write", () => {
    const h = setup();
    try {
      assert.equal(h.dismiss.textContent, "Cancel");
      h.dismiss.click();
      assert.deepEqual(h.writes, []);
      assert.equal(h.dismissals(), 1);
      assert.equal(h.root.querySelector("dialog"), null);
    } finally {
      h.dom.window.close();
    }
  });

  it("offers Close after submitting and does not submit a second write", () => {
    const h = setup();
    try {
      h.submit.click();
      assert.equal(h.dismiss.textContent, "Close");
      assert.equal(h.status.textContent, "Copying…");
      assert.equal(h.editor.readOnly, true);
      assert.equal(h.submit.disabled, true);
      h.submit.click();
      h.dismiss.click();
      assert.deepEqual(h.writes, ["C:/repo folder/a.txt"]);
      assert.equal(h.dismissals(), 1);
      assert.equal(h.root.querySelector("dialog"), null);
    } finally {
      h.dom.window.close();
    }
  });

  it("restores editing and Cancel after a recoverable copy failure", () => {
    const h = setup();
    try {
      h.submit.click();
      h.preview.setPending(false, "Clipboard is busy. Try again.");
      assert.equal(h.dismiss.textContent, "Cancel");
      assert.equal(h.editor.readOnly, false);
      assert.equal(h.submit.disabled, false);
      assert.equal(h.status.textContent, "Clipboard is busy. Try again.");
      h.dismiss.click();
      assert.deepEqual(h.writes, ["C:/repo folder/a.txt"]);
    } finally {
      h.dom.window.close();
    }
  });
});
