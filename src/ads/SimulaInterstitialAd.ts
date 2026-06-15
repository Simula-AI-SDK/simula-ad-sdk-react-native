/**
 * Imperative full-screen interstitial ad.
 *
 * Mirrors the native `SimulaInterstitialAd` (Kotlin/Swift). Create once, `load()`
 * to preload, then `show()` once a LOADED event arrives. All outcomes are delivered
 * as events via `addAdEventListener`.
 *
 *   const ad = SimulaInterstitialAd.create('home_interstitial');
 *   const off = ad.addAdEventListener(SimulaAdEventType.LOADED, () => ad.show());
 *   ad.load({ charId, charName });
 *
 * Requires `SimulaAds.initialize(...)` (or a mounted `SimulaProvider`) first;
 * otherwise `load()` fires LOAD_FAILED with `not_initialized`.
 */
import { NativeAds } from "../internal/nativeModules";
import { SimulaBaseAd } from "./SimulaBaseAd";
import { InterstitialPreviewOptions } from "./types";

export class SimulaInterstitialAd extends SimulaBaseAd {
  private constructor(adUnitId: string) {
    super("interstitial", adUnitId, "int");
    if (this.requireNative("create")) {
      NativeAds!.createInterstitial(this.instanceId, adUnitId);
    }
  }

  /** Creates a new interstitial for the given placement id. */
  static create(adUnitId: string): SimulaInterstitialAd {
    return new SimulaInterstitialAd(adUnitId);
  }

  /**
   * Dev/QA-only. Presents the A/B close-button chrome with a hardcoded behavior
   * and no network call. Not for production.
   *
   * @internal
   */
  showPreview(options: InterstitialPreviewOptions): void {
    if (!this.requireNative("showPreview")) return;
    NativeAds!.showAdPreview(this.instanceId, {
      closeTreatment: options.closeTreatment,
      closePosition: options.closePosition ?? "top_right",
      delaySeconds: options.delaySeconds ?? 5,
      progressBarColor: options.progressBarColor ?? "#FFFFFF",
      adUnitType: options.adUnitType ?? "interstitial",
      storePrompt: options.storePrompt ?? false,
      installBanner: options.installBanner ?? false,
    });
  }
}
