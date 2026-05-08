import { describe, expect, it } from "vitest";
import {
  AgentFrontmatterSchema,
  suggestKebabName,
} from "../schemas/agent";

describe("AgentFrontmatterSchema", () => {
  it("accepts kebab-case names", () => {
    const r = AgentFrontmatterSchema.safeParse({
      name: "code-reviewer",
      description: "Reviews pull requests carefully",
    });
    expect(r.success).toBe(true);
  });

  it("rejects PascalCase names", () => {
    const r = AgentFrontmatterSchema.safeParse({
      name: "CodeReviewer",
      description: "Reviews pull requests carefully",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe("agent.validation.nameKebab");
    }
  });

  it("rejects empty descriptions", () => {
    const r = AgentFrontmatterSchema.safeParse({
      name: "x",
      description: "",
    });
    expect(r.success).toBe(false);
  });

  it("accepts short non-empty descriptions", () => {
    const r = AgentFrontmatterSchema.safeParse({
      name: "x",
      description: "ok",
    });
    expect(r.success).toBe(true);
  });
});

describe("suggestKebabName", () => {
  it("converts PascalCase to kebab-case", () => {
    expect(suggestKebabName("My Cool Agent")).toBe("my-cool-agent");
  });

  it("strips special characters", () => {
    expect(suggestKebabName("Code@Reviewer!")).toBe("codereviewer");
  });

  it("collapses runs of separators", () => {
    expect(suggestKebabName("foo___bar  baz")).toBe("foo-bar-baz");
  });

  it("trims leading/trailing hyphens", () => {
    expect(suggestKebabName("--hello--")).toBe("hello");
  });
});
