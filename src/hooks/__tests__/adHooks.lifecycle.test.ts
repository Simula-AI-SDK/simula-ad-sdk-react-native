import React from "react";
import { useInterstitialAd, UseInterstitialAd } from "../useInterstitialAd";
import { useRewardedAd, UseRewardedAd } from "../useRewardedAd";
import { AD_EVENT_NAME } from "../../internal/nativeModules";
import {
  NativeModules,
  __emit,
  __listenerCount,
  __reset,
} from "../../test/reactNativeMock";
import { mount, runInAct } from "../../test/reactHarness";

const native = NativeModules.SimulaAdsModule;

beforeEach(() => {
  __reset();
  jest.clearAllMocks();
});

afterEach(() => {
  __reset();
});

describe("ad hook lifecycle", () => {
  it("clears a display error after an interstitial retry succeeds", async () => {
    let latest: UseInterstitialAd | undefined;
    function Probe(): null {
      latest = useInterstitialAd("interstitial");
      return null;
    }

    const tree = await mount(React.createElement(Probe));
    const instanceId = native.createInterstitial.mock.calls[0][0];
    await runInAct(() => {
      __emit(AD_EVENT_NAME, {
        instanceId,
        adType: "interstitial",
        type: "LOADED",
      });
      __emit(AD_EVENT_NAME, {
        instanceId,
        adType: "interstitial",
        type: "DISPLAY_FAILED",
        code: "no_presentation_context",
        message: "No scene",
      });
    });
    expect(latest?.isLoaded).toBe(true);
    expect(latest?.error?.code).toBe("no_presentation_context");

    latest?.show();
    await runInAct(() => {
      __emit(AD_EVENT_NAME, {
        instanceId,
        adType: "interstitial",
        type: "DISPLAYED",
      });
    });
    expect(native.showAd).toHaveBeenCalledWith(instanceId);
    expect(latest?.error).toBeUndefined();

    await tree.unmount();
    expect(native.destroyAd).toHaveBeenCalledWith(instanceId);
    expect(__listenerCount(AD_EVENT_NAME)).toBe(0);
  });

  it("clears verification failure when rewarded verification succeeds", async () => {
    let latest: UseRewardedAd | undefined;
    function Probe(): null {
      latest = useRewardedAd("rewarded");
      return null;
    }

    const tree = await mount(React.createElement(Probe));
    const instanceId = native.createRewarded.mock.calls[0][0];
    await runInAct(() => {
      __emit(AD_EVENT_NAME, {
        instanceId,
        adType: "rewarded",
        type: "REWARD_VERIFICATION_FAILED",
        code: "network",
        message: "offline",
      });
    });
    expect(latest?.error?.code).toBe("network");

    await runInAct(() => {
      __emit(AD_EVENT_NAME, {
        instanceId,
        adType: "rewarded",
        type: "REWARD_VERIFIED",
        token: "reward-token",
      });
    });
    expect(latest?.rewardVerified).toBe(true);
    expect(latest?.rewardToken).toBe("reward-token");
    expect(latest?.error).toBeUndefined();
    await tree.unmount();
  });

  it("does not let late verification success clear a newer display error", async () => {
    let latest: UseRewardedAd | undefined;
    function Probe(): null {
      latest = useRewardedAd("rewarded");
      return null;
    }

    const tree = await mount(React.createElement(Probe));
    const instanceId = native.createRewarded.mock.calls[0][0];
    await runInAct(() => {
      __emit(AD_EVENT_NAME, {
        instanceId,
        adType: "rewarded",
        type: "REWARD_VERIFICATION_FAILED",
        code: "network",
        message: "verification offline",
      });
      __emit(AD_EVENT_NAME, {
        instanceId,
        adType: "rewarded",
        type: "DISPLAY_FAILED",
        code: "not_ready",
        message: "new ad is not ready",
      });
      __emit(AD_EVENT_NAME, {
        instanceId,
        adType: "rewarded",
        type: "REWARD_VERIFIED",
        token: "old-impression-token",
      });
    });

    expect(latest?.rewardVerified).toBe(true);
    expect(latest?.error).toEqual({
      code: "not_ready",
      message: "new ad is not ready",
    });
    await tree.unmount();
  });

  it("replaces an adUnitId, destroys the old ad, and drops its late events", async () => {
    let latest: UseInterstitialAd | undefined;
    function Probe({ adUnitId }: { adUnitId: string }): null {
      latest = useInterstitialAd(adUnitId);
      return null;
    }

    const tree = await mount(React.createElement(Probe, { adUnitId: "first" }));
    const firstId = native.createInterstitial.mock.calls[0][0];
    await tree.update(React.createElement(Probe, { adUnitId: "second" }));
    const secondId = native.createInterstitial.mock.calls[1][0];

    expect(native.destroyAd).toHaveBeenCalledWith(firstId);
    await runInAct(() => {
      __emit(AD_EVENT_NAME, {
        instanceId: firstId,
        adType: "interstitial",
        type: "LOADED",
      });
    });
    expect(latest?.isLoaded).toBe(false);

    await runInAct(() => {
      __emit(AD_EVENT_NAME, {
        instanceId: secondId,
        adType: "interstitial",
        type: "LOADED",
      });
    });
    expect(latest?.isLoaded).toBe(true);
    await tree.unmount();
    expect(native.destroyAd).toHaveBeenCalledWith(secondId);
  });

  it("keeps concurrent interstitial and rewarded hooks isolated", async () => {
    let interstitial: UseInterstitialAd | undefined;
    let rewarded: UseRewardedAd | undefined;
    function Probe(): null {
      interstitial = useInterstitialAd("interstitial");
      rewarded = useRewardedAd("rewarded");
      return null;
    }

    const tree = await mount(React.createElement(Probe));
    const interstitialId = native.createInterstitial.mock.calls[0][0];
    const rewardedId = native.createRewarded.mock.calls[0][0];
    await runInAct(() => {
      __emit(AD_EVENT_NAME, {
        instanceId: rewardedId,
        adType: "rewarded",
        type: "LOADED",
      });
    });
    expect(rewarded?.isLoaded).toBe(true);
    expect(interstitial?.isLoaded).toBe(false);

    interstitial?.load();
    rewarded?.show();
    expect(native.loadAd.mock.calls.at(-1)?.[0]).toBe(interstitialId);
    expect(native.showAd.mock.calls.at(-1)?.[0]).toBe(rewardedId);
    await tree.unmount();
  });
});
