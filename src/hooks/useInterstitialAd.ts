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
import { SimulaAdLoadOptions, SimulaAdError } from "../ads/types";

export interface UseInterstitialAd {
  isLoaded: boolean;
  isClosed: boolean;
  error: SimulaAdError | undefined;
  load: (options?: SimulaAdLoadOptions) => void;
  show: () => void;
}

export function useInterstitialAd(adUnitId: string): UseInterstitialAd {
  const adRef = useRef<SimulaInterstitialAd | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [error, setError] = useState<SimulaAdError | undefined>(undefined);

  useEffect(() => {
    const ad = SimulaInterstitialAd.create(adUnitId);
    adRef.current = ad;
    setIsLoaded(false);
    setIsClosed(false);
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
          break;
        case "CLOSED":
          setIsLoaded(false);
          setIsClosed(true);
          break;
        case "LOAD_FAILED":
        case "DISPLAY_FAILED":
          setIsLoaded(false);
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

  return { isLoaded, isClosed, error, load, show };
}
