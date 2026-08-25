import { SimulaInterstitialAd } from "../SimulaInterstitialAd";
import { SimulaRewardedAd } from "../SimulaRewardedAd";
import { SimulaAdEventType } from "../types";
import { AD_EVENT_NAME } from "../../internal/nativeModules";
import {
  NativeModules,
  __emit,
  __listenerCount,
  __reset,
} from "../../test/reactNativeMock";

const native = NativeModules.SimulaAdsModule;

beforeEach(() => {
  jest.clearAllMocks();
});
afterEach(() => {
  __reset();
});

describe("SimulaInterstitialAd", () => {
  it.each([null, undefined, 1, "", "   "])(
    "ignores invalid adUnitId %p without creating native instances",
    (adUnitId) => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
      let ad: SimulaInterstitialAd | undefined;
      expect(() => {
        ad = SimulaInterstitialAd.create(adUnitId as never);
      }).not.toThrow();
      ad?.load();
      ad?.show();
      ad?.setMetadata("key", "value");
      ad?.setMetadata({ key: "value" });
      ad?.destroy();
      expect(native.createInterstitial).not.toHaveBeenCalled();
      expect(native.loadAd).not.toHaveBeenCalled();
      expect(native.showAd).not.toHaveBeenCalled();
      expect(native.setMetadataValue).not.toHaveBeenCalled();
      expect(native.setMetadata).not.toHaveBeenCalled();
      expect(native.destroyAd).not.toHaveBeenCalled();
      warn.mockRestore();
    },
  );

  it("creates a native instance with a unique id", () => {
    const a = SimulaInterstitialAd.create("unit_a");
    const b = SimulaInterstitialAd.create("unit_b");
    expect(native.createInterstitial).toHaveBeenCalledTimes(2);
    const idA = native.createInterstitial.mock.calls[0][0];
    const idB = native.createInterstitial.mock.calls[1][0];
    expect(idA).not.toEqual(idB);
    a.destroy();
    b.destroy();
  });

  it("forwards load() with null-filled char options", () => {
    const ad = SimulaInterstitialAd.create("unit");
    const instanceId = native.createInterstitial.mock.calls[0][0];
    ad.load({ charId: "c1" });
    expect(native.loadAd).toHaveBeenCalledWith(instanceId, {
      charId: "c1",
      charName: null,
      charImage: null,
      charDesc: null,
    });
    ad.destroy();
  });

  it("routes single upserts and deterministic bulk replacements", () => {
    const ad = SimulaInterstitialAd.create("unit");
    const instanceId = native.createInterstitial.mock.calls[0][0];

    ad.setMetadata("experiment", "variant_b");
    ad.setMetadata({ z: "last", a: "first" });
    ad.setMetadata({});

    expect(native.setMetadataValue).toHaveBeenCalledWith(
      instanceId,
      "experiment",
      "variant_b",
    );
    expect(native.setMetadata).toHaveBeenNthCalledWith(
      1,
      instanceId,
      '{"a":"first","z":"last"}',
    );
    expect(native.setMetadata).toHaveBeenNthCalledWith(
      2,
      instanceId,
      "{}",
    );
    ad.destroy();
  });

  it("drops empty metadata keys and invalid runtime values before native", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const ad = SimulaInterstitialAd.create("unit");
    const instanceId = native.createInterstitial.mock.calls[0][0];

    ad.setMetadata("", "value");
    ad.setMetadata(null as never, "value");
    ad.setMetadata("key", undefined as never);

    expect(native.setMetadataValue).not.toHaveBeenCalled();
    expect(instanceId).toEqual(expect.any(String));
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
    ad.destroy();
  });

  it("routes events to listeners and maintains the loaded mirror", () => {
    const ad = SimulaInterstitialAd.create("unit");
    const instanceId = native.createInterstitial.mock.calls[0][0];
    const loaded = jest.fn();
    const off = ad.addAdEventListener(SimulaAdEventType.LOADED, loaded);

    expect(ad.loaded).toBe(false);
    __emit(AD_EVENT_NAME, { instanceId, adType: "interstitial", type: "LOADED" });
    expect(loaded).toHaveBeenCalledTimes(1);
    expect(ad.loaded).toBe(true);

    // A normal show → close cycle consumes the loaded ad.
    __emit(AD_EVENT_NAME, { instanceId, adType: "interstitial", type: "DISPLAYED" });
    __emit(AD_EVENT_NAME, { instanceId, adType: "interstitial", type: "CLOSED" });
    expect(ad.loaded).toBe(false);

    off();
    __emit(AD_EVENT_NAME, { instanceId, adType: "interstitial", type: "LOADED" });
    expect(loaded).toHaveBeenCalledTimes(1); // unsubscribed
    ad.destroy();
  });

  it("fans repeated JS listeners out through one native subscription", () => {
    const ad = SimulaInterstitialAd.create("unit");
    const instanceId = native.createInterstitial.mock.calls[0][0];
    const listeners = Array.from({ length: 100 }, () => jest.fn());
    const unsubscribe = listeners.map((listener) =>
      ad.addAdEventListener(SimulaAdEventType.CLICKED, listener),
    );

    expect(__listenerCount(AD_EVENT_NAME)).toBe(1);
    __emit(AD_EVENT_NAME, {
      instanceId,
      adType: "interstitial",
      type: "CLICKED",
    });
    for (const listener of listeners) expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe.forEach((off) => off());
    expect(__listenerCount(AD_EVENT_NAME)).toBe(1);
    ad.destroy();
    expect(__listenerCount(AD_EVENT_NAME)).toBe(0);
  });

  it("keeps the loaded mirror when native still holds a ready ad", () => {
    const ad = SimulaInterstitialAd.create("unit");
    const instanceId = native.createInterstitial.mock.calls[0][0];

    // Show unit 1, then the native auto-preload delivers the NEXT ad's LOADED while
    // unit 1 (e.g. its end screens) is still on screen — the later CLOSED refers to
    // the shown unit and must not clobber the ready ad's mirror.
    __emit(AD_EVENT_NAME, { instanceId, adType: "interstitial", type: "LOADED" });
    __emit(AD_EVENT_NAME, { instanceId, adType: "interstitial", type: "DISPLAYED" });
    __emit(AD_EVENT_NAME, { instanceId, adType: "interstitial", type: "LOADED" });
    __emit(AD_EVENT_NAME, { instanceId, adType: "interstitial", type: "CLOSED" });
    expect(ad.loaded).toBe(true);

    // duplicate_request rejects the redundant load() call, not the held ad.
    __emit(AD_EVENT_NAME, {
      instanceId,
      adType: "interstitial",
      type: "LOAD_FAILED",
      code: "duplicate_request",
      message: "An ad is already loaded. You can call load() again in 30 seconds.",
    });
    expect(ad.loaded).toBe(true);

    // no_presentation_context keeps the loaded ad natively (show() can be retried).
    __emit(AD_EVENT_NAME, {
      instanceId,
      adType: "interstitial",
      type: "DISPLAY_FAILED",
      code: "no_presentation_context",
      message: "No window scene.",
    });
    expect(ad.loaded).toBe(true);

    // A genuine load failure clears the mirror.
    __emit(AD_EVENT_NAME, {
      instanceId,
      adType: "interstitial",
      type: "LOAD_FAILED",
      code: "network",
      message: "HTTP 500",
    });
    expect(ad.loaded).toBe(false);
    ad.destroy();
  });

  it("stops delivering after destroy() and calls native destroyAd", () => {
    const ad = SimulaInterstitialAd.create("unit");
    const instanceId = native.createInterstitial.mock.calls[0][0];
    const seen = jest.fn();
    ad.addAdEventsListener(seen);

    ad.destroy();
    expect(native.destroyAd).toHaveBeenCalledWith(instanceId);

    __emit(AD_EVENT_NAME, { instanceId, adType: "interstitial", type: "LOADED" });
    expect(seen).not.toHaveBeenCalled();
  });

  it("ignores load()/show()/metadata setters after destroy()", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const ad = SimulaInterstitialAd.create("unit");
    ad.destroy();
    ad.load();
    ad.show();
    ad.setMetadata("key", "value");
    ad.setMetadata({ key: "value" });
    expect(native.loadAd).not.toHaveBeenCalled();
    expect(native.showAd).not.toHaveBeenCalled();
    expect(native.setMetadataValue).not.toHaveBeenCalled();
    expect(native.setMetadata).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(4);
    warn.mockRestore();
  });
});

