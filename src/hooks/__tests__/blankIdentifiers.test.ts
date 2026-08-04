jest.mock("react", () => ({
  useCallback: <T>(callback: T) => callback,
  useEffect: (effect: () => void | (() => void)) => {
    effect();
  },
  useRef: <T>(value: T) => ({ current: value }),
  useState: <T>(value: T | (() => T)) => [
    typeof value === "function" ? (value as () => T)() : value,
    jest.fn(),
  ],
}));

import { useInterstitialAd } from "../useInterstitialAd";
import { useRewardedAd } from "../useRewardedAd";
import { NativeModules } from "../../test/reactNativeMock";
import { nonBlankStringOrUndefined } from "../../internal/identifiers";

describe("ad hooks with blank identifiers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not create native instances or throw", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(() => useInterstitialAd(" \t ")).not.toThrow();
    expect(() => useRewardedAd("")).not.toThrow();

    expect(NativeModules.SimulaAdsModule.createInterstitial).not.toHaveBeenCalled();
    expect(NativeModules.SimulaAdsModule.createRewarded).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("normalizes blank preload identifiers to an omitted hint", () => {
    expect(nonBlankStringOrUndefined("")).toBeUndefined();
    expect(nonBlankStringOrUndefined(" \t ")).toBeUndefined();
    expect(nonBlankStringOrUndefined("preloaded_1")).toBe("preloaded_1");
  });

  it("exposes one callable metadata setter with both overloads", () => {
    const interstitial = useInterstitialAd("interstitial");
    const rewarded = useRewardedAd("rewarded");
    const native = NativeModules.SimulaAdsModule;
    const interstitialId = native.createInterstitial.mock.calls[0][0];
    const rewardedId = native.createRewarded.mock.calls[0][0];

    interstitial.setMetadata("page_name", "Search");
    interstitial.setMetadata({ experiment: "variant_b" });
    rewarded.setMetadata("reward", "coins");
    rewarded.setMetadata({ source: "daily" });

    expect(native.setMetadataValue).toHaveBeenNthCalledWith(
      1,
      interstitialId,
      "page_name",
      "Search",
    );
    expect(native.setMetadata).toHaveBeenNthCalledWith(
      1,
      interstitialId,
      '{"experiment":"variant_b"}',
    );
    expect(native.setMetadataValue).toHaveBeenNthCalledWith(
      2,
      rewardedId,
      "reward",
      "coins",
    );
    expect(native.setMetadata).toHaveBeenNthCalledWith(
      2,
      rewardedId,
      '{"source":"daily"}',
    );
  });

  it("does not turn malformed key/value calls into bulk metadata clears", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const interstitial = useInterstitialAd("interstitial");
    const rewarded = useRewardedAd("rewarded");
    const native = NativeModules.SimulaAdsModule;

    interstitial.setMetadata(null as never, "value");
    rewarded.setMetadata(undefined as never, "value");
    interstitial.setMetadata(null as never, undefined as never);

    expect(native.setMetadataValue).not.toHaveBeenCalled();
    expect(native.setMetadata).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });
});
