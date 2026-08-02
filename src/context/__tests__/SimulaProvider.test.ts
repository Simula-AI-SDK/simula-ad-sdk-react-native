import {
  normalizeProviderAdContextPayload,
  normalizeProviderPrivacyPayload,
} from "../../internal/providerPayload";
import { resolvePrivacyConsent } from "../../privacy/sanitize";

describe("SimulaProvider bridge payload normalization", () => {
  it("preserves provider revocation despite malformed and extra siblings", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const normalized = normalizeProviderPrivacyPayload({
      hasPrivacyConsent: false,
      coppaApplies: true,
      gppSid: 7,
      tcString: circular,
      extra: BigInt(1),
    } as never);
    expect(normalized.value).toEqual({
      hasPrivacyConsent: false,
      coppaApplies: true,
      gppSid: "7",
    });
    expect(resolvePrivacyConsent(normalized.value, true)).toBe(false);
  });

  it("keeps provider context siblings when one custom entry is circular", () => {
    const customContext: Record<string, unknown> = { keep: ["a", "b"] };
    customContext.circular = customContext;
    const normalized = normalizeProviderAdContextPayload({
      category: "sports",
      tags: ["one", 2] as unknown as string[],
      customContext,
    });
    expect(normalized.value).toEqual({
      category: "sports",
      tags: ["one"],
      customContext: { keep: ["a", "b"] },
    });
  });

  it("normalizes an absent provider prop to JSON null", () => {
    expect(normalizeProviderPrivacyPayload(undefined)).toEqual({
      key: "null",
      value: null,
    });
    expect(normalizeProviderAdContextPayload(undefined)).toEqual({
      key: "null",
      value: null,
    });
  });
});
