export interface SafeJsonSnapshot<T> {
  identity: string;
  value: T;
}

/** Returns a plain JSON snapshot, or undefined when user-provided data is unsafe. */
export function safeJsonSnapshot<T>(value: T): SafeJsonSnapshot<T> | undefined {
  try {
    const identity = JSON.stringify(value);
    if (identity === undefined) return undefined;
    return { identity, value: JSON.parse(identity) as T };
  } catch {
    return undefined;
  }
}