describe("SimulaRewardedAd", () => {
  it("ignores an invalid adUnitId without creating a native instance", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    let ad: SimulaRewardedAd | undefined;
    expect(() => {
      ad = SimulaRewardedAd.create(" ");
    }).not.toThrow();
    ad?.load();
    ad?.show();
    ad?.setMetadata("key", "value");
    ad?.destroy();
    expect(native.createRewarded).not.toHaveBeenCalled();
    expect(native.loadAd).not.toHaveBeenCalled();
    expect(native.showAd).not.toHaveBeenCalled();
    expect(native.setMetadataValue).not.toHaveBeenCalled();
    expect(native.destroyAd).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("creates a rewarded ad for the placement", () => {
    const ad = SimulaRewardedAd.create("reward");
    expect(native.createRewarded).toHaveBeenCalledWith(
      expect.any(String),
      "reward",
    );
    ad.destroy();
  });

  it("routes inherited metadata setters to the rewarded native instance", () => {
    const ad = SimulaRewardedAd.create("reward");
    const instanceId = native.createRewarded.mock.calls[0][0];

    ad.setMetadata("reward", "coins");
    ad.setMetadata({ reward: "coins", source: "daily" });

    expect(native.setMetadataValue).toHaveBeenCalledWith(
      instanceId,
      "reward",
      "coins",
    );
    expect(native.setMetadata).toHaveBeenCalledWith(
      instanceId,
      '{"reward":"coins","source":"daily"}',
    );
    ad.destroy();
  });

  it("delivers reward verification events", () => {
    const ad = SimulaRewardedAd.create("reward");
    const instanceId = native.createRewarded.mock.calls[0][0];
    const events: string[] = [];
    let token: string | null | undefined;
    ad.addAdEventsListener((e) => {
      events.push(e.type as string);
      if (e.type === "REWARD_VERIFIED") token = e.rewardToken;
    });

    __emit(AD_EVENT_NAME, { instanceId, adType: "rewarded", type: "EARNED_REWARD" });
    __emit(AD_EVENT_NAME, {
      instanceId,
      adType: "rewarded",
      type: "REWARD_VERIFIED",
      token: "tok_abc",
    });

    expect(events).toEqual(["EARNED_REWARD", "REWARD_VERIFIED"]);
    expect(token).toBe("tok_abc");
    ad.destroy();
  });
});
