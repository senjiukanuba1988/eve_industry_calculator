import { isTimestamp, toTimestamp } from "./timestamp";

describe("toTimestamp", () => {
  it("writes the local time with the local offset, to the second", () => {
    const date = new Date(2026, 9, 6, 9, 5, 7);
    const text = toTimestamp(date);
    expect(isTimestamp(text)).toBe(true);
    expect(text.slice(0, 19)).toBe("2026-10-06T09:05:07");
    expect(new Date(text).getTime()).toBe(date.getTime());
  });
});

describe("isTimestamp", () => {
  it.each(["2026-10-04T16:32:05+02:00", "2026-01-31T00:00:00-05:30", "2028-02-29T23:59:59+00:00", "2026-12-31T12:00:00+14:00"])(
    "accepts %s",
    (text) => expect(isTimestamp(text)).toBe(true),
  );

  it.each([
    ["no offset", "2026-10-04T16:32:05"],
    ["UTC as Z", "2026-10-04T16:32:05Z"],
    ["no seconds", "2026-10-04T16:32+02:00"],
    ["fractional seconds", "2026-10-04T16:32:05.123+02:00"],
    ["a space instead of T", "2026-10-04 16:32:05+02:00"],
    ["month 13", "2026-13-04T16:32:05+02:00"],
    ["31 September", "2026-09-31T16:32:05+02:00"],
    ["29 February in a common year", "2026-02-29T16:32:05+02:00"],
    ["hour 24", "2026-10-04T24:00:00+02:00"],
    ["a date only", "2026-10-04"],
  ])("rejects %s", (_, text) => expect(isTimestamp(text)).toBe(false));
});
