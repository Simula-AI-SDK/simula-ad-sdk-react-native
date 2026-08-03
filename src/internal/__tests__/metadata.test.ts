import {
  isValidMetadataValue,
  serializeMetadata,
} from "../metadata";
import type { SimulaMetadata } from "../../ads/types";

describe("serializeMetadata", () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it("serializes accepted entries in deterministic key order", () => {
    expect(serializeMetadata({ z: "last", a: "first" })).toBe(
      '{"a":"first","z":"last"}',
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("rejects an empty key", () => {
    expect(serializeMetadata({ "": "value" })).toBeNull();
    expect(isValidMetadataValue("", "value")).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("rejects nullish single-value bridge arguments", () => {
    expect(isValidMetadataValue(null, "value")).toBe(false);
    expect(isValidMetadataValue("key", undefined)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("measures Unicode code points like the backend", () => {
    const allowed = "🚀".repeat(64);
    const rejected = "🚀".repeat(65);

    expect(serializeMetadata({ [allowed]: allowed })).toBe(
      JSON.stringify({ [allowed]: allowed }),
    );
    expect(serializeMetadata({ [rejected]: "value" })).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("sorts before capping at ten entries", () => {
    const metadata = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [
        `key_${String(11 - index).padStart(2, "0")}`,
        String(11 - index),
      ]),
    );

    expect(JSON.parse(serializeMetadata(metadata) ?? "{}")).toEqual(
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
    const metadata = {
      valid: "kept",
      "$private": "drop",
      "has.dot": "drop",
      ["k".repeat(65)]: "drop",
      tooLong: "v".repeat(257),
      nonString: 42,
    } as unknown as SimulaMetadata;

    expect(serializeMetadata(metadata)).toBe('{"valid":"kept"}');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toBe(
      "[SimulaAds] Some metadata was ignored because it is invalid or exceeds SDK limits.",
    );
  });

  it("uses null as the empty view representation", () => {
    expect(serializeMetadata(undefined)).toBeNull();
    expect(serializeMetadata({})).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});
