/**
 * useRewardedAd — component-scoped imperative rewarded minigame.
 *
 * Like `useInterstitialAd`, plus reward state: `earnedReward`, `rewardVerified`,
 * and `rewardToken`. Reward verification is durable and server-side — the native
 * SDK may deliver REWARD_VERIFIED long after close (even after a relaunch), so the
 * hook only reflects events while mounted; persist the token yourself if needed.
 *
 *   const { isLoaded, load, show, rewardToken } = useRewardedAd('reward_slot');
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { SimulaRewardedAd } from "../ads/SimulaRewardedAd";
import {
  SimulaAdLoadOptions,
  SimulaAdError,
  SimulaMetadata,
  AdValue,
} from "../ads/types";
import {
  isNonBlankString,
  warnInvalidIdentifier,
} from "../internal/identifiers";

export interface UseRewardedAd {
  isLoaded: boolean;
  isClosed: boolean;
  earnedReward: boolean;
  rewardVerified: boolean;
  rewardToken: string | null | undefined;
  /** True once the impression was recorded for the current show. */
  impressionRecorded: boolean;
  /** Estimated per-impression revenue (set on the PAID event), else null. */
  adValue: AdValue | null;
  error: SimulaAdError | undefined;
  load: (options?: SimulaAdLoadOptions) => void;
  show: () => void;
  setMetadata: {
    (key: string, value: string): void;
    (metadata: SimulaMetadata): void;
  };
}

export function useRewardedAd(adUnitId: string): UseRewardedAd {
  const adRef = useRef<SimulaRewardedAd | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [earnedReward, setEarnedReward] = useState(false);
  const [rewardVerified, setRewardVerified] = useState(false);
  const [rewardToken, setRewardToken] = useState<string | null | undefined>(
    undefined,
  );
  const [impressionRecorded, setImpressionRecorded] = useState(false);
  const [adValue, setAdValue] = useState<AdValue | null>(null);
  const [error, setError] = useState<SimulaAdError | undefined>(undefined);

  useEffect(() => {
    setIsLoaded(false);
    setIsClosed(false);
    setEarnedReward(false);
    setRewardVerified(false);
    setRewardToken(undefined);
    setImpressionRecorded(false);
    setAdValue(null);
    setError(undefined);
    if (!isNonBlankString(adUnitId)) {
      adRef.current = null;
      warnInvalidIdentifier("useRewardedAd", "adUnitId");
      return;
    }

    const ad = SimulaRewardedAd.create(adUnitId);
    adRef.current = ad;

    // True when a LOADED arrived after the most recent DISPLAYED — the native
    // auto-preload delivered the NEXT ad while the current unit was still on screen,
    // so the later CLOSED (for the shown unit) must not reset isLoaded.
    let loadedSinceDisplay = false;

    const off = ad.addAdEventsListener((event) => {
      switch (event.type) {
        case "LOADED":
          loadedSinceDisplay = true;
          setIsLoaded(true);
          setIsClosed(false);
          setError(undefined);
          break;
        case "DISPLAYED":
          loadedSinceDisplay = false;
          setIsClosed(false);
          setEarnedReward(false);
          setRewardVerified(false);
          setRewardToken(undefined);
          setImpressionRecorded(false);
          setAdValue(null);
          break;
        case "IMPRESSION":
          setImpressionRecorded(true);
          break;
        case "PAID":
          if (event.adValue) setAdValue(event.adValue);
          break;
        case "CLOSED":
          if (!loadedSinceDisplay) setIsLoaded(false);
          setIsClosed(true);
          break;
        case "EARNED_REWARD":
          setEarnedReward(true);
          break;
        case "REWARD_VERIFIED":
          setRewardVerified(true);
          setRewardToken(event.rewardToken ?? null);
          break;
        case "LOAD_FAILED":
          // duplicate_request rejects the redundant load() call, NOT the ad — the
          // in-flight/ready ad survives natively, so isLoaded must not flip false.
          // The error (with retryInSeconds) is still surfaced as information.
          if (event.error?.code !== "duplicate_request") setIsLoaded(false);
          if (event.error) setError(event.error);
          break;
        case "DISPLAY_FAILED":
          // no_presentation_context keeps the loaded ad natively (show() can be
          // retried); every other display failure means nothing is ready.
          if (event.error?.code !== "no_presentation_context") setIsLoaded(false);
          if (event.error) setError(event.error);
          break;
        case "REWARD_VERIFICATION_FAILED":
          if (event.error) setError(event.error);
          break;
        default:
          break;
      }
    });

    return () => {
      off();
      ad.destroy();
      adRef.current = null;
    };
  }, [adUnitId]);

  const load = useCallback((opts?: SimulaAdLoadOptions) => {
    adRef.current?.load(opts);
  }, []);

  const show = useCallback(() => {
    adRef.current?.show();
  }, []);

  const setMetadata: UseRewardedAd["setMetadata"] = useCallback(
    (keyOrMetadata: string | SimulaMetadata, value?: string) => {
      const ad = adRef.current;
      if (!ad) return;
      if (typeof keyOrMetadata === "string" || value !== undefined) {
        ad.setMetadata(keyOrMetadata as string, value!);
      } else {
        ad.setMetadata(keyOrMetadata);
      }
    },
    [],
  );

  return {
    isLoaded,
    isClosed,
    earnedReward,
    rewardVerified,
    rewardToken,
    impressionRecorded,
    adValue,
    error,
    load,
    show,
    setMetadata,
  };
}
