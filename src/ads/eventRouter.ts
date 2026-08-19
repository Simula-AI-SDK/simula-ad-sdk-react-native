/**
 * Single-subscription event router for the imperative ad surface.
 *
 * Every ad instance shares ONE `NativeEventEmitter` and ONE event name
 * (`SimulaAds_onAdEvent`). The native side stamps each event with the JS-generated
 * `instanceId`; this router holds a `Map<instanceId, handler>` and dispatches to
 * the right instance. The subscription count is therefore constant — it does not
 * grow with the number of ads or listeners.
 *
 * Events whose `instanceId` has no registered handler are dropped silently. This
 * is expected: after `destroy()`, the native ad may still emit (e.g. the
 * auto-preload `LOADED` that fires on close), and those events have nowhere to go.
 */
import { EmitterSubscription } from "react-native";
import { getAdsEmitter, AD_EVENT_NAME } from "../internal/nativeModules";
import {
  AdValue,
  SimulaAdEvent,
  SimulaAdError,
  SimulaAdErrorCode,
  SimulaAnyAdEventType,
} from "./types";

/** The raw, flat payload the native modules put on the wire. */
interface RawAdEvent {
  instanceId: string;
  adType: "interstitial" | "rewarded";
  type: string;
  code?: string;
  message?: string;
  retryInSeconds?: number;
  token?: string | null;
  // AdValue fields, flattened onto the event by both native bridges (PAID only).
  valueMicros?: number;
  currencyCode?: string;
  precisionType?: string;
  expectedCpm?: number;
  expectedRevenue?: number;
}

type InstanceHandler = (event: SimulaAdEvent) => void;

interface RouterState {
  handlers: Map<string, InstanceHandler>;
  subscription: EmitterSubscription | null;
  toAdEvent: (raw: RawAdEvent) => SimulaAdEvent;
}

interface SimulaRuntimeGlobal {
  __simulaAdsEventRouterState__?: RouterState;
}

// Fast Refresh and duplicate JS bundles can evaluate this module more than once
// while the native process remains alive. Share routing state across evaluations
// so instance registrations still use one native subscription.
const runtimeGlobal = globalThis as typeof globalThis & SimulaRuntimeGlobal;
const state = (runtimeGlobal.__simulaAdsEventRouterState__ ??= {
  handlers: new Map<string, InstanceHandler>(),
  subscription: null,
  toAdEvent,
});

/** The event types that carry a `SimulaAdError`. */
const ERROR_EVENT_TYPES = new Set([
  "LOAD_FAILED",
  "DISPLAY_FAILED",
  "REWARD_VERIFICATION_FAILED",
]);

function toAdEvent(raw: RawAdEvent): SimulaAdEvent {
  const event: SimulaAdEvent = { type: raw.type as SimulaAnyAdEventType };

  if (ERROR_EVENT_TYPES.has(raw.type)) {
    const error: SimulaAdError = {
      code: (raw.code as SimulaAdErrorCode) ?? "network",
      message: raw.message ?? "",
    };
    if (typeof raw.retryInSeconds === "number") {
      error.retryInSeconds = raw.retryInSeconds;
    }
    event.error = error;
  }

  if (raw.type === "PAID") {
    event.adValue = {
      valueMicros: raw.valueMicros ?? 0,
      currencyCode: raw.currencyCode ?? "",
      precisionType: (raw.precisionType ?? "ESTIMATED") as AdValue["precisionType"],
      expectedCpm: raw.expectedCpm ?? 0,
      expectedRevenue: raw.expectedRevenue ?? 0,
    };
  }

  if (raw.type === "REWARD_VERIFIED") {
    // `token` may be explicitly null (idempotent re-verification) — preserve it.
    event.rewardToken = raw.token ?? null;
  }

  return event;
}

// Keep an existing process-wide subscription while updating the parser used by
// its callback after Fast Refresh evaluates this module again.
state.toAdEvent = toAdEvent;

/** Lazily subscribes to the shared emitter on first registration. */
function ensureSubscribed(): void {
  if (state.subscription || state.handlers.size === 0) return;
  const emitter = getAdsEmitter();
  if (!emitter) return;
  state.subscription = emitter.addListener(AD_EVENT_NAME, (raw: RawAdEvent) => {
    if (!raw || typeof raw.instanceId !== "string") return;
    const handler = state.handlers.get(raw.instanceId);
    if (!handler) return; // no live instance — drop (e.g. post-destroy auto-preload)
    handler(state.toAdEvent(raw));
  });
}

/** Removes the shared subscription once no instances remain. */
function teardownIfIdle(): void {
  if (state.handlers.size > 0 || !state.subscription) return;
  state.subscription.remove();
  state.subscription = null;
}

/** Registers an instance's handler. Returns an unregister function. */
export function registerInstance(
  instanceId: string,
  handler: InstanceHandler,
): () => void {
  state.handlers.set(instanceId, handler);
  ensureSubscribed();
  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;
    if (state.handlers.get(instanceId) === handler) {
      state.handlers.delete(instanceId);
    }
    teardownIfIdle();
  };
}

/** Test-only: current number of registered instances. */
export function __instanceCount(): number {
  return state.handlers.size;
}
