import { describe, expect, it } from "vitest";
import { compareDottedVersion } from "../tauri";

describe("compareDottedVersion", () => {
  it("returns 0 when versions are identical", () => {
    expect(compareDottedVersion("2.1.133", "2.1.133")).toBe(0);
  });

  it("returns positive when current is older", () => {
    expect(compareDottedVersion("2.1.133", "2.2.0")).toBeGreaterThan(0);
    expect(compareDottedVersion("1.0.0", "2.0.0")).toBeGreaterThan(0);
    expect(compareDottedVersion("2.1.130", "2.1.131")).toBeGreaterThan(0);
  });

  it("returns negative when current is newer", () => {
    expect(compareDottedVersion("2.2.0", "2.1.133")).toBeLessThan(0);
  });

  it("strips trailing parenthetical or label", () => {
    expect(compareDottedVersion("2.1.133 (Claude Code)", "2.1.133")).toBe(0);
  });

  it("treats missing minor/patch as 0", () => {
    expect(compareDottedVersion("2", "2.0.0")).toBe(0);
    expect(compareDottedVersion("2", "2.0.1")).toBeGreaterThan(0);
  });
});
