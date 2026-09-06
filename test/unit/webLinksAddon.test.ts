import assert from "node:assert/strict";

import { WebLinksAddon } from "@xterm/addon-web-links";
import type { ILink, ILinkProvider, Terminal } from "@xterm/xterm";

describe("xterm web-links addon contract", () => {
  it("detects HTTP links without enclosing trailing punctuation", () => {
    const { links } = detectLinks(
      "See https://example.com/docs, then (http://localhost:3000/path). Ignore ftp://example.com."
    );

    assert.deepEqual(links.map(({ text }) => text), [
      "https://example.com/docs",
      "http://localhost:3000/path"
    ]);
  });

  it("uses the injected activation handler and disposes its link provider", () => {
    const activations: string[] = [];
    const { addon, links, providerDisposed } = detectLinks(
      "https://example.com/claude",
      (_event, uri) => activations.push(uri)
    );
    const event = {} as MouseEvent;

    links[0]?.activate(event, links[0]?.text ?? "");
    addon.dispose();

    assert.deepEqual(activations, ["https://example.com/claude"]);
    assert.equal(providerDisposed(), true);
  });
});

/** Activates the public addon against the smallest ASCII terminal buffer contract it consumes. */
function detectLinks(
  text: string,
  handler: (event: MouseEvent, uri: string) => void = () => undefined
): {
  readonly addon: WebLinksAddon;
  readonly links: readonly ILink[];
  readonly providerDisposed: () => boolean;
} {
  let provider: ILinkProvider | undefined;
  let disposed = false;
  const cell = {
    character: "",
    getChars() { return this.character; },
    getWidth() { return 1; }
  };
  const line = {
    isWrapped: false,
    length: text.length,
    translateToString: () => text,
    getCell(index: number, target: typeof cell) {
      target.character = text[index] ?? "";
      return target;
    }
  };
  const terminal = {
    buffer: {
      active: {
        getLine: (index: number) => index === 0 ? line : undefined,
        getNullCell: () => cell
      }
    },
    registerLinkProvider(candidate: ILinkProvider) {
      provider = candidate;
      return { dispose: () => { disposed = true; } };
    }
  } as unknown as Terminal;
  const addon = new WebLinksAddon(handler);
  addon.activate(terminal);
  assert.ok(provider, "web-links addon did not register a provider");
  let links: readonly ILink[] = [];
  provider.provideLinks(1, (detected) => { links = detected ?? []; });
  return { addon, links, providerDisposed: () => disposed };
}
