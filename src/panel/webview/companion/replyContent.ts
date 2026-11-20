import type { CompanionGroup, CompanionNode, CompanionTarget } from "../../../companion/companionTypes";

interface ReplyContentOptions {
  readonly renderTarget: (target: CompanionTarget) => HTMLElement;
  readonly openLink?: (href: string) => void;
}

/** Render verified reply nodes and place each action on its smallest containing source span. */
export function renderReplyContent(
  container: HTMLElement,
  group: Pick<CompanionGroup, "sourceText" | "nodes" | "targets">,
  options: ReplyContentOptions
): void {
  const document = container.ownerDocument;
  const targetsByNode = new Map<string, CompanionTarget[]>();
  const owner = (nodes: readonly CompanionNode[], target: CompanionTarget): string | undefined => {
    let nodeId: string | undefined;
    for (const node of nodes) {
      const span = node.sourceSpan;
      if (span && span.start <= target.sourceStart && span.end >= target.sourceEnd) {
        nodeId = ("children" in node ? owner(node.children, target) : undefined) ?? node.nodeId;
      }
    }
    return nodeId;
  };
  for (const target of group.targets) {
    const nodeId = owner(group.nodes, target);
    if (nodeId === undefined) continue;
    const related = targetsByNode.get(nodeId) ?? [];
    related.push(target);
    targetsByNode.set(nodeId, related);
  }

  const element = (tag: string, className?: string): HTMLElement => {
    const result = document.createElement(tag);
    if (className) result.className = className;
    return result;
  };
  const renderNode = (node: CompanionNode): Node => {
    let result: HTMLElement;
    switch (node.kind) {
      case "text":
        result = element("span");
        result.textContent = node.text;
        break;
      case "code": {
        result = element(node.block ? "pre" : "span", node.block ? "companion-code-block" : "companion-code-inline");
        const code = element("code");
        code.textContent = node.text;
        result.append(code);
        break;
      }
      case "softBreak": return document.createTextNode("\n");
      case "hardBreak": return element("br");
      case "thematicBreak": return element("hr");
      case "imagePlaceholder":
        result = element("span", "companion-image-placeholder");
        result.textContent = "[Image: " + node.alt + "]";
        break;
      case "notice":
        result = element("p", "companion-notice");
        result.textContent = node.text;
        break;
      case "link": {
        const openLink = options.openLink;
        result = element(openLink ? "a" : "span");
        const href = node.href;
        if (openLink && href) {
          result.setAttribute("href", href);
          result.addEventListener("click", event => {
            event.preventDefault();
            openLink(href);
          });
        }
        for (const child of node.children) result.append(renderNode(child));
        break;
      }
      default: {
        const tag = node.kind === "heading" ? `h${node.level}` : node.kind === "list" ? (node.ordered ? "ol" : "ul") :
          { paragraph: "p", emphasis: "em", strong: "strong", blockquote: "blockquote", listItem: "li" }[node.kind];
        result = element(tag);
        if (node.kind === "list" && node.ordered && node.startNumber !== null) {
          result.setAttribute("start", String(node.startNumber));
        }
        for (const child of node.children) result.append(renderNode(child));
      }
    }
    result.dataset.nodeId = node.nodeId;
    const targets = targetsByNode.get(node.nodeId)?.sort((left, right) => left.sourceEnd - right.sourceEnd) ?? [];
    if (node.kind === "text" && node.sourceSpan && node.text === group.sourceText.slice(node.sourceSpan.start, node.sourceSpan.end) && targets.length > 0) {
      result.replaceChildren();
      let offset = 0;
      for (const target of targets) {
        const end = target.sourceEnd - node.sourceSpan.start;
        result.append(document.createTextNode(node.text.slice(offset, end)), options.renderTarget(target));
        offset = end;
      }
      result.append(document.createTextNode(node.text.slice(offset)));
    } else {
      for (const target of targets) {
        if (target.kind !== "path") {
          const label = element("span", "companion-target-label");
          label.textContent = target.displayLabel;
          result.append(label);
        }
        result.append(options.renderTarget(target));
      }
    }
    return result;
  };

  const rawFallback = group.targets.length === 0 && group.nodes.some(node => node.kind === "notice" && node.reason === "UNSUPPORTED_CONTENT");
  for (const node of group.nodes) {
    const rendered = renderNode(node);
    // A lone CR renders as a space in this context. Normalize the displayed fallback only.
    if (rawFallback && node.kind === "text" && node.text === group.sourceText) {
      rendered.textContent = node.text.replace(/\r(?!\n)/g, "\n");
    }
    container.append(rendered);
  }
}
