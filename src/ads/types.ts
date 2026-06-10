/**
 * Public types for the imperative ad API (interstitial + rewarded).
 *
 * The wrapper is a thin pass-through: dedup, staleness, the load/show state
 * machine, auto-preload, and reward verification all live in the native SDKs.
 * These types describe only what crosses the bridge.
 */

/** Which imperative ad format an event/instance belongs to. */
export type SimulaAdType = "interstitial" | "rewarded";

/**
 * Lifecycle events common to both interstitial and rewarded ads. The string
 * values are the canonical cross-platform event names emitted by both native
 * SDKs — do not rename them.
 */
export enum SimulaAdEventType {
  LOADED = "LOADED",
  LOAD_FAILED = "LOAD_FAILED",
  DISPLAYED = "DISPLAYED",
  DISPLAY_FAILED = "DISPLAY_FAILED",
  CLICKED = "CLICKED",
  CLOSED = "CLOSED",
}

/** Additional events emitted only by rewarded ads. */
export enum SimulaRewardedAdEventType {
  /** The user played long enough to earn the reward (before server verification). */
  EARNED_REWARD = "EARNED_REWARD",
  /** The server verified the play and fired the SSV postback. */
  REWARD_VERIFIED = "REWARD_VERIFIED",
  /** Verification could not be completed (may still retry in the background). */
  REWARD_VERIFICATION_FAILED = "REWARD_VERIFICATION_FAILED",
}

/** Any event type a listener may receive (interstitial or rewarded). */
export type SimulaAnyAdEventType = SimulaAdEventType | SimulaRewardedAdEventType;

/**
 * Stable error codes mapped from the native `SimulaAdError`. Mirrors the Kotlin
 * `telemetryCode()` / Swift `telemetryCode` naming. `unsupported_platform` is
 * iOS-only; `verification_failed` is rewarded-only.
 */
export type SimulaAdErrorCode =
  | "not_initialized"
  | "no_session"
  | "no_fill"
  | "not_ready"
  | "stale"
  | "duplicate_request"
  | "already_showing"
  | "no_presentation_context"
  | "network"
  | "unsupported_platform"
  | "verification_failed";

/** A failure surfaced on a `*_FAILED` event. */
export interface SimulaAdError {
  code: SimulaAdErrorCode;
  message: string;
  /**
   * For `duplicate_request` only: seconds until `load()` unblocks (when a ready
   * ad triggered the block). Always present on iOS; best-effort on Android
   * (extracted from the contractual message; `undefined` when still loading).
   */
  retryInSeconds?: number;
}

/** Optional character-targeting context passed to `load()`. */
export interface SimulaAdLoadOptions {
  charId?: string;
  charName?: string;
  charImage?: string;
  charDesc?: string;
}

/** An event delivered to an ad's listener. */
export interface SimulaAdEvent {
  /** The ad instance the event belongs to. */
  type: SimulaAnyAdEventType;
  /** Present on LOAD_FAILED / DISPLAY_FAILED / REWARD_VERIFICATION_FAILED. */
  error?: SimulaAdError;
  /**
   * Present on REWARD_VERIFIED only. `null` when the call was an idempotent
   * re-verification of an already-claimed reward.
   */
  rewardToken?: string | null;
}

/**
 * Dev/QA-only options for `SimulaInterstitialAd.showPreview` — renders the
 * A/B close-button chrome with a hardcoded behavior and no network call.
 *
 * @internal Not for production use.
 */
export interface InterstitialPreviewOptions {
  /** `hidden` / `countdown_circle` / `progress_bar` / `reward_or_close_label`. */
  closeTreatment: string;
  /** `top_right` / `top_left` / `bottom_left`. Default `top_right`. */
  closePosition?: string;
  /** Pre-tap close delay the treatment animates over. Default 5. */
  delaySeconds?: number;
  /** 6-digit hex (optional leading `#`) tinting the ring / bar fill. */
  progressBarColor?: string;
  /** `interstitial` / `rewarded` — drives the `reward_or_close_label` copy. */
  adUnitType?: string;
  /** Also show the mid-ad store-prompt badge. */
  storePrompt?: boolean;
  /**
   * Also present the platform install banner (iOS SKOverlay / Android Play
   * install banner).
   */
  installBanner?: boolean;
}

/**
 * Dev/QA-only options for `SimulaRewardedAd.showPreview`.
 *
 * @internal Not for production use.
 */
export interface RewardedPreviewOptions {
  /** Play-to-earn gate; the store-prompt badge shows at `durationSeconds / 2`. Default 8. */
  durationSeconds?: number;
  /** Whether to show the mid-ad store-prompt badge. Default true. */
  storePrompt?: boolean;
  /** `ios` / `android` — selects the store-prompt badge artwork. */
  storePromptPlatform?: "ios" | "android";
}

/** A function that removes a previously-added listener. */
export type SimulaUnsubscribe = () => void;
