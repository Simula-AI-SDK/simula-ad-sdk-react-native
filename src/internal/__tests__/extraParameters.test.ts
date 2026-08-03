import {
  isValidExtraParameter,
  serializeExtraParameters,
} from "../extraParameters";
import type { SimulaExtraParameters } from "../../ads/types";

describe("serializeExtraParameters", () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it("serializes accepted entries in deterministic key order", () => {
    expect(serializeExtraParameters({ z: "last", a: "first" })).toBe(
      '{"a":"first","z":"last"}',
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("rejects an empty key", () => {
    expect(serializeExtraParameters({ "": "value" })).toBeNull();
    expect(isValidExtraParameter("", "value")).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("rejects nullish single-value bridge arguments", () => {
    expect(isValidExtraParameter(null, "value")).toBe(false);
    expect(isValidExtraParameter("key", undefined)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("measures Unicode code points like the backend", () => {
    const allowed = "🚀".repeat(64);
    const rejected = "🚀".repeat(65);

    expect(serializeExtraParameters({ [allowed]: allowed })).toBe(
      JSON.stringify({ [allowed]: allowed }),
    );
    expect(serializeExtraParameters({ [rejected]: "value" })).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("sorts before capping at ten entries", () => {
    const parameters = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [
        `key_${String(11 - index).padStart(2, "0")}`,
        String(11 - index),
      ]),
    );

    expect(JSON.parse(serializeExtraParameters(parameters) ?? "{}")).toEqual(
      Object.fromEntries(
        Array.from({ length: 10 }, (_, index) => [
          `key_${String(index).padStart(2, "0")}`,
          String(index),
        ]),
      ),
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).not.toContain("key_");
  });

  it("drops invalid keys and runtime non-string or oversized values", () => {
    const parameters = {
      valid: "kept",
      "$private": "drop",
      "has.dot": "drop",
      ["k".repeat(65)]: "drop",
      tooLong: "v".repeat(257),
      nonString: 42,
    } as unknown as SimulaExtraParameters;

    expect(serializeExtraParameters(parameters)).toBe('{"valid":"kept"}');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toBe(
      "[SimulaAds] Some extra parameters were ignored because they are invalid or exceed SDK limits.",
    );
  });

  it("uses null as the empty view representation", () => {
    expect(serializeExtraParameters(undefined)).toBeNull();
    expect(serializeExtraParameters({})).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});
