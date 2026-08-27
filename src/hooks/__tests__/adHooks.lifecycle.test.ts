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
  it("tracks clicks per displayed interstitial without resetting for auto-preload or rerenders", async () => {
    let latest: UseInterstitialAd | undefined;
    function Probe({ render }: { render: number }): null {
      void render;
      latest = useInterstitialAd("interstitial");
      return null;
    }

    const tree = await mount(React.createElement(Probe, { render: 0 }));
    const instanceId = native.createInterstitial.mock.calls[0][0];

    await runInAct(() => {
      __emit(AD_EVENT_NAME, {
        instanceId,
        adType: "interstitial",
        type: "DISPLAYED",
      });
      __emit(AD_EVENT_NAME, {
        instanceId,
        adType: "interstitial",
        type: "CLICKED",
      });
      __emit(AD_EVENT_NAME, {
        instanceId,
        adType: "interstitial",
        type: "CLICKED",
      });
    });
    expect(latest?.clickCount).toBe(2);
    expect(latest?.wasClicked).toBe(true);

    await tree.update(React.createElement(Probe, { render: 1 }));
    expect(native.createInterstitial).toHaveBeenCalledTimes(1);
    expect(latest?.clickCount).toBe(2);

    // Native may auto-preload the next ad before the current one closes. Neither
    // event starts a displayed impression, so the current click lifecycle remains.
    await runInAct(() => {
      __emit(AD_EVENT_NAME, {
        instanceId,
        adType: "interstitial",
        type: "LOADED",
      });
      __emit(AD_EVENT_NAME, {
        instanceId,
        adType: "interstitial",
        type: "CLOSED",
      });
    });
    expect(latest?.clickCount).toBe(2);
    expect(latest?.wasClicked).toBe(true);
    expect(latest?.isLoaded).toBe(true);

    await runInAct(() => {
      __emit(AD_EVENT_NAME, {
        instanceId,
        adType: "interstitial",
        type: "DISPLAYED",
      });
    });
    expect(latest?.clickCount).toBe(0);
    expect(latest?.wasClicked).toBe(false);

    await tree.unmount();
  });

  it("tracks repeatable rewarded clicks for the current displayed impression", async () => {
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
        type: "DISPLAYED",
      });
      __emit(AD_EVENT_NAME, {
        instanceId,
        adType: "rewarded",
        type: "CLICKED",
      });
      __emit(AD_EVENT_NAME, {
        instanceId,
        adType: "rewarded",
        type: "CLICKED",
      });
    });
    expect(latest?.clickCount).toBe(2);
    expect(latest?.wasClicked).toBe(true);

    await runInAct(() => {
      __emit(AD_EVENT_NAME, {
        instanceId,
        adType: "rewarded",
        type: "DISPLAYED",
      });
    });
    expect(latest?.clickCount).toBe(0);
    expect(latest?.wasClicked).toBe(false);

    await tree.unmount();
  });

  it("keeps one live native subscription through React StrictMode effect replay", async () => {
    let latest: UseInterstitialAd | undefined;
    function Probe(): null {
      latest = useInterstitialAd("strict_interstitial");
      return null;
    }

    const tree = await mount(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(Probe),
      ),
    );
    const instanceIds = native.createInterstitial.mock.calls.map(
      ([instanceId]: [string]) => instanceId,
    );
    const activeInstanceId = instanceIds.at(-1)!;

    expect(instanceIds).toHaveLength(2);
    expect(new Set(instanceIds).size).toBe(2);
    expect(native.destroyAd).toHaveBeenCalledTimes(1);
    expect(__listenerCount(AD_EVENT_NAME)).toBe(1);

    await runInAct(() => {
      __emit(AD_EVENT_NAME, {
        instanceId: instanceIds[0],
        adType: "interstitial",
        type: "CLICKED",
      });
      __emit(AD_EVENT_NAME, {
        instanceId: activeInstanceId,
        adType: "interstitial",
        type: "CLICKED",
      });
    });
    expect(latest?.clickCount).toBe(1);

    await tree.unmount();
    expect(native.destroyAd).toHaveBeenCalledTimes(2);
    expect(__listenerCount(AD_EVENT_NAME)).toBe(0);
  });

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
