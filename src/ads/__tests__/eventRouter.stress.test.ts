import { registerInstance, __instanceCount } from "../eventRouter";
import { SimulaInterstitialAd } from "../SimulaInterstitialAd";
import { SimulaRewardedAd } from "../SimulaRewardedAd";
import { AD_EVENT_NAME } from "../../internal/nativeModules";
import {
  NativeModules,
  __emit,
  __listenerCount,
  __reset,
} from "../../test/reactNativeMock";

const native = NativeModules.SimulaAdsModule;

beforeEach(() => {
  __reset();
  jest.clearAllMocks();
});

afterEach(() => {
  expect(__instanceCount()).toBe(0);
  expect(__listenerCount(AD_EVENT_NAME)).toBe(0);
  __reset();
});

describe("event router stress and reload safety", () => {
  it("does not let an old unregister remove a replacement handler", () => {
    const oldHandler = jest.fn();
    const replacement = jest.fn();
    const offOld = registerInstance("shared", oldHandler);
    const offReplacement = registerInstance("shared", replacement);

    offOld();
    __emit(AD_EVENT_NAME, {
      instanceId: "shared",
      adType: "interstitial",
      type: "LOADED",
    });

    expect(oldHandler).not.toHaveBeenCalled();
    expect(replacement).toHaveBeenCalledTimes(1);
    offOld();
    offReplacement();
  });

  it("routes 500 mixed instances through one subscription and cleans up", () => {
    const ads = Array.from({ length: 500 }, (_, index) =>
      index % 2 === 0
        ? SimulaInterstitialAd.create(`interstitial_${index}`)
        : SimulaRewardedAd.create(`rewarded_${index}`),
    );
    const ids = [
      ...native.createInterstitial.mock.calls,
      ...native.createRewarded.mock.calls,
    ].map(([instanceId]: [string]) => instanceId);
    const seen = new Map<string, jest.Mock>();

    ads.forEach((ad, index) => {
      const instanceId =
        index % 2 === 0
          ? native.createInterstitial.mock.calls[index / 2][0]
          : native.createRewarded.mock.calls[(index - 1) / 2][0];
      const listener = jest.fn();
      seen.set(instanceId, listener);
      ad.addAdEventsListener(listener);
    });

    expect(new Set(ids).size).toBe(500);
    expect(__instanceCount()).toBe(500);
    expect(__listenerCount(AD_EVENT_NAME)).toBe(1);

    for (const instanceId of [...ids].reverse()) {
      __emit(AD_EVENT_NAME, {
        instanceId,
        adType: instanceId.startsWith("int_") ? "interstitial" : "rewarded",
        type: "LOADED",
      });
    }
    for (const listener of seen.values()) expect(listener).toHaveBeenCalledTimes(1);

    ads.forEach((ad) => ad.destroy());
    expect(native.destroyAd).toHaveBeenCalledTimes(500);

    for (const instanceId of ids) {
      __emit(AD_EVENT_NAME, {
        instanceId,
        adType: "interstitial",
        type: "CLOSED",
      });
    }
    for (const listener of seen.values()) expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps live isolated module evaluations on one process-wide router", () => {
    const ids: string[] = [];
    const ads: Array<{ destroy(): void; addAdEventsListener(listener: jest.Mock): () => void }> = [];
    const listeners = [jest.fn(), jest.fn()];
    let firstMock: typeof import("../../test/reactNativeMock") | undefined;

    for (let generation = 0; generation < 2; generation += 1) {
      jest.isolateModules(() => {
        const isolatedMock = require("../../test/reactNativeMock") as typeof import("../../test/reactNativeMock");
        const IsolatedAd = (require("../SimulaInterstitialAd") as typeof import("../SimulaInterstitialAd"))
          .SimulaInterstitialAd;
        const ad = IsolatedAd.create(`reload_${generation}`);
        if (generation === 0) firstMock = isolatedMock;
        ids.push(
          isolatedMock.NativeModules.SimulaAdsModule.createInterstitial.mock.calls[0][0],
        );
        ad.addAdEventsListener(listeners[generation]);
        ads.push(ad);
      });
    }

    expect(ids[0]).not.toBe(ids[1]);
    expect(firstMock?.__listenerCount(AD_EVENT_NAME)).toBe(1);
    firstMock?.__emit(AD_EVENT_NAME, {
      instanceId: ids[1],
      adType: "interstitial",
      type: "LOADED",
    });
    expect(listeners[0]).not.toHaveBeenCalled();
    expect(listeners[1]).toHaveBeenCalledTimes(1);
    ads.forEach((ad) => ad.destroy());
    expect(firstMock?.__listenerCount(AD_EVENT_NAME)).toBe(0);
  });
});
