import { safeJsonSnapshot } from "../safeJson";

describe("safeJsonSnapshot", () => {
  it("preserves JSON identity and returns a plain snapshot for normal values", () => {
    const value = { category: "sports", nested: [true, null, { score: 3 }] };
    const snapshot = safeJsonSnapshot(value);

    expect(snapshot?.identity).toBe(JSON.stringify(value));
    expect(snapshot?.value).toEqual(value);
    expect(snapshot?.value).not.toBe(value);
  });

  it("returns undefined for cycles and BigInt", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;

    expect(safeJsonSnapshot(cycle)).toBeUndefined();
    expect(safeJsonSnapshot({ value: 1n })).toBeUndefined();
  });

  it("returns undefined for throwing getters and toJSON methods", () => {
    const getter = Object.defineProperty({}, "value", {
      enumerable: true,
      get() {
        throw new Error("nope");
      },
    });
    const toJSON = {
      toJSON() {
        throw new Error("nope");
      },
    };

    expect(safeJsonSnapshot(getter)).toBeUndefined();
    expect(safeJsonSnapshot(toJSON)).toBeUndefined();
  });

  it("returns undefined for a throwing proxy", () => {
    const proxy = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("nope");
        },
      },
    );

    expect(safeJsonSnapshot(proxy)).toBeUndefined();
  });
});
