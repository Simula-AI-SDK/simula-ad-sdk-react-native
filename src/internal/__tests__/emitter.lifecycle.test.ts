import { warnIfDuplicateSurface } from "../emitter";

describe("duplicate surface ownership", () => {
  it("remains duplicated until every mounted owner unregisters", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const offA = warnIfDuplicateSurface("StressSurface");
    const offB = warnIfDuplicateSurface("StressSurface");

    expect(warn).toHaveBeenCalledTimes(1);
    offA();
    const offC = warnIfDuplicateSurface("StressSurface");
    expect(warn).toHaveBeenCalledTimes(2);

    offA();
    offB();
    offC();
    warn.mockRestore();
  });

  it("makes cleanup idempotent without unregistering another owner", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const offA = warnIfDuplicateSurface("IdempotentSurface");
    const offB = warnIfDuplicateSurface("IdempotentSurface");

    offA();
    offA();
    const offC = warnIfDuplicateSurface("IdempotentSurface");
    expect(warn).toHaveBeenCalledTimes(2);

    offB();
    offC();
    warn.mockRestore();
  });
});
