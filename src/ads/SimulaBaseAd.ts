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
import {
  SimulaAdEvent,
  SimulaAdLoadOptions,
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
    // Maintain the convenience flag from lifecycle events.
    switch (event.type) {
      case "LOADED":
        this._loaded = true;
        break;
      case "LOAD_FAILED":
      case "CLOSED":
      case "DISPLAY_FAILED":
        this._loaded = false;
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
