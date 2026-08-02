import { SimulaInterstitialAd } from "../SimulaInterstitialAd";
import { SimulaRewardedAd } from "../SimulaRewardedAd";
import { SimulaAdEventType } from "../types";
import { AD_EVENT_NAME } from "../../internal/nativeModules";
import { NativeModules, __emit, __reset } from "../../test/reactNativeMock";

const native = NativeModules.SimulaAdsModule;

beforeEach(() => {
  jest.clearAllMocks();
});
afterEach(() => {
  __reset();
});

describe("SimulaInterstitialAd", () => {
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

    ad.setExtraParameter("experiment", "variant_b");
    ad.setExtraParameters({ z: "last", a: "first" });
    ad.setExtraParameters({});

    expect(native.setExtraParameter).toHaveBeenCalledWith(
      instanceId,
      "experiment",
      "variant_b",
    );
    expect(native.setExtraParameters).toHaveBeenNthCalledWith(
      1,
      instanceId,
      '{"a":"first","z":"last"}',
    );
    expect(native.setExtraParameters).toHaveBeenNthCalledWith(
      2,
      instanceId,
      "{}",
    );
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
    ad.setExtraParameter("key", "value");
    ad.setExtraParameters({ key: "value" });
    expect(native.loadAd).not.toHaveBeenCalled();
    expect(native.showAd).not.toHaveBeenCalled();
    expect(native.setExtraParameter).not.toHaveBeenCalled();
    expect(native.setExtraParameters).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("SimulaRewardedAd", () => {
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

    ad.setExtraParameter("reward", "coins");
    ad.setExtraParameters({ reward: "coins", source: "daily" });

    expect(native.setExtraParameter).toHaveBeenCalledWith(
      instanceId,
      "reward",
      "coins",
    );
    expect(native.setExtraParameters).toHaveBeenCalledWith(
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
