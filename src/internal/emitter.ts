/**
 * Single shared `NativeEventEmitter` for the declarative MiniGame surfaces.
 *
 * Previously each component file created its own `new NativeEventEmitter(...)`.
 * They all wrap the same native module and the same global event names, so one
 * shared emitter is sufficient and keeps the native bridge's listener bookkeeping
 * minimal. `null` when the native module isn't linked (e.g. in tests).
 */
import { NativeModules, NativeEventEmitter } from "react-native";
import { IS_DEVELOPMENT } from "./environment";

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
  if (!IS_DEVELOPMENT) return () => {};
  if (mountedSurfaces.has(surface)) {
    console.warn(
      `[SimulaMiniGame] Multiple <${surface}> instances are mounted at once. ` +
        `Each surface is a singleton natively (one view, one event channel); ` +
        `mount only one at a time to avoid missed or cross-routed events.`,
    );
  }
  mountedSurfaces.add(surface);
  return () => {
    mountedSurfaces.delete(surface);
  };
}
