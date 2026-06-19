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
import { SimulaAdLoadOptions, SimulaAdError, AdValue } from "../ads/types";

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
    const ad = SimulaRewardedAd.create(adUnitId);
    adRef.current = ad;
    setIsLoaded(false);
    setIsClosed(false);
    setEarnedReward(false);
    setRewardVerified(false);
    setRewardToken(undefined);
    setImpressionRecorded(false);
    setAdValue(null);
    setError(undefined);

    const off = ad.addAdEventsListener((event) => {
      switch (event.type) {
        case "LOADED":
          setIsLoaded(true);
          setIsClosed(false);
          setError(undefined);
          break;
        case "DISPLAYED":
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
          setIsLoaded(false);
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
        case "DISPLAY_FAILED":
          setIsLoaded(false);
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
  };
}
