/**
 * Races a native-settled promise against a hard bound (RN-6). A dropped native
 * completion (for example, a lost SDK callback) would otherwise strand the
 * caller's `await` forever. User-driven prompts must not use this helper. On
 * timeout the fallback resolves; the underlying promise's later settlement is
 * observed without creating an unhandled rejection.
 */
export const NATIVE_COMPLETION_TIMEOUT_MS = 10_000;

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout: () => T,
  onLateResult?: (value: T) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      timedOut = true;
      try {
        resolve(onTimeout());
      } catch (error) {
        reject(error);
      }
    }, ms);

    promise.then(
      (value) => {
        if (timedOut) {
          // Cleanup callbacks are best-effort and must not create an unhandled
          // rejection after the caller has already received its fallback.
          try {
            onLateResult?.(value);
          } catch {
            // Native cleanup failures are intentionally absorbed.
          }
          return;
        }
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        // A rejection after timeout is observed here and intentionally absorbed.
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
