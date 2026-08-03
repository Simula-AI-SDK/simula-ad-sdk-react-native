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

describe("ad hooks with blank identifiers", () => {
  it("does not create native instances or throw", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(() => useInterstitialAd(" \t ")).not.toThrow();
    expect(() => useRewardedAd("")).not.toThrow();

    expect(NativeModules.SimulaAdsModule.createInterstitial).not.toHaveBeenCalled();
    expect(NativeModules.SimulaAdsModule.createRewarded).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
