import { MAX_DRAFT_UTF8_BYTES } from "../../../composer/composerTypes";
import type MarkdownItConstructor from "markdown-it" with {"resolution-mode":"import"};

// v15's CJS declaration imports ESM types without a resolution mode under Node16.
// Use the supported CJS runtime with its bundled ESM types, keeping full type checking.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MarkdownIt=require("markdown-it") as typeof MarkdownItConstructor;

const markdown=new MarkdownIt({html:false,linkify:false,typographer:false});
/** Preview links always go through the existing host-owned external-link action. */
export function isComposerPreviewLink(uri:string):boolean {
  try {const url=new URL(uri);return (url.protocol==="https:" || url.protocol==="http:") && !url.username && !url.password;}catch{return false;}
}
markdown.validateLink=isComposerPreviewLink;
markdown.renderer.rules.image=(tokens,index)=>`<span class="composer-image-placeholder">[Image: ${markdown.utils.escapeHtml(tokens[index]!.content)}]</span>`;
markdown.renderer.rules.link_open=(tokens,index,options,_environment,renderer)=>{
  tokens[index]!.attrSet("rel","noopener noreferrer");
  return renderer.renderToken(tokens,index,options);
};

/** HTML is disabled; image output is replaced rather than loaded; no Markdown plugins run. */
export function renderComposerMarkdown(text:string):string {
  if(new TextEncoder().encode(text).length>MAX_DRAFT_UTF8_BYTES)return "<p>Preview unavailable for drafts over 1 MiB. Your editable source is retained.</p>";
  return markdown.render(text);
}
