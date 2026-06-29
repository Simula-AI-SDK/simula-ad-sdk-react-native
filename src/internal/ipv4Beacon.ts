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
 * Empty string = DISABLED (the safe default until the backend provisions the
 * domain). Set this to the live endpoint — e.g.
 * `"https://ip4.<your-domain>/px"` — to turn the beacon on. No app/publisher
 * change is required; this is a Simula-owned measurement endpoint.
 */
export const IPV4_BEACON_URL = "";

/** Abort the request if it hasn't completed in this window. */
const BEACON_TIMEOUT_MS = 5000;

type BeaconReason = "init" | "ppid_update";

/** Identity captured at init so a later ppid-update beacon can reuse it. */
interface BeaconIdentity {
  apiKey: string;
  /** Beacon endpoint override; defaults to `IPV4_BEACON_URL`. */
  url?: string;
}

let lastIdentity: BeaconIdentity | null = null;
/** Dedup key of the most recent beacon, to swallow re-init/re-render repeats. */
let lastBeaconKey: string | null = null;

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
 * Fire a beacon on a primary-user-id change (login = a session update), reusing
 * the identity captured at init. No-op before `beaconOnInit` or when clearing
 * the ppid (logout). Fire-and-forget.
 */
export function beaconOnPpidUpdate(primaryUserID: string | null): void {
  if (!lastIdentity || !primaryUserID) return;
  void fire({ ...lastIdentity, primaryUserID, reason: "ppid_update" });
}

async function fire(
  ctx: BeaconIdentity & { primaryUserID: string | null; reason: BeaconReason },
): Promise<void> {
  try {
    const base = (ctx.url ?? IPV4_BEACON_URL).trim();
    if (!base) return; // not provisioned → no-op

    if (!isAdsModuleAvailable()) return; // need the native bridge for the device id

    const deviceId = await NativeAds!.getDeviceId().catch(() => null);

    // Coalesce identical back-to-back beacons (the provider re-runs init on prop
    // changes, and native init is idempotent — but this would still re-fire).
    const key = `${ctx.reason}:${deviceId ?? ""}:${ctx.primaryUserID ?? ""}`;
    if (key === lastBeaconKey) return;
    lastBeaconKey = key;

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
    const timer = setTimeout(() => controller.abort(), BEACON_TIMEOUT_MS);
    try {
      await fetch(url, { method: "GET", signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Best-effort measurement — swallow everything (DNS failure on an
    // IPv6-only network, timeout, offline, …). It must never affect the app.
  }
}
