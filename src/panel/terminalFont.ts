import type { TerminalFontMetrics } from "./protocol";

const MINIMUM_FONT_SIZE = 6;
const MAXIMUM_FONT_SIZE = 100;
const MINIMUM_LETTER_SPACING = -5;

/** Raw VS Code configuration values used to derive effective xterm font metrics. */
export interface TerminalFontSettings {
  readonly terminalFontFamily?: string;
  readonly editorFontFamily?: string;
  readonly fontSize?: number;
  readonly letterSpacing?: number;
  readonly lineHeight?: number;
  readonly platform: NodeJS.Platform;
}

/** Mirrors VS Code's normalization before integrated-terminal metrics reach xterm. */
export function resolveTerminalFontMetrics(settings: TerminalFontSettings): TerminalFontMetrics {
  const configuredFamily = settings.terminalFontFamily?.trim() ||
    settings.editorFontFamily?.trim() ||
    "monospace";
  const genericFallback = `${configuredFamily}, monospace`;
  const fontFamily = settings.platform === "darwin"
    ? `${genericFallback}, AppleBraille`
    : genericFallback;
  const defaultFontSize = settings.platform === "darwin" ? 12 : 14;
  const configuredFontSize = finiteOr(settings.fontSize, defaultFontSize);
  const configuredLetterSpacing = finiteOr(settings.letterSpacing, 0);
  const defaultLineHeight = settings.platform === "linux" ? 1.1 : 1;
  const configuredLineHeight = finiteOr(settings.lineHeight, defaultLineHeight);

  return {
    fontFamily,
    fontSize: Math.min(MAXIMUM_FONT_SIZE, Math.max(MINIMUM_FONT_SIZE, configuredFontSize)),
    letterSpacing: Math.max(Math.floor(configuredLetterSpacing), MINIMUM_LETTER_SPACING),
    lineHeight: Math.max(configuredLineHeight, 1)
  };
}

/** Uses the fallback for absent and non-finite numeric configuration values. */
function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}
