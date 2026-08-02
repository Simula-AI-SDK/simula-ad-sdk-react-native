import { SimulaPrivacy } from "../SimulaPrivacy";
import { NativeModules } from "../../test/reactNativeMock";

const native = NativeModules.SimulaAdsModule;

describe("SimulaPrivacy", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("waits for the ATT decision even when the user takes longer than 10 seconds", async () => {
    jest.useFakeTimers();
    let resolveNative: (value: string) => void = () => {};
    native.requestTrackingAuthorization.mockImplementationOnce(
      () => new Promise((resolve) => { resolveNative = resolve; }),
    );

    const outcome = SimulaPrivacy.requestTrackingAuthorization();
    let settled = false;
    void outcome.then(() => { settled = true; });
    jest.advanceTimersByTime(60_000);
    await Promise.resolve();
    expect(settled).toBe(false);

    resolveNative("authorized");
    await expect(outcome).resolves.toBe("authorized");
  });

  it("keeps the noninteractive status snapshot bounded", async () => {
    jest.useFakeTimers();
    native.getTrackingAuthorizationStatus.mockImplementationOnce(
      () => new Promise(() => {}),
    );

    const outcome = SimulaPrivacy.getTrackingAuthorizationStatus();
    jest.advanceTimersByTime(10_000);
    await expect(outcome).resolves.toBe("unavailable");
  });

  it("applies revocation and COPPA despite malformed siblings", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const hostValue = {
      hasPrivacyConsent: false,
      coppaApplies: true,
      gppSid: 6,
      tcString: circular,
      extra: BigInt(1),
    } as never;
    SimulaPrivacy.apply(hostValue);
    expect(native.applyConsent).toHaveBeenCalledWith({
      hasPrivacyConsent: false,
      coppaApplies: true,
      gppSid: "6",
    });
  });

  it("updates valid privacy siblings when another field is circular", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    SimulaPrivacy.update({
      hasPrivacyConsent: false,
      gdprApplies: true,
      gppSid: 2,
      gppString: circular,
    } as never);
    expect(native.updateConsent).toHaveBeenCalledWith({
      hasPrivacyConsent: false,
      gdprApplies: true,
      gppSid: "2",
    });
  });
});
