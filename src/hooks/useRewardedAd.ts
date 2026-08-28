/**
 * useRewardedAd — component-scoped imperative rewarded minigame.
 *
 * Like `useInterstitialAd`, plus reward state: `earnedReward`, `rewardVerified`,
 * and `rewardToken`. Server verification/SSV is durable and can complete after a
 * relaunch, but the JS `REWARD_VERIFIED` callback is best effort and only available
 * while the originating native ad instance and this hook remain alive.
 *
 *   const { isLoaded, clickCount, load, show, rewardToken } = useRewardedAd('reward_slot');
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
  /** Number of CLICKED events received for the current displayed impression. */
  clickCount: number;
  /** Whether the current displayed impression has received a CLICKED event. */
  wasClicked: boolean;
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
  const errorSourceRef = useRef<
    "load" | "display" | "rewardVerification" | null
  >(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [earnedReward, setEarnedReward] = useState(false);
  const [rewardVerified, setRewardVerified] = useState(false);
  const [rewardToken, setRewardToken] = useState<string | null | undefined>(
    undefined,
  );
  const [impressionRecorded, setImpressionRecorded] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [adValue, setAdValue] = useState<AdValue | null>(null);
  const [error, setError] = useState<SimulaAdError | undefined>(undefined);

  useEffect(() => {
    setIsLoaded(false);
    setIsClosed(false);
    setEarnedReward(false);
    setRewardVerified(false);
    setRewardToken(undefined);
    setImpressionRecorded(false);
    setClickCount(0);
    setAdValue(null);
    setError(undefined);
    errorSourceRef.current = null;
    if (!isNonBlankString(adUnitId)) {
      adRef.current = null;
      warnInvalidIdentifier("useRewardedAd", "adUnitId");
      return;
    }

    const ad = SimulaRewardedAd.create(adUnitId);
    adRef.current = ad;

    const off = ad.addAdEventsListener((event) => {
      setIsLoaded(ad.loaded);
      switch (event.type) {
        case "LOADED":
          setIsClosed(false);
          setError(undefined);
          errorSourceRef.current = null;
          break;
        case "DISPLAYED":
          setIsClosed(false);
          setEarnedReward(false);
          setRewardVerified(false);
          setRewardToken(undefined);
          setImpressionRecorded(false);
          setClickCount(0);
          setAdValue(null);
          setError(undefined);
          errorSourceRef.current = null;
          break;
        case "IMPRESSION":
          setImpressionRecorded(true);
          break;
        case "CLICKED":
          setClickCount((count) => count + 1);
          break;
        case "PAID":
          if (event.adValue) setAdValue(event.adValue);
          break;
        case "CLOSED":
          setIsClosed(true);
          break;
        case "EARNED_REWARD":
          setEarnedReward(true);
          break;
        case "REWARD_VERIFIED":
          setRewardVerified(true);
          setRewardToken(event.rewardToken ?? null);
          if (errorSourceRef.current === "rewardVerification") {
            errorSourceRef.current = null;
            setError(undefined);
          }
          break;
        case "LOAD_FAILED":
          // duplicate_request rejects the redundant load() call, NOT the ad — the
          // in-flight/ready ad survives natively, so isLoaded must not flip false.
          // The error (with retryInSeconds) is still surfaced as information.
          if (event.error) {
            errorSourceRef.current = "load";
            setError(event.error);
          }
          break;
        case "DISPLAY_FAILED":
          // no_presentation_context keeps the loaded ad natively (show() can be
          // retried); every other display failure means nothing is ready.
          if (event.error) {
            errorSourceRef.current = "display";
            setError(event.error);
          }
          break;
        case "REWARD_VERIFICATION_FAILED":
          if (event.error) {
            errorSourceRef.current = "rewardVerification";
            setError(event.error);
          }
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
    clickCount,
    wasClicked: clickCount > 0,
    adValue,
    error,
    load,
    show,
    setMetadata,
  };
}
