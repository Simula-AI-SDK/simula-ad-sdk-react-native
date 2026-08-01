/**
 * Races a native-settled promise against a hard bound (RN-6). A dropped native
 * completion (e.g. an ATT prompt the system never answers, or a lost SDK
 * callback) would otherwise strand the caller's `await` forever. On timeout the
 * race resolves the fallback; the underlying promise's later settlement is
 * absorbed by the race (no unhandled rejection).
 */
export const NATIVE_COMPLETION_TIMEOUT_MS = 10_000;

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout: () => T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
