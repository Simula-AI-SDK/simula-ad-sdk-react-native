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
}

type InstanceHandler = (event: SimulaAdEvent) => void;

const handlers = new Map<string, InstanceHandler>();
let subscription: EmitterSubscription | null = null;

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

  if (raw.type === "REWARD_VERIFIED") {
    // `token` may be explicitly null (idempotent re-verification) — preserve it.
    event.rewardToken = raw.token ?? null;
  }

  return event;
}

/** Lazily subscribes to the shared emitter on first registration. */
function ensureSubscribed(): void {
  if (subscription || handlers.size === 0) return;
  const emitter = getAdsEmitter();
  if (!emitter) return;
  subscription = emitter.addListener(AD_EVENT_NAME, (raw: RawAdEvent) => {
    if (!raw || typeof raw.instanceId !== "string") return;
    const handler = handlers.get(raw.instanceId);
    if (!handler) return; // no live instance — drop (e.g. post-destroy auto-preload)
    handler(toAdEvent(raw));
  });
}

/** Removes the shared subscription once no instances remain. */
function teardownIfIdle(): void {
  if (handlers.size > 0 || !subscription) return;
  subscription.remove();
  subscription = null;
}

/** Registers an instance's handler. Returns an unregister function. */
export function registerInstance(
  instanceId: string,
  handler: InstanceHandler,
): () => void {
  handlers.set(instanceId, handler);
  ensureSubscribed();
  return () => {
    handlers.delete(instanceId);
    teardownIfIdle();
  };
}

/** Test-only: current number of registered instances. */
export function __instanceCount(): number {
  return handlers.size;
}
