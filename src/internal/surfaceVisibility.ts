export type SurfaceVisibilityAction = "show" | "hide" | null;

/** Keeps hide independent of credentials while deferring show until configuration is valid. */
export function surfaceVisibilityAction(
  isOpen: boolean,
  wasOpen: boolean,
  canShow: boolean,
): SurfaceVisibilityAction {
  if (!isOpen) return wasOpen ? "hide" : null;
  return !wasOpen && canShow ? "show" : null;
}
