import {
  normalizeJson,
  safeStringify,
  UNSERIALIZABLE_SENTINEL,
} from "../safeStringify";

describe("safeStringify", () => {
  it("stringifies plain values like JSON.stringify", () => {
    expect(safeStringify(null)).toBe("null");
    expect(safeStringify({ a: 1, b: ["x", true] })).toBe(
      JSON.stringify({ a: 1, b: ["x", true] }),
    );
  });

  it("returns the stable fallback for circular structures", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(safeStringify(circular)).toBe(UNSERIALIZABLE_SENTINEL);
  });

  it("returns the stable fallback for BigInt values", () => {
    expect(safeStringify({ n: BigInt(1) })).toBe(UNSERIALIZABLE_SENTINEL);
  });

  it("never throws on a throwing toJSON", () => {
    const evil = {
      toJSON() {
        throw new Error("boom");
      },
    };
    expect(safeStringify(evil)).toBe(UNSERIALIZABLE_SENTINEL);
  });
});

describe("normalizeJson", () => {
  it("returns a detached deep clone containing JSON-compatible values only", () => {
    const source = {
      nested: { keep: true, drop: undefined },
      list: [1, undefined, Number.NaN],
    };
    const normalized = normalizeJson(source);
    expect(normalized.serializable).toBe(true);
    if (!normalized.serializable) return;
    expect(normalized.value).toEqual({
      nested: { keep: true },
      list: [1, null, null],
    });
    expect(normalized.value).not.toBe(source);
    expect(normalized.value.nested).not.toBe(source.nested);
  });

  it("rejects a top-level non-JSON value", () => {
    expect(normalizeJson(undefined).serializable).toBe(false);
  });
});
