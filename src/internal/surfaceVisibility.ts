export type SurfaceVisibilityAction = "show" | "hide" | null;

/** Keeps hide independent of credentials while deferring show until configuration is valid. */
export function surfaceVisibilityAction(
  isOpen: boolean,
  shownForOpenCycle: boolean,
  canShow: boolean,
): SurfaceVisibilityAction {
  if (!isOpen) return shownForOpenCycle ? "hide" : null;
  return !shownForOpenCycle && canShow ? "show" : null;
}
