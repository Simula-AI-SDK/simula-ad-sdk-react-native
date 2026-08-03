export function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function warnInvalidIdentifier(method: string, name: string): void {
  if (__DEV__) {
    console.warn(
      `[SimulaAds] ${method} ignored because ${name} must be a non-empty string.`,
    );
  }
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
