import type { ResumableSessionSnapshot } from "../../sessions/resumableSessionStore";

export function filterResumableSessions(
  sessions: readonly ResumableSessionSnapshot[],
  query: string
): ResumableSessionSnapshot[] {
  const search = normalize(query.trim());
  return sessions.filter(session => [session.displayName, session.rootLabel, session.rootPath]
    .some(value => normalize(value).includes(search)))
    .sort((left, right) => Date.parse(right.lastLaunchedAt) - Date.parse(left.lastLaunchedAt) ||
      left.claudeSessionId.localeCompare(right.claudeSessionId));
}

function normalize(value: string): string {
  return value.toLowerCase().replaceAll("\\", "/");
}
