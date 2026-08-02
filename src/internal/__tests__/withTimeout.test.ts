import { withTimeout } from "../withTimeout";

describe("withTimeout", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("resolves the native value when it settles before the timeout", async () => {
    const outcome = withTimeout(Promise.resolve("ok"), 5_000, () => "fallback");
    await expect(outcome).resolves.toBe("ok");
  });

  it("resolves the fallback when the native promise never settles", async () => {
    const outcome = withTimeout(new Promise<string>(() => {}), 5_000, () => "fallback");
    jest.advanceTimersByTime(5_000);
    await expect(outcome).resolves.toBe("fallback");
  });

  it("propagates a rejection that lands before the timeout", async () => {
    const outcome = withTimeout(
      Promise.reject(new Error("bridge down")),
      5_000,
      () => "fallback",
    );
    await expect(outcome).rejects.toThrow("bridge down");
  });

  it("clears the timer when the native promise settles first", async () => {
    const outcome = withTimeout(Promise.resolve("ok"), 5_000, () => "fallback");
    await expect(outcome).resolves.toBe("ok");
    expect(jest.getTimerCount()).toBe(0);
  });

  it("a late-settling native promise after the timeout is absorbed without unhandled rejection", async () => {
    let settle: (value: string) => void = () => {};
    const slow = new Promise<string>((resolve) => { settle = resolve; });
    const outcome = withTimeout(slow, 5_000, () => "fallback");
    jest.advanceTimersByTime(5_000);
    await expect(outcome).resolves.toBe("fallback");
    settle("late"); // must not throw or warn
  });

  it("delivers a late result to the cleanup callback exactly once", async () => {
    let settle: (value: string) => void = () => {};
    const slow = new Promise<string>((resolve) => { settle = resolve; });
    const onLateResult = jest.fn();
    const outcome = withTimeout(slow, 5_000, () => "fallback", onLateResult);

    jest.advanceTimersByTime(5_000);
    await expect(outcome).resolves.toBe("fallback");
    settle("late");
    settle("later");
    await Promise.resolve();

    expect(onLateResult).toHaveBeenCalledTimes(1);
    expect(onLateResult).toHaveBeenCalledWith("late");
  });

  it("does not call the late-result callback for an on-time result", async () => {
    const onLateResult = jest.fn();
    await expect(
      withTimeout(Promise.resolve("ok"), 5_000, () => "fallback", onLateResult),
    ).resolves.toBe("ok");
    expect(onLateResult).not.toHaveBeenCalled();
  });
});
