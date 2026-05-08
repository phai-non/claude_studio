import { describe, expect, it } from "vitest";
import { parseDoc, stringifyDoc } from "../frontmatter";

describe("frontmatter", () => {
  it("parses agent frontmatter and body", () => {
    const raw = `---\nname: code-reviewer\ndescription: Reviews PRs\ntools: [Read, Edit]\nmodel: sonnet\n---\n\nYou are a senior code reviewer.\n`;
    const { data, content } = parseDoc<{
      name: string;
      description: string;
      tools: string[];
      model: string;
    }>(raw);
    expect(data.name).toBe("code-reviewer");
    expect(data.tools).toEqual(["Read", "Edit"]);
    expect(content.startsWith("You are a senior")).toBe(true);
  });

  it("round-trips frontmatter via stringify", () => {
    const original = {
      name: "test-agent",
      description: "Just a test",
      tools: ["Read", "Edit"],
      model: "haiku",
    };
    const out = stringifyDoc(original, "Body content here.");
    const { data, content } = parseDoc<typeof original>(out);
    expect(data).toEqual(original);
    expect(content).toContain("Body content here.");
  });

  it("quotes strings with special characters", () => {
    const out = stringifyDoc(
      { description: "Has: a colon" },
      "body",
    );
    expect(out).toContain('description: "Has: a colon"');
  });

  it("emits arrays inline for short scalar lists", () => {
    const out = stringifyDoc({ tools: ["Read", "Edit", "Bash"] }, "body");
    expect(out).toContain("tools: [Read, Edit, Bash]");
  });

  it("skips empty/null/undefined fields", () => {
    const out = stringifyDoc(
      { name: "x", color: "", tools: [] as string[], extra: undefined },
      "body",
    );
    expect(out).not.toContain("color");
    expect(out).not.toContain("tools");
    expect(out).not.toContain("extra");
  });
});
