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

/**
 * The native-applied identity (apiKey + optional url override). Established by
 * the FIRST `beaconArmInit` and never overwritten by a later one — mirroring the
 * native SDK, whose `initialize` is idempotent (first valid call wins), so a
 * second/overlapping `initialize` never changes the applied apiKey.
 */
let lastIdentity: BeaconIdentity | null = null;
/**
 * The ppid the SDK currently intends to beacon for — the single source of truth
 * for the (possibly still-pending) init beacon's identity. Established by the
 * FIRST `beaconArmInit` (see its first-wins guard) and thereafter changed ONLY
 * by `beaconOnPpidUpdate` — mirroring the native SDK, where the initial ppid
 * comes from the first `initialize` and every later change comes from
 * `updatePrimaryUserID` (a second `initialize` is a native no-op). This is what
 * lets a login/logout that lands WHILE native init is still in flight take
 * effect, and it's the value `beaconFireInit` fires with — so the init beacon
 * reflects the ppid native actually has when init resolves, never the value
 * `initialize()` happened to be called with, and never a *concurrent* init's.
 */
let currentPpid: string | null = null;
/**
 * Bumped on every logout AND on every identity transition (see `fire`). A
 * `fire` call captures the generation it started with and re-checks it after
 * each await; a mismatch means the session moved on mid-flight, so the call
 * abandons without marking the key captured. This is what lets a re-login
 * (even with the same ppid) get a fresh capture instead of being skipped by a
 * stale in-flight/captured entry.
 */
let generation = 0;
/**
 * The dedup key of the currently-active (apiKey, ppid) identity, or `null`
 * before the first beacon / after a logout. Used by `fire` to detect account
 * switches (A→B, or A→B→A) that happen via `beaconOnPpidUpdate` WITHOUT an
 * intervening logout — see the comment there for why that needs its own
 * cleanup, distinct from the full reset a logout does.
 */
let activeKey: string | null = null;
/**
 * Keys with a beacon in flight, mapped to the generation that claimed the
 * slot — claimed synchronously so parallel calls can't race. The generation
 * lets a `finally` only release the slot it actually owns (see `fire`),
 * otherwise a stale call's cleanup could delete a slot a newer call (post
 * re-login) has since claimed for the same key.
 */
const inFlight = new Map<string, number>();
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

/**
 * Mirrors the per-platform blank-check `SimulaAds.updatePrimaryUserID` triggers
 * natively, so the beacon's session state stays in sync with what the native SDK
 * actually did with THIS update:
 *   • Android clears the ppid on any blank id, including whitespace-only — see
 *     `SimulaAdsModule.kt`'s `id?.takeIf { it.isNotBlank() }`.
 *   • iOS only clears a LITERAL empty string — see `SimulaAdsModule.swift`'s
 *     `userID?.isEmpty == true` check — so a whitespace-only id is RETAINED as
 *     the ppid there. Applying Android's blanker check on iOS would desync the
 *     beacon (treats it as logout) from the native session (keeps the id),
 *     breaking the backend's did/ppid join.
 * Only used for ppid UPDATES (`beaconOnPpidUpdate`) — the initial `primaryUserID`
 * passed to `initialize()` isn't blank-filtered by either native bridge, so
 * `beaconArmInit` keeps the simpler null/undefined-only check (`?? null`).
 */
function normalizeUpdatedPpid(id: string | null): string | null {
  if (!id) return null;
  const isBlank = Platform.OS === "android" ? id.trim().length === 0 : id.length === 0;
  return isBlank ? null : id;
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
 * Best-effort device id lookup. `did` is documented as "omitted if
 * unavailable" — so any failure here (including the native method being
 * missing/non-callable, e.g. an app built against an older native binary)
 * must degrade to `null`, never throw. Calling `getDeviceId()` is wrapped in
 * its own try/catch because a non-function throws SYNCHRONOUSLY, before a
 * `.catch()` on the (non-existent) returned promise could ever attach —
 * letting that escape would abort the whole beacon instead of just the `did`.
 */
async function safeGetDeviceId(): Promise<string | null> {
  try {
    return await withTimeout(NativeAds!.getDeviceId(), DEVICE_ID_TIMEOUT_MS);
  } catch {
    return null;
  }
}

/**
 * Record the identity for an in-progress `initialize()` SYNCHRONOUSLY, before
 * native init is awaited, WITHOUT firing. This does three things a bare
 * fire-after-await can't:
 *   • sets `lastIdentity` up front so a `beaconOnPpidUpdate` that races native
 *     init (see its `!lastIdentity` guard) takes effect instead of being
 *     silently dropped,
 *   • seeds `currentPpid` so `beaconFireInit` fires for the ppid that is current
 *     when native init resolves — even if a login/logout landed in between, and
 *   • is FIRST-WINS: once an identity is armed it is NOT overwritten by a later
 *     (e.g. overlapping) `initialize()`. Native init is idempotent (the first
 *     valid call wins), so a second init's apiKey/ppid is never applied
 *     natively; letting it overwrite shared state here would make whichever init
 *     fires beacon an identity the native SDK never applied — corrupting the
 *     backend's did/ppid join. Post-init ppid changes must come through
 *     `beaconOnPpidUpdate` (which mirrors a native `updatePrimaryUserID`).
 * Call `beaconFireInit` once native init resolves (so the device id is primed).
 */
