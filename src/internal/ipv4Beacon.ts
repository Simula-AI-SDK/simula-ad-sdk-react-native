/**
 * IPv4 resolution beacon — temporary, RN-only.
 *
 * WHY: most device IPs the SDK sees are IPv6, but our identity-resolution
 * partners (5x5 / LiveRamp) match on IPv4. Firing a lightweight request to a
 * host configured with ONLY A records (no AAAA) forces the OS to resolve over
 * IPv4, so the backend captures the device's public IPv4 from that request and
 * can link it (by device id / ppid) to the session that loads ads.
 *
 * SCOPE: this is a stop-gap implemented purely in the RN JS layer (no native
 * change). The durable version is a native beacon in the Kotlin/Swift SDKs that
 * can carry the server session id. The JS layer can only reach the identifiers
 * the bridge exposes — the native `X-Device-Id` (via `getDeviceId`), the
 * `apiKey`, and the publisher `ppid` — NOT the server session id. The backend
 * must therefore join the captured IPv4 on device id / ppid.
 *
 * SAFETY: fire-and-forget. Never throws, never blocks init, times out fast, and
 * no-ops only when no beacon URL is configured. It is intentionally NOT consent-
 * gated — the beacon fires on every init/ppid-update once a URL is set (ensure
 * this is covered by your privacy policy / publisher agreements).
 *
 * BACKEND CONTRACT: a GET to `IPV4_BEACON_URL` with query params:
 *   k    — apiKey
 *   did  — native X-Device-Id (omitted if unavailable)
 *   ppid — primaryUserID     (omitted if absent)
 *   p    — platform ("ios" | "android")
 *   r    — reason ("init" | "ppid_update")
 *   t    — client timestamp (cache-buster)
 * The endpoint reads the client IPv4 from `x-forwarded-for` and stores it keyed
 * by `did` / `ppid`. The response body is ignored.
 */
import { Platform } from "react-native";
import { NativeAds, isAdsModuleAvailable } from "./nativeModules";

/**
 * The A-record-only host to beacon. MUST be a domain configured with ONLY A
 * records (no AAAA) so the request is forced to resolve over IPv4.
 *
 * This is the BASE endpoint only — the runtime appends the query params (see the
 * BACKEND CONTRACT above); do not bake `k`/`ppid`/`p`/`r`/`t` in here. Empty
 * string = DISABLED. Points at the live Simula-owned measurement endpoint; no
 * app/publisher change is required.
 */
export const IPV4_BEACON_URL = "https://ip4.simula.ad/px";

/** Abort the request if it hasn't completed in this window. */
const BEACON_TIMEOUT_MS = 5000;
/** Abort the native `getDeviceId` call if it hasn't resolved in this window. */
const DEVICE_ID_TIMEOUT_MS = 2000;

type BeaconReason = "init" | "ppid_update";

/** Identity captured at init so a later ppid-update beacon can reuse it. */
interface BeaconIdentity {
  apiKey: string;
  /** Beacon endpoint override; defaults to `IPV4_BEACON_URL`. */
  url?: string;
}

let lastIdentity: BeaconIdentity | null = null;
/**
 * Bumped on every logout. A `fire` call captures the generation it started
 * with and re-checks it after each await; a mismatch means a logout happened
 * mid-flight, so the call abandons without marking the key captured. This is
 * what lets a re-login (even with the same ppid) get a fresh capture instead
 * of being skipped by a stale in-flight/captured entry.
 */
let generation = 0;
/** Keys with a beacon in flight — claimed synchronously so parallel calls can't race. */
const inFlight = new Set<string>();
/** Keys whose beacon has already SUCCESSFULLY fired this process (failures stay retryable). */
const captured = new Set<string>();
/** Live abort controllers for in-flight fetches, keyed by dedup key — aborted en masse on logout. */
const controllers = new Map<string, AbortController>();

/**
 * The capture identity: one beacon per (apiKey, ppid). See `fire` for why.
 * JSON-encodes the pair (rather than naive concatenation) so distinct
 * identities can never collide onto the same key, e.g. `apiKey="ab", ppid="c"`
 * vs `apiKey="a", ppid="bc"`.
 */
function dedupKey(apiKey: string, primaryUserID: string | null): string {
  return JSON.stringify([apiKey, primaryUserID]);
}

/** Rejects if `promise` hasn't settled within `ms` (the native call itself isn't cancelled, just abandoned). */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Fire the init beacon and remember the identity for subsequent session-update
 * beacons. Call once native `initialize` has resolved (so the device id is
 * primed). Fire-and-forget — do not await.
 */
