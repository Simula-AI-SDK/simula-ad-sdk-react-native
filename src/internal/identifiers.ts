export function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function requireNonBlankString(value: unknown, name: string): string {
  if (!isNonBlankString(value)) {
    throw new TypeError(`[SimulaAds] ${name} must be a non-empty string`);
  }
  return value;
}

export function optionalNonBlankString(
  value: unknown,
  name: string,
): string | undefined {
  return value == null ? undefined : requireNonBlankString(value, name);
}
