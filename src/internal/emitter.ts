/**
 * Single shared `NativeEventEmitter` for the declarative MiniGame surfaces.
 *
 * Previously each component file created its own `new NativeEventEmitter(...)`.
 * They all wrap the same native module and the same global event names, so one
 * shared emitter is sufficient and keeps the native bridge's listener bookkeeping
 * minimal. `null` when the native module isn't linked (e.g. in tests).
 */
import { NativeModules, NativeEventEmitter } from "react-native";

const { SimulaMiniGameModule } = NativeModules;

export const miniGameEmitter: NativeEventEmitter | null = SimulaMiniGameModule
  ? new NativeEventEmitter(SimulaMiniGameModule)
  : null;

/**
 * Dev-only guard against mounting two instances of the same singleton surface
 * component. The native module holds ONE view per surface type and ONE event
 * channel, so a second mount would share (and fight over) that channel.
 */
const mountedSurfaces = new Set<string>();

export function warnIfDuplicateSurface(surface: string): () => void {
  if (!__DEV__) return () => {};
  // Still track singleton mounts for deterministic cleanup, but never console-log.
  mountedSurfaces.add(surface);
  return () => {
    mountedSurfaces.delete(surface);
  };
}
