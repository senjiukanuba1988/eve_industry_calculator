import { oneAtATime } from "./oneAtATime";

describe("oneAtATime", () => {
  it("runs calls one after another, never overlapping", async () => {
    const log: string[] = [];
    let n = 0;
    const task = oneAtATime(async () => {
      const id = ++n;
      log.push(`start ${id}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      log.push(`end ${id}`);
      return id;
    });
    expect(await Promise.all([task(), task(), task()])).toEqual([1, 2, 3]);
    expect(log).toEqual(["start 1", "end 1", "start 2", "end 2", "start 3", "end 3"]);
  });

  it("carries on after a call fails", async () => {
    let fail = true;
    const task = oneAtATime(async () => {
      if (fail) {
        fail = false;
        throw new Error("boom");
      }
      return "ok";
    });
    await expect(task()).rejects.toThrow("boom");
    expect(await task()).toBe("ok");
  });
});
