import type { Timestamp } from "./model";

const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-])(\d{2}):(\d{2})$/;

/** Whether text is a stored time: ISO 8601 local time with UTC offset, to the second, and a real date. */
export function isTimestamp(text: string): text is Timestamp {
  const m = TIMESTAMP.exec(text);
  if (!m) {
    return false;
  }
  const [year, month, day, hour, minute, second, , offsetHours, offsetMinutes] = m.slice(1).map(Number) as number[];
  const daysInMonth = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  return (
    month! >= 1 &&
    month! <= 12 &&
    day! >= 1 &&
    day! <= daysInMonth &&
    hour! <= 23 &&
    minute! <= 59 &&
    second! <= 59 &&
    offsetHours! <= 14 &&
    offsetMinutes! <= 59
  );
}
