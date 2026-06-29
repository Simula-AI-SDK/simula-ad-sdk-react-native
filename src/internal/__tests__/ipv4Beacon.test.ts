import { beaconOnInit, beaconOnPpidUpdate } from "../ipv4Beacon";
import { NativeModules } from "../../test/reactNativeMock";

const native = NativeModules.SimulaAdsModule;
const URL_ = "https://ip4.test/px";

/** Flush the microtask + immediate queues so the fire-and-forget beacon runs. */
const flush = () => new Promise((r) => setImmediate(r));

let fetchMock: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock = jest.fn().mockResolvedValue({ ok: true });
  global.fetch = fetchMock as unknown as typeof fetch;
});

/** Parse the single fetched URL into its query params. */
function fetchedParams(): URLSearchParams {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
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

    const q = fetchedParams();
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

    const q = fetchedParams();
    expect(q.has("did")).toBe(false);
    expect(q.has("ppid")).toBe(false);
    expect(q.get("k")).toBe("k2");
  });

  it("is not consent-gated — fires once a URL is configured", async () => {
    native.getDeviceId.mockResolvedValueOnce("dev-C2");
    beaconOnInit({ apiKey: "k", url: URL_ });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-fires on a ppid update reusing the init identity, and no-ops on logout", async () => {
    native.getDeviceId.mockResolvedValue("dev-F");
    beaconOnInit({ apiKey: "k3", url: URL_ });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    beaconOnPpidUpdate("u9");
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const q = new URL(fetchMock.mock.calls[1][0] as string).searchParams;
    expect(q.get("r")).toBe("ppid_update");
    expect(q.get("ppid")).toBe("u9");
    expect(q.get("k")).toBe("k3"); // identity carried from init

    beaconOnPpidUpdate(null); // logout → no-op
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("dedups identical back-to-back beacons", async () => {
    native.getDeviceId.mockResolvedValue("dev-G");
    beaconOnInit({ apiKey: "k", url: URL_ });
    await flush();
    beaconOnInit({ apiKey: "k", url: URL_ });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never throws when fetch rejects", async () => {
    native.getDeviceId.mockResolvedValueOnce("dev-H");
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    expect(() => beaconOnInit({ apiKey: "k", url: URL_ })).not.toThrow();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
