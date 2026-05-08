import { describe, expect, it } from "vitest";
import { buildCommandDoc } from "../command-io";

describe("buildCommandDoc — lenient read", () => {
  it("parses a fully valid command without validationIssues", () => {
    const raw = `---\ndescription: commit current changes\nargument-hint: <message>\n---\n\nbody.\n`;
    const doc = buildCommandDoc("commit", raw);
    expect(doc.validationIssues).toBeUndefined();
    expect(doc.name).toBe("commit");
    expect(doc.frontmatter.description).toBe("commit current changes");
    expect(doc.frontmatter["argument-hint"]).toBe("<message>");
  });

  it("returns the doc with issues when description is empty", () => {
    const raw = `---\nargument-hint: <x>\n---\n\nbody.\n`;
    const doc = buildCommandDoc("no-desc", raw);
    expect(doc.validationIssues).toBeDefined();
    expect(
      doc.validationIssues?.some((i) => i.path[0] === "description"),
    ).toBe(true);
    expect(doc.frontmatter.description).toBe("");
  });

  it("filters non-string allowed-tools entries", () => {
    const raw = `---\ndescription: ok\nallowed-tools: ["Bash", 42, "Read"]\n---\nb`;
    const doc = buildCommandDoc("filter-tools", raw);
    expect(doc.frontmatter["allowed-tools"]).toEqual(["Bash", "Read"]);
  });
});
