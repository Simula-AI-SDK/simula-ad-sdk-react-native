/**
 * useInterstitialAd — component-scoped imperative interstitial.
 *
 * Creates a `SimulaInterstitialAd` on mount and destroys it on unmount, surfacing
 * its lifecycle as React state. Stable `load`/`show` callbacks let you drive it
 * from effects or handlers without re-creating the instance.
 *
 *   const { isLoaded, load, show, error } = useInterstitialAd('home_interstitial');
 *   useEffect(() => { load(); }, [load]);
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { SimulaInterstitialAd } from "../ads/SimulaInterstitialAd";
import { SimulaAdLoadOptions, SimulaAdError, AdValue } from "../ads/types";

export interface UseInterstitialAd {
  isLoaded: boolean;
  isClosed: boolean;
  /** True once the impression was recorded for the current show. */
  impressionRecorded: boolean;
  /** Estimated per-impression revenue (set on the PAID event), else null. */
  adValue: AdValue | null;
  error: SimulaAdError | undefined;
  load: (options?: SimulaAdLoadOptions) => void;
  show: () => void;
}

export function useInterstitialAd(adUnitId: string): UseInterstitialAd {
  const adRef = useRef<SimulaInterstitialAd | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [impressionRecorded, setImpressionRecorded] = useState(false);
  const [adValue, setAdValue] = useState<AdValue | null>(null);
  const [error, setError] = useState<SimulaAdError | undefined>(undefined);

  useEffect(() => {
    const ad = SimulaInterstitialAd.create(adUnitId);
    adRef.current = ad;
    setIsLoaded(false);
    setIsClosed(false);
    setImpressionRecorded(false);
    setAdValue(null);
    setError(undefined);

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

  const load = useCallback((options?: SimulaAdLoadOptions) => {
    adRef.current?.load(options);
  }, []);

  const show = useCallback(() => {
    adRef.current?.show();
  }, []);

  return { isLoaded, isClosed, impressionRecorded, adValue, error, load, show };
}
