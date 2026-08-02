/**
 * Shared machinery for imperative ad instances (interstitial + rewarded).
 *
 * Each instance:
 * - owns a JS-generated `instanceId` used to route native events back to it,
 * - registers exactly one handler with the shared event router,
 * - fans events out to per-event-type and all-events listeners,
 * - forwards `load` / `show` / `destroy` to the native module as fire-and-forget
 *   calls (the native SDK owns all outcomes, delivered as events).
 *
 * Nothing here re-implements native behavior. `loaded` is a convenience mirror
 * updated from events; it never gates `show()` (native owns not_ready/stale).
 */
import {
  NativeAds,
  isAdsModuleAvailable,
  warnAdsUnavailable,
} from "../internal/nativeModules";
import { registerInstance } from "./eventRouter";
import { serializeExtraParameters } from "../internal/extraParameters";
import {
  SimulaAdEvent,
  SimulaAdLoadOptions,
  SimulaExtraParameters,
  SimulaAdType,
  SimulaAnyAdEventType,
  SimulaUnsubscribe,
} from "./types";

let counter = 0;

/** Generates a process-unique instance id, e.g. `"int_1"` / `"rew_2"`. */
function nextInstanceId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter}`;
}

export abstract class SimulaBaseAd {
  /** The placement identifier for this ad instance. */
  readonly adUnitId: string;

  /** Process-unique id used to route native events to this instance. */
  protected readonly instanceId: string;

  protected readonly adType: SimulaAdType;

  /** Convenience mirror of native readiness — informational only. */
  private _loaded = false;

  /**
   * True when a LOADED arrived after the most recent DISPLAYED — i.e. the native
   * auto-preload delivered the NEXT ad while the current unit was still on screen.
   * The later CLOSED then refers to the shown unit, not the ready one, so it must
   * not reset [_loaded].
   */
  private loadedSinceDisplay = false;

  private destroyed = false;

  // Listeners keyed by event type, plus catch-all listeners.
  private readonly typed = new Map<
    SimulaAnyAdEventType,
    Set<(event: SimulaAdEvent) => void>
  >();
  private readonly all = new Set<(event: SimulaAdEvent) => void>();

  private readonly unregister: () => void;

  protected constructor(
    adType: SimulaAdType,
    adUnitId: string,
    idPrefix: string,
  ) {
    this.adType = adType;
    this.adUnitId = adUnitId;
    this.instanceId = nextInstanceId(idPrefix);
    this.unregister = registerInstance(this.instanceId, (event) =>
      this.dispatch(event),
    );
  }

  /** Whether the most recent load reported success and the ad has not since closed/failed. */
  get loaded(): boolean {
    return this._loaded;
  }

  // ── Event fan-out ─────────────────────────────────────────────────────

  private dispatch(event: SimulaAdEvent): void {
    // Maintain the convenience flag from lifecycle events, tracking the NATIVE state:
    // events that don't discard the natively held ad must not report it gone.
    switch (event.type) {
      case "LOADED":
        this._loaded = true;
        this.loadedSinceDisplay = true;
        break;
      case "DISPLAYED":
        this.loadedSinceDisplay = false;
        break;
      case "CLOSED":
        // Don't clobber a LOADED that arrived after the last DISPLAYED: the native
        // auto-preload can deliver the next ad while this unit's end screens are still
        // up, so its LOADED may precede this CLOSED — native still holds a ready ad.
        if (!this.loadedSinceDisplay) this._loaded = false;
        break;
      case "LOAD_FAILED":
        // duplicate_request rejects the redundant load() call, NOT the ad — the
        // in-flight/ready ad survives natively and stays showable.
        if (event.error?.code !== "duplicate_request") this._loaded = false;
        break;
      case "DISPLAY_FAILED":
        // no_presentation_context keeps the loaded ad natively (the host can retry
        // show()); every other display failure means nothing is ready.
        if (event.error?.code !== "no_presentation_context") this._loaded = false;
        break;
      default:
        break;
    }

    const typedSet = this.typed.get(event.type);
    if (typedSet) {
      // Copy to tolerate listeners that unsubscribe during dispatch.
      for (const fn of Array.from(typedSet)) fn(event);
    }
    if (this.all.size > 0) {
      for (const fn of Array.from(this.all)) fn(event);
    }
  }

  /** Subscribe to a single event type. Returns an unsubscribe function. */
  addAdEventListener(
    type: SimulaAnyAdEventType,
    listener: (event: SimulaAdEvent) => void,
  ): SimulaUnsubscribe {
    let set = this.typed.get(type);
    if (!set) {
      set = new Set();
      this.typed.set(type, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
    };
  }

  /** Subscribe to every event for this ad. Returns an unsubscribe function. */
  addAdEventsListener(
    listener: (event: SimulaAdEvent) => void,
  ): SimulaUnsubscribe {
    this.all.add(listener);
    return () => {
      this.all.delete(listener);
    };
  }

  /** Removes all listeners registered on this instance. */
  removeAllListeners(): void {
    this.typed.clear();
    this.all.clear();
  }

  // ── Native passthrough ────────────────────────────────────────────────

  /** Upserts one metadata value for future impressions. Native validation is authoritative. */
  setExtraParameter(key: string, value: string): void {
    if (!this.requireNative("setExtraParameter")) return;
    NativeAds!.setExtraParameter(this.instanceId, key, value);
  }

  /** Replaces all metadata for future impressions. Invalid entries are dropped fail-safe. */
  setExtraParameters(parameters: SimulaExtraParameters): void {
    if (!this.requireNative("setExtraParameters")) return;
    NativeAds!.setExtraParameters(
      this.instanceId,
      serializeExtraParameters(parameters) ?? "{}",
    );
  }

  /** Preloads an ad. Fire-and-forget — outcome arrives as LOADED / LOAD_FAILED. */
  load(options: SimulaAdLoadOptions = {}): void {
    if (!this.requireNative("load")) return;
    NativeAds!.loadAd(this.instanceId, {
      charId: options.charId ?? null,
      charName: options.charName ?? null,
      charImage: options.charImage ?? null,
      charDesc: options.charDesc ?? null,
    });
  }

  /** Presents a loaded ad. Fire-and-forget — outcome arrives as DISPLAYED / DISPLAY_FAILED. */
  show(): void {
    if (!this.requireNative("show")) return;
    NativeAds!.showAd(this.instanceId);
  }

  /**
   * Tears down the native ad instance and unregisters from the event router.
   * Safe to call once; subsequent calls are no-ops. After destroy, no further
   * events are delivered to this instance.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this._loaded = false;
    this.removeAllListeners();
    this.unregister();
    if (isAdsModuleAvailable()) {
      NativeAds!.destroyAd(this.instanceId);
    }
  }

  protected requireNative(method: string): boolean {
    if (this.destroyed) {
      console.warn(`[SimulaAds] ${method}() called on a destroyed ad — ignored.`);
      return false;
    }
    if (!isAdsModuleAvailable()) {
      warnAdsUnavailable(method);
      return false;
    }
    return true;
  }
}
