import {
  warnIfDuplicateSurface,
  warnMiniGameUnavailable,
} from "../emitter";
import { warnNativeSurfaceUnavailable } from "../nativeModules";

describe("development diagnostics", () => {
  it("warns once when a singleton surface is mounted twice", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const cleanupFirst = warnIfDuplicateSurface("DiagnosticSurface");
    const cleanupSecond = warnIfDuplicateSurface("DiagnosticSurface");
    const cleanupThird = warnIfDuplicateSurface("DiagnosticSurface");

    expect(warn).toHaveBeenCalledTimes(1);
    cleanupThird();
    cleanupSecond();
    cleanupFirst();
    warn.mockRestore();
  });

  it("warns once per unavailable mini-game/native-view surface", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    warnMiniGameUnavailable("MissingMiniGameForTest");
    warnMiniGameUnavailable("MissingMiniGameForTest");
    warnNativeSurfaceUnavailable("MissingNativeAdForTest", "MissingView");
    warnNativeSurfaceUnavailable("MissingNativeAdForTest", "MissingView");

    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
