export const LOG_LEVELS = ["off", "error", "warn", "info", "debug", "trace"] as const;

export type LogLevel = typeof LOG_LEVELS[number];
export type EventLogLevel = Exclude<LogLevel, "off">;

/** Parses the closed diagnostic-level setting with the manifest's safe default. */
export function parseLogLevel(value: unknown): LogLevel {
  return typeof value === "string" && LOG_LEVELS.includes(value as LogLevel) ? value as LogLevel : "info";
}

/** Returns whether the configured threshold permits a record at the event level. */
export function shouldLog(configured: LogLevel, eventLevel: EventLogLevel): boolean {
  return configured !== "off" && LOG_LEVELS.indexOf(eventLevel) <= LOG_LEVELS.indexOf(configured);
}
