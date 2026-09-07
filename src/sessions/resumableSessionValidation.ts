const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RFC3339_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/;

/** Accepts only canonical lower-case RFC 4122 session identities. */
export function isCanonicalUuid(value: unknown): value is string {
  return typeof value === "string" && CANONICAL_UUID_PATTERN.test(value);
}

/** Accepts canonical RFC 3339 timestamps whose Gregorian calendar day exists. */
export function isCalendarValidRfc3339Timestamp(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const match = RFC3339_TIMESTAMP_PATTERN.exec(value);
  if (match === null) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[7] === undefined ? 0 : Number(match[7]);
  const offsetMinute = match[8] === undefined ? 0 : Number(match[8]);
  // Leap-second :60 is unsupported because persisted timestamps are ordered as JS Date instants.
  if (
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return false;
  }
  if (!Number.isFinite(Date.parse(value))) {
    return false;
  }
  const februaryDays = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  const daysInMonth = [31, februaryDays, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return daysInMonth !== undefined && day >= 1 && day <= daysInMonth;
}
