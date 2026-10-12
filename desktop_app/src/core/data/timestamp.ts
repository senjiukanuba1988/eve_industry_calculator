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

/** A moment as a stored time: the local time where it happened, with that place's UTC offset, to the second. */
export function toTimestamp(date: Date): Timestamp {
  const two = (n: number) => String(n).padStart(2, "0");
  const offset = -date.getTimezoneOffset();
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  return (
    `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}` +
    `T${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}` +
    `${sign}${two(Math.floor(abs / 60))}:${two(abs % 60)}`
  );
}
