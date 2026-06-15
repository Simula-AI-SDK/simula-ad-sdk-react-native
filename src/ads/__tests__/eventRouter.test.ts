import { registerInstance, __instanceCount } from "../eventRouter";
import { AD_EVENT_NAME } from "../../internal/nativeModules";
import { __emit, __listenerCount, __reset } from "../../test/reactNativeMock";
import { SimulaAdEvent } from "../types";

afterEach(() => {
  __reset();
});

describe("eventRouter", () => {
  it("routes an event to the matching instance only", () => {
    const a: SimulaAdEvent[] = [];
    const b: SimulaAdEvent[] = [];
    const offA = registerInstance("int_a", (e) => a.push(e));
    const offB = registerInstance("int_b", (e) => b.push(e));

    __emit(AD_EVENT_NAME, { instanceId: "int_a", adType: "interstitial", type: "LOADED" });

    expect(a).toHaveLength(1);
    expect(a[0].type).toBe("LOADED");
    expect(b).toHaveLength(0);

    offA();
    offB();
  });

  it("drops events for unknown / unregistered instances", () => {
    const seen: SimulaAdEvent[] = [];
    const off = registerInstance("int_live", (e) => seen.push(e));

    __emit(AD_EVENT_NAME, { instanceId: "ghost", adType: "interstitial", type: "CLOSED" });
    expect(seen).toHaveLength(0);

    off();
    // After unregister, further events for that id are dropped too.
    __emit(AD_EVENT_NAME, { instanceId: "int_live", adType: "interstitial", type: "LOADED" });
    expect(seen).toHaveLength(0);
  });

  it("maps error events into a structured error with retryInSeconds", () => {
    let received: SimulaAdEvent | undefined;
    const off = registerInstance("int_err", (e) => {
      received = e;
    });

    __emit(AD_EVENT_NAME, {
      instanceId: "int_err",
      adType: "interstitial",
      type: "LOAD_FAILED",
      code: "duplicate_request",
      message: "load() again in 42 seconds.",
      retryInSeconds: 42,
    });

    expect(received?.error).toEqual({
      code: "duplicate_request",
      message: "load() again in 42 seconds.",
      retryInSeconds: 42,
    });
    off();
  });

  it("preserves an explicit null reward token (idempotent re-verify)", () => {
    let received: SimulaAdEvent | undefined;
    const off = registerInstance("rew_1", (e) => {
      if (e.type === "REWARD_VERIFIED") received = e;
    });

    __emit(AD_EVENT_NAME, {
      instanceId: "rew_1",
      adType: "rewarded",
      type: "REWARD_VERIFIED",
      token: null,
    });

    expect(received).toBeDefined();
    expect(received?.rewardToken).toBeNull();
    off();
  });

  it("keeps a single native subscription and tears it down when idle", () => {
    expect(__listenerCount(AD_EVENT_NAME)).toBe(0);
    const off1 = registerInstance("a", () => {});
    const off2 = registerInstance("b", () => {});
    // One shared subscription regardless of instance count.
    expect(__listenerCount(AD_EVENT_NAME)).toBe(1);
    expect(__instanceCount()).toBe(2);

    off1();
    expect(__listenerCount(AD_EVENT_NAME)).toBe(1);
    off2();
    // No instances left → subscription removed.
    expect(__listenerCount(AD_EVENT_NAME)).toBe(0);
    expect(__instanceCount()).toBe(0);
  });
});
