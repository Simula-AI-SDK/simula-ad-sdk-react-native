import { surfaceVisibilityAction } from "../surfaceVisibility";

describe("surfaceVisibilityAction", () => {
  it("defers show until configuration becomes valid", () => {
    expect(surfaceVisibilityAction(true, false, false)).toBeNull();
    expect(surfaceVisibilityAction(true, false, true)).toBe("show");
  });

  it("always allows an open native surface to hide", () => {
    expect(surfaceVisibilityAction(false, true, false)).toBe("hide");
    expect(surfaceVisibilityAction(false, true, true)).toBe("hide");
  });

  it("does not repeat settled transitions", () => {
    expect(surfaceVisibilityAction(true, true, true)).toBeNull();
    expect(surfaceVisibilityAction(false, false, true)).toBeNull();
  });

  it("keeps a shown open cycle latched across credential changes", () => {
    expect(surfaceVisibilityAction(true, true, false)).toBeNull();
    expect(surfaceVisibilityAction(true, true, true)).toBeNull();
  });
});
