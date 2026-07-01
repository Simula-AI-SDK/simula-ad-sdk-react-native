import {
  beaconOnInit,
  beaconArmInit,
  beaconFireInit,
  beaconOnPpidUpdate,
  __resetBeaconStateForTests,
  IPV4_BEACON_URL,
} from "../ipv4Beacon";
import { NativeModules, Platform } from "../../test/reactNativeMock";

const native = NativeModules.SimulaAdsModule;
const URL_ = "https://ip4.test/px";
/** Test mock's `Platform.OS` is a readonly-typed literal at compile time only. */
const mutablePlatform = Platform as unknown as { OS: string };

/** Flush the microtask + immediate queues so the fire-and-forget beacon runs. */
const flush = () => new Promise((r) => setImmediate(r));

let fetchMock: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  __resetBeaconStateForTests();
  native.getDeviceId.mockResolvedValue("device-123");
  fetchMock = jest.fn().mockResolvedValue({ ok: true });
  global.fetch = fetchMock as unknown as typeof fetch;
});

/** Parse the Nth fetched URL into its query params. */
function paramsOf(call = 0): URLSearchParams {
  const [url, init] = fetchMock.mock.calls[call];
  expect(init).toMatchObject({ method: "GET" });
  return new URL(url as string).searchParams;
}

