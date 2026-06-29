import {
  beaconOnInit,
  beaconOnPpidUpdate,
  __resetBeaconStateForTests,
} from "../ipv4Beacon";
import { NativeModules } from "../../test/reactNativeMock";

const native = NativeModules.SimulaAdsModule;
const URL_ = "https://ip4.test/px";

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
  it("no-ops when no beacon URL is configured (default disabled)", async () => {
    beaconOnInit({ apiKey: "k" }); // url omitted → IPV4_BEACON_URL is ""
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
});
