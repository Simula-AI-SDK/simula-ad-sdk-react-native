/**
 * Single shared `NativeEventEmitter` for the declarative MiniGame surfaces.
 *
 * Previously each component file created its own `new NativeEventEmitter(...)`.
 * They all wrap the same native module and the same global event names, so one
 * shared emitter is sufficient and keeps the native bridge's listener bookkeeping
 * minimal. `null` when the native module isn't linked (e.g. in tests).
 */
import { NativeModules, NativeEventEmitter } from "react-native";
import { warnNativeSurfaceUnavailable } from "./nativeModules";

const { SimulaMiniGameModule } = NativeModules;

export const miniGameEmitter: NativeEventEmitter | null = SimulaMiniGameModule
  ? new NativeEventEmitter(SimulaMiniGameModule)
  : null;

/**
 * Dev-only guard against mounting two instances of the same singleton surface
 * component. The native module holds ONE view per surface type and ONE event
 * channel, so a second mount would share (and fight over) that channel.
 */
const mountedSurfaces = new Map<string, number>();
const warnedDuplicateSurfaces = new Set<string>();

export function warnIfDuplicateSurface(surface: string): () => void {
  if (!__DEV__) return () => {};
  const count = mountedSurfaces.get(surface) ?? 0;
  if (count > 0 && !warnedDuplicateSurfaces.has(surface)) {
    warnedDuplicateSurfaces.add(surface);
    console.warn(
      `[Simula] Multiple ${surface} components are mounted. ` +
        "This native surface is a singleton; keep only one mounted instance.",
    );
  }
  mountedSurfaces.set(surface, count + 1);
  return () => {
    const next = (mountedSurfaces.get(surface) ?? 1) - 1;
    if (next > 0) mountedSurfaces.set(surface, next);
    else mountedSurfaces.delete(surface);
  };
}

export function warnMiniGameUnavailable(surface: string): void {
  warnNativeSurfaceUnavailable(surface, "SimulaMiniGameModule");
}