export function beaconOnInit(
  identity: BeaconIdentity & { primaryUserID?: string | null },
): void {
  lastIdentity = { apiKey: identity.apiKey, url: identity.url };
  void fire({
    ...lastIdentity,
    primaryUserID: identity.primaryUserID ?? null,
    reason: "init",
  });
}

/**
 * Fire a beacon on a primary-user-id change, reusing the identity captured at
 * init. A login (non-empty id) captures the new identity. A logout (null/empty)
 * resets the dedup memory so a later re-login — even with the same ppid — runs a
 * fresh capture for the new session. No-op before `beaconOnInit`. Fire-and-forget.
 */
export function beaconOnPpidUpdate(primaryUserID: string | null): void {
  if (!lastIdentity) return;
  if (!primaryUserID) {
    // Logout ends the session: bump the generation so any beacon still
    // in-flight abandons without marking itself captured, abort its fetch (if
    // it has one yet), and clear the dedup bookkeeping so a re-login — even
    // with the same ppid — is never skipped because of stale state.
    generation++;
    captured.clear();
    inFlight.clear();
    for (const controller of controllers.values()) controller.abort();
    controllers.clear();
    return;
  }
  void fire({ ...lastIdentity, primaryUserID, reason: "ppid_update" });
}

async function fire(
  ctx: BeaconIdentity & { primaryUserID: string | null; reason: BeaconReason },
): Promise<void> {
  const base = (ctx.url ?? IPV4_BEACON_URL).trim();
  if (!base) return; // not provisioned → no-op

  // We capture one IPv4 per (apiKey, ppid) identity. The key deliberately omits:
  //   • the device id — invariant within a process, so it adds nothing AND would
  //     force the dedup check after the async getDeviceId() (allowing a race);
  //   • the reason — init vs ppid_update for the same identity is one capture.
  // Computing it synchronously lets us claim the slot before any await, so two
  // overlapping fires for the same identity collapse to a single request.
  const key = dedupKey(ctx.apiKey, ctx.primaryUserID);
  if (inFlight.has(key) || captured.has(key)) return;
  inFlight.add(key);
  // Snapshot the generation so a logout that happens while this call is
  // in-flight can be detected after each await (see `beaconOnPpidUpdate`).
  const gen = generation;

  try {
    if (!isAdsModuleAvailable()) return; // need the native bridge for the device id

    const deviceId = await withTimeout(NativeAds!.getDeviceId(), DEVICE_ID_TIMEOUT_MS).catch(
      () => null,
    );
    // A logout while we awaited the device id already cleared this key's
    // bookkeeping; bail instead of resurrecting a stale in-flight/captured entry.
    if (gen !== generation) return;

    const params: Record<string, string> = {
      k: ctx.apiKey,
      p: Platform.OS,
      r: ctx.reason,
      t: String(Date.now()),
    };
    if (deviceId) params.did = deviceId;
    if (ctx.primaryUserID) params.ppid = ctx.primaryUserID;

    const qs = Object.entries(params)
      .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
      .join("&");
    const url = `${base}${base.includes("?") ? "&" : "?"}${qs}`;

    const controller = new AbortController();
    controllers.set(key, controller);
    const timer = setTimeout(() => controller.abort(), BEACON_TIMEOUT_MS);
    try {
      const response = await fetch(url, { method: "GET", signal: controller.signal });
      // Record only after the request resolves successfully — a failed/aborted/
      // non-2xx beacon must not occupy the dedup slot, so a retry can still go
      // out. fetch() doesn't throw on 4xx/5xx, so the status must be checked
      // explicitly. Also re-check the generation: a logout during the fetch
      // must not let a beacon that completes afterwards mark itself captured.
      if (response.ok && gen === generation) captured.add(key);
    } finally {
      clearTimeout(timer);
      // Only delete our own controller — a logout may have already cleared the
      // map (and a new fire for the same key may have since claimed it).
      if (controllers.get(key) === controller) controllers.delete(key);
    }
  } catch {
    // Best-effort measurement — swallow everything (DNS failure on an
    // IPv6-only network, timeout, offline, …). Not recorded → stays retryable.
  } finally {
    inFlight.delete(key);
  }
}

/** Test-only: reset module dedup state between tests. Not part of the public API. */
export function __resetBeaconStateForTests(): void {
  lastIdentity = null;
  generation = 0;
  inFlight.clear();
  captured.clear();
  controllers.clear();
}