describe("ipv4Beacon", () => {
  it("fires against the configured default endpoint when no url override is given", async () => {
    beaconOnInit({ apiKey: "k" }); // url omitted → falls back to IPV4_BEACON_URL
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url as string).toContain(IPV4_BEACON_URL);
  });

  it("no-ops when the beacon URL is explicitly empty (disabled)", async () => {
    beaconOnInit({ apiKey: "k", url: "" }); // explicit empty overrides the default
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fires a GET carrying apiKey, device id, ppid, platform and reason", async () => {
    native.getDeviceId.mockResolvedValueOnce("dev-B");
    beaconOnInit({ apiKey: "k1", url: URL_, primaryUserID: "u1" });
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const q = paramsOf();
    expect(q.get("k")).toBe("k1");
    expect(q.get("did")).toBe("dev-B");
    expect(q.get("ppid")).toBe("u1");
    expect(q.get("p")).toBe("ios");
    expect(q.get("r")).toBe("init");
    expect(q.get("t")).toBeTruthy(); // cache-buster present
  });

  it("omits did/ppid when the device id is unavailable and no ppid is set", async () => {
    native.getDeviceId.mockResolvedValueOnce(null);
    beaconOnInit({ apiKey: "k2", url: URL_ });
    await flush();

    const q = paramsOf();
    expect(q.has("did")).toBe(false);
    expect(q.has("ppid")).toBe(false);
    expect(q.get("k")).toBe("k2");
  });

  it("still fires (without did) when getDeviceId throws synchronously instead of returning a promise", async () => {
    // Simulates a native bridge where getDeviceId isn't callable (e.g. an app
    // built against an older native binary) — must not abort the whole beacon.
    native.getDeviceId.mockImplementationOnce(() => {
      throw new TypeError("undefined is not a function");
    });

    beaconOnInit({ apiKey: "kSyncThrow", url: URL_ });
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const q = paramsOf();
    expect(q.has("did")).toBe(false);
    expect(q.get("k")).toBe("kSyncThrow");
  });

  it("is not consent-gated — fires once a URL is configured", async () => {
    beaconOnInit({ apiKey: "k", url: URL_ });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("captures an identity once across init and a same-id ppid update", async () => {
    beaconOnInit({ apiKey: "kD", url: URL_, primaryUserID: "u1" });
    await flush();
    beaconOnPpidUpdate("u1"); // same (apiKey, ppid) → deduped
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("dedups identical back-to-back beacons", async () => {
    beaconOnInit({ apiKey: "kG", url: URL_ });
    await flush();
    beaconOnInit({ apiKey: "kG", url: URL_ });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // ── Review fixes ──────────────────────────────────────────────────────────

  it("re-fires when the apiKey changes (apiKey is part of the dedup key)", async () => {
    beaconOnInit({ apiKey: "kA", url: URL_, primaryUserID: "u" });
    await flush();
    beaconOnInit({ apiKey: "kB", url: URL_, primaryUserID: "u" }); // new key, same ppid/device
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries after a failed beacon (a failure does not occupy the dedup slot)", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    expect(() => beaconOnInit({ apiKey: "kR", url: URL_ })).not.toThrow();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1); // failed attempt

    beaconOnInit({ apiKey: "kR", url: URL_ }); // identical → must retry
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("re-captures on re-login with the same ppid after logout", async () => {
    beaconOnInit({ apiKey: "kL", url: URL_ }); // anonymous init
    await flush();
    beaconOnPpidUpdate("u1"); // login
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    beaconOnPpidUpdate(null); // logout → resets dedup memory, no request
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    beaconOnPpidUpdate("u1"); // re-login, same ppid
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("collapses parallel identical fires into a single request", async () => {
    // Both run synchronously up to the getDeviceId await; the second must see the
    // in-flight slot the first claimed and bail before sending.
    beaconOnInit({ apiKey: "kP", url: URL_ });
    beaconOnInit({ apiKey: "kP", url: URL_ });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not let a beacon that resolves after logout mark itself captured, and re-fires on re-login", async () => {
    let resolveFetch: (v: { ok: boolean }) => void;
    fetchMock.mockImplementationOnce(
      () => new Promise((resolve) => (resolveFetch = resolve)),
    );

    beaconOnInit({ apiKey: "kLogout", url: URL_, primaryUserID: "u1" });
    await flush(); // beacon is now in-flight, awaiting the fetch

    beaconOnPpidUpdate(null); // logout while the beacon is still in-flight
    resolveFetch!({ ok: true }); // the stale fetch finally resolves successfully
    await flush();

    // A second fire for the same identity must NOT be skipped — the resolved
    // fetch above must not have been recorded as a successful capture.
    beaconOnInit({ apiKey: "kLogout", url: URL_, primaryUserID: "u1" });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("aborts in-flight fetches on logout", async () => {
    fetchMock.mockImplementationOnce(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );

    beaconOnInit({ apiKey: "kAbort", url: URL_, primaryUserID: "u1" });
    await flush(); // fetch is now in-flight

    beaconOnPpidUpdate(null); // logout must abort the live fetch
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not mark an identity captured on an HTTP error response (retries on the next call)", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    beaconOnInit({ apiKey: "kErr", url: URL_ });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Same identity, same call — must NOT be deduped since the first attempt
    // got a server error rather than a successful capture.
    beaconOnInit({ apiKey: "kErr", url: URL_ });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not collide dedup keys across identities that would clash under naive concatenation", async () => {
    // Naive `${apiKey}${ppid}` would make ("ab", "c") and ("a", "bc") collide.
    beaconOnInit({ apiKey: "ab", url: URL_, primaryUserID: "c" });
    await flush();
    beaconOnInit({ apiKey: "a", url: URL_, primaryUserID: "bc" });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not let a stale pre-logout beacon's cleanup steal the dedup slot claimed after re-login", async () => {
    let resolveDeviceId: (id: string | null) => void;
    native.getDeviceId.mockImplementationOnce(
      () => new Promise((resolve) => (resolveDeviceId = resolve)),
    );

    beaconOnInit({ apiKey: "kStale", url: URL_, primaryUserID: "u1" });
    await flush(); // stale beacon is now in-flight, awaiting getDeviceId

    beaconOnPpidUpdate(null); // logout: clears inFlight, bumps generation
    beaconOnPpidUpdate("u1"); // re-login with the SAME ppid: claims a fresh slot for the same key

    // The stale pre-logout call's getDeviceId now resolves and its `finally`
    // runs — it must NOT delete the slot the re-login just claimed.
    resolveDeviceId!("device-123");
    await flush();

    // A third fire for the same identity should be deduped against the
    // re-login's still-in-flight (or by-now captured) slot, not start a 3rd request.
    beaconOnInit({ apiKey: "kStale", url: URL_, primaryUserID: "u1" });
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1); // only the re-login's beacon fired
  });

  it("re-captures a returning identity when switching ppid A→B→A without an intervening logout", async () => {
    beaconOnInit({ apiKey: "kAcct", url: URL_, primaryUserID: "userA" });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    beaconOnPpidUpdate("userB"); // account switch, no logout in between
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    beaconOnPpidUpdate("userA"); // switching back — must NOT be deduped against the earlier capture
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("treats a whitespace-only ppid update as a logout on Android (matches native isNotBlank)", async () => {
    mutablePlatform.OS = "android";
    try {
      beaconOnInit({ apiKey: "kBlankAndroid", url: URL_, primaryUserID: "user1" });
      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      beaconOnPpidUpdate("   "); // whitespace-only → Android's native side clears the ppid too
      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(1); // no bogus "login" beacon fired for the blank id

      // Dedup memory must have been reset like a real logout — a genuine
      // re-login now runs a fresh capture instead of being silently deduped.
      beaconOnPpidUpdate("user1");
      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      mutablePlatform.OS = "ios";
    }
  });

  it("does NOT treat a whitespace-only ppid update as a logout on iOS (native only clears a literal empty string)", async () => {
    // mutablePlatform.OS is already "ios" (the mock's default).
    beaconOnInit({ apiKey: "kBlankIos", url: URL_, primaryUserID: "user1" });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    beaconOnPpidUpdate("   "); // whitespace-only → iOS's native side RETAINS it as the ppid
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2); // treated as a (weird) login, not a logout
    expect(paramsOf(1).get("ppid")).toBe("   ");

    // Since it wasn't a logout, dedup memory for "user1" is untouched — switching
    // straight back to it is still a fresh identity switch (not a dedup false-positive).
    beaconOnPpidUpdate("user1");
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("passes a whitespace-only initial primaryUserID through as-is (native doesn't blank-filter at init)", async () => {
    beaconOnInit({ apiKey: "kBlankInit", url: URL_, primaryUserID: "   " });
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const q = paramsOf();
    expect(q.get("ppid")).toBe("   ");
  });

  // ── ppid update racing native init (armed, not yet fired) ──────────────────

  it("is a no-op when a ppid update arrives before any init is armed", async () => {
    beaconOnPpidUpdate("u1"); // nothing armed yet → nothing to beacon
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not drop a login that lands while native init is still in flight", async () => {
    // arm = init started (anonymous), native init not resolved yet.
    beaconArmInit({ apiKey: "kRace", url: URL_ });
    // Login lands BEFORE the init beacon fires — must still capture it.
    beaconOnPpidUpdate("u1");
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(paramsOf(0).get("ppid")).toBe("u1");

    // Native init now resolves and fires: it must reuse the CURRENT (updated)
    // ppid, so it dedups against the login beacon instead of firing anonymously.
    beaconFireInit();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fires anonymously (drops the stale ppid) when a logout lands before init fires", async () => {
    // arm = init started carrying "u1", native init not resolved yet.
    beaconArmInit({ apiKey: "kRaceOut", url: URL_, primaryUserID: "u1" });
    // Logout lands before the init beacon fires — resets, no request.
    beaconOnPpidUpdate(null);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();

    // Native init now resolves and fires: it must NOT beacon the stale "u1"
    // (the session is logged out) — it fires anonymously instead.
    beaconFireInit();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(paramsOf(0).has("ppid")).toBe(false);
  });

  it("bounds a hung getDeviceId call so it doesn't block the dedup slot forever", async () => {
    jest.useFakeTimers();
    try {
      native.getDeviceId.mockReturnValueOnce(new Promise(() => {})); // never resolves

      beaconOnInit({ apiKey: "kHang", url: URL_ });
      await Promise.resolve(); // let the synchronous part of `fire` run

      jest.advanceTimersByTime(2000); // DEVICE_ID_TIMEOUT_MS
      await Promise.resolve();
      await Promise.resolve();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const q = paramsOf();
      expect(q.has("did")).toBe(false); // device id never resolved, so it's omitted
    } finally {
      jest.useRealTimers();
    }
  });
});
