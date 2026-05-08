import { describe, expect, it } from "vitest";
import { buildCommandDoc } from "../command-io";
import { stringifyDoc } from "@/lib/frontmatter";
import { CommandFrontmatterSchema } from "@/lib/schemas/command";

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

  it("preserves model field on read", () => {
    const raw = `---\ndescription: ok\nmodel: opus\n---\nb`;
    const doc = buildCommandDoc("with-model", raw);
    expect(doc.validationIssues).toBeUndefined();
    expect(doc.frontmatter.model).toBe("opus");
  });

  it("preserves custom model strings (not just KNOWN_MODELS)", () => {
    const raw = `---\ndescription: ok\nmodel: claude-haiku-4-5-20251001\n---\nb`;
    const doc = buildCommandDoc("custom-model", raw);
    expect(doc.frontmatter.model).toBe("claude-haiku-4-5-20251001");
  });

  it("stringify round-trips the model field", () => {
    // CommandForm submit이 frontmatter.model을 누락하면 디스크에서 model이
    // 사라진다. 폼 제출 모양을 그대로 재현해서 확인:
    const formSubmit = {
      description: "test desc",
      "argument-hint": "<x>",
      "allowed-tools": ["Bash"],
      model: "sonnet",
    };
    const fm = CommandFrontmatterSchema.parse(formSubmit);
    const out = stringifyDoc(fm, "body");
    const back = buildCommandDoc("rt", out);
    expect(back.frontmatter.model).toBe("sonnet");
  });
});
