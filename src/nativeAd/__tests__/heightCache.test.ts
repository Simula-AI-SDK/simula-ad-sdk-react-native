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