export function beaconArmInit(
  identity: BeaconIdentity & { primaryUserID?: string | null },
): void {
  if (lastIdentity) return; // first-wins; mirrors native init idempotency
  lastIdentity = { apiKey: identity.apiKey, url: identity.url };
  currentPpid = identity.primaryUserID ?? null;
}

/**
 * Fire the init beacon for the CURRENT identity/ppid (see `currentPpid`). Call
 * once native `initialize` has resolved and this init has won its caller's
 * ordering guard. No-op if no init has been armed. Fire-and-forget — do not await.
 */
export function beaconFireInit(): void {
  if (!lastIdentity) return;
  void fire({ ...lastIdentity, primaryUserID: currentPpid, reason: "init" });
}

/**
 * Arm + fire in a single call. Convenience for callers that already know native
 * init has completed (and for tests). Inherits `beaconArmInit`'s first-wins
 * behavior — a second call won't re-establish the identity, it only fires the
 * current one. `SimulaAds.initialize` instead uses the split `beaconArmInit` /
 * `beaconFireInit` so a ppid update can land in between the (synchronous) arm and
 * the (post-native-init) fire.
 */
export function beaconOnInit(
  identity: BeaconIdentity & { primaryUserID?: string | null },
): void {
  beaconArmInit(identity);
  beaconFireInit();
}

/**
 * Fire a beacon on a primary-user-id change, reusing the identity captured at
 * init. A login (an id the native side keeps — see `normalizeUpdatedPpid`)
 * captures the new identity. A logout (null, or blank per the CURRENT
 * platform's native check) resets the dedup memory so a later re-login — even
 * with the same ppid — runs a fresh capture for the new session. No-op until an
 * init has been armed (`beaconArmInit`/`beaconOnInit`) — but note arming happens
 * synchronously at the START of `initialize`, so an update racing native init is
 * honored rather than dropped. Fire-and-forget.
 */
export function beaconOnPpidUpdate(primaryUserID: string | null): void {
  if (!lastIdentity) return;
  const normalized = normalizeUpdatedPpid(primaryUserID);
  // Keep the single source of truth in sync so an init beacon that has been
  // armed but not yet fired (native init still in flight) fires for THIS updated
  // ppid instead of the value `initialize()` was originally called with.
  currentPpid = normalized;
  if (!normalized) {
    // Logout ends the session: bump the generation so any beacon still
    // in-flight abandons without marking itself captured, abort its fetch (if
    // it has one yet), and clear the dedup bookkeeping so a re-login — even
    // with the same ppid — is never skipped because of stale state.
    generation++;
    activeKey = null;
    captured.clear();
    inFlight.clear();
    for (const controller of controllers.values()) controller.abort();
    controllers.clear();
    return;
  }
  void fire({ ...lastIdentity, primaryUserID: normalized, reason: "ppid_update" });
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

  if (key !== activeKey) {
    // An account switch (A→B) or a return to a previously-active identity
    // (A→B→A) via `beaconOnPpidUpdate`, WITHOUT an intervening logout — a
    // logout already gets a full reset in `beaconOnPpidUpdate`, but this path
    // (ppid changes straight from one non-blank value to another) doesn't go
    // through it. Both cases need a fresh capture attempt, so:
    //   • bump the generation so anything still in-flight for the OLD
    //     identity abandons instead of resurrecting stale state post-switch;
    //   • end the OLD identity's bookkeeping (mirrors a logout, scoped to
    //     just that key) so returning to it later isn't blocked by a stale
    //     in-flight/captured entry left over from before this switch;
    //   • clear THIS key's own stale `captured` entry (if any) from an
    //     earlier session with the same identity — otherwise a returning
    //     user (A→B→A) is silently deduped forever instead of recaptured.
    generation++;
    if (activeKey !== null) {
      captured.delete(activeKey);
      inFlight.delete(activeKey);
      controllers.get(activeKey)?.abort();
      controllers.delete(activeKey);
    }
    captured.delete(key);
    inFlight.delete(key);
    activeKey = key;
  }

  if (inFlight.has(key) || captured.has(key)) return;
  // Snapshot the generation so a logout/switch that happens while this call
  // is in-flight can be detected after each await (see `beaconOnPpidUpdate`
  // and the transition above), and so this call's `finally` can tell whether
  // it still owns the slot below.
  const gen = generation;
  inFlight.set(key, gen);

  try {
    if (!isAdsModuleAvailable()) return; // need the native bridge for the device id

    const deviceId = await safeGetDeviceId();
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
    // Only release our own claim — a logout may have already cleared the map
    // and a newer call (post re-login) may have since claimed this same key.
    if (inFlight.get(key) === gen) inFlight.delete(key);
  }
}

/** Test-only: reset module dedup state between tests. Not part of the public API. */
export function __resetBeaconStateForTests(): void {
  lastIdentity = null;
  currentPpid = null;
  generation = 0;
  activeKey = null;
  inFlight.clear();
  captured.clear();
  controllers.clear();
}
