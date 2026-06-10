/**
 * Imperative full-screen rewarded minigame ad.
 *
 * Mirrors the native `SimulaRewardedAd` (Kotlin/Swift). Create once, `load()` to
 * preload, then `show()` once a LOADED event arrives. Beyond the shared lifecycle
 * events it also emits EARNED_REWARD, REWARD_VERIFIED (with a token) and
 * REWARD_VERIFICATION_FAILED. Reward verification is durable and server-side —
 * the native SDK owns the retry queue.
 *
 *   const ad = SimulaRewardedAd.create('reward_slot', { minPlayThresholdSeconds: 5 });
 *   ad.addAdEventListener(SimulaRewardedAdEventType.REWARD_VERIFIED, (e) =>
 *     grant(e.rewardToken));
 *   ad.load();
 */
import { NativeAds } from "../internal/nativeModules";
import { SimulaBaseAd } from "./SimulaBaseAd";
import { RewardedPreviewOptions } from "./types";

export interface SimulaRewardedAdOptions {
  /**
   * Optional minimum play time (seconds) requested from the server. When `> 0` it
   * is sent as `min_play_threshold`; the server's returned `duration_seconds` is
   * what the SDK actually enforces.
   */
  minPlayThresholdSeconds?: number;
}

export class SimulaRewardedAd extends SimulaBaseAd {
  private constructor(adUnitId: string, options: SimulaRewardedAdOptions) {
    super("rewarded", adUnitId, "rew");
    if (this.requireNative("create")) {
      NativeAds!.createRewarded(this.instanceId, adUnitId, {
        minPlayThresholdSeconds: options.minPlayThresholdSeconds ?? 0,
      });
    }
  }

  /** Creates a new rewarded ad for the given placement id. */
  static create(
    adUnitId: string,
    options: SimulaRewardedAdOptions = {},
  ): SimulaRewardedAd {
    return new SimulaRewardedAd(adUnitId, options);
  }

  /**
   * Dev/QA-only. Presents the play-to-earn gate + store-prompt chrome with a
   * hardcoded behavior and no network call. Not for production.
   *
   * @internal
   */
  showPreview(options: RewardedPreviewOptions = {}): void {
    if (!this.requireNative("showPreview")) return;
    NativeAds!.showAdPreview(this.instanceId, {
      durationSeconds: options.durationSeconds ?? 8,
      storePrompt: options.storePrompt ?? true,
      storePromptPlatform: options.storePromptPlatform ?? "ios",
    });
  }
}
