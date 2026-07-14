import {
  forgetNativeAdHeights,
  getLastKnownHeight,
  nativeAdHeightKey,
  rememberHeight,
} from "../heightCache";

describe("nativeAd heightCache", () => {
  beforeEach(() => forgetNativeAdHeights());

  it("builds keys mirroring the native per-slot cache identity", () => {
    expect(nativeAdHeightKey("feed", 3, undefined)).toBe("feed|3|");
    expect(nativeAdHeightKey(undefined, 0, "pre_1")).toBe("|0|pre_1");
  });

  it("remembers and returns the last height per key", () => {
    const key = nativeAdHeightKey("feed", 1, undefined);
    expect(getLastKnownHeight(key)).toBeUndefined();
    rememberHeight(key, 160);
    rememberHeight(key, 312);
    expect(getLastKnownHeight(key)).toBe(312);
  });

  it("escapes '|' in segments so ids can't collide across slots", () => {
    // Without escaping, ("feed|1", 0) and ("feed", 1) would both produce keys
    // starting with "feed|1|0|" / "feed|1|" and prefix-forget would cross-clear.
    expect(nativeAdHeightKey("feed|1", 0, undefined)).not.toBe(
      nativeAdHeightKey("feed", 1, "0"),
    );
    rememberHeight(nativeAdHeightKey("feed|1", 0, undefined), 100);
    rememberHeight(nativeAdHeightKey("feed", 1, undefined), 200);
    forgetNativeAdHeights("feed", 1);
    expect(getLastKnownHeight(nativeAdHeightKey("feed|1", 0, undefined))).toBe(100);
    expect(getLastKnownHeight(nativeAdHeightKey("feed", 1, undefined))).toBeUndefined();
    forgetNativeAdHeights("feed|1", 0);
    expect(
      getLastKnownHeight(nativeAdHeightKey("feed|1", 0, undefined)),
    ).toBeUndefined();
  });

  it("escapes backslashes so escape sequences can't be forged", () => {
    // "feed\" + "|1..." must not collide with the escaped form of "feed|1...".
    rememberHeight(nativeAdHeightKey("feed\\", 0, undefined), 10);
    rememberHeight(nativeAdHeightKey("feed\\|0", 7, undefined), 20);
    forgetNativeAdHeights("feed\\", 0);
    expect(getLastKnownHeight(nativeAdHeightKey("feed\\", 0, undefined))).toBeUndefined();
    expect(getLastKnownHeight(nativeAdHeightKey("feed\\|0", 7, undefined))).toBe(20);
  });

  it("forgets a specific slot (all preload variants) without touching others", () => {
    rememberHeight(nativeAdHeightKey("feed", 1, undefined), 100);
    rememberHeight(nativeAdHeightKey("feed", 1, "pre_1"), 110);
    rememberHeight(nativeAdHeightKey("feed", 2, undefined), 200);
    forgetNativeAdHeights("feed", 1);
    expect(getLastKnownHeight(nativeAdHeightKey("feed", 1, undefined))).toBeUndefined();
    expect(getLastKnownHeight(nativeAdHeightKey("feed", 1, "pre_1"))).toBeUndefined();
    expect(getLastKnownHeight(nativeAdHeightKey("feed", 2, undefined))).toBe(200);
  });

  it("clears everything when called with no arguments", () => {
    rememberHeight(nativeAdHeightKey("a", 0, undefined), 1);
    rememberHeight(nativeAdHeightKey("b", 5, undefined), 2);
    forgetNativeAdHeights();
    expect(getLastKnownHeight(nativeAdHeightKey("a", 0, undefined))).toBeUndefined();
    expect(getLastKnownHeight(nativeAdHeightKey("b", 5, undefined))).toBeUndefined();
  });

  it("evicts the oldest entry beyond the cap", () => {
    for (let i = 0; i < 129; i++) {
      rememberHeight(nativeAdHeightKey("feed", i, undefined), i);
    }
    expect(getLastKnownHeight(nativeAdHeightKey("feed", 0, undefined))).toBeUndefined();
    expect(getLastKnownHeight(nativeAdHeightKey("feed", 128, undefined))).toBe(128);
  });
});
