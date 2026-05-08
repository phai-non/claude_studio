import { describe, expect, it } from "vitest";
import { parseDoc, stringifyDoc } from "../frontmatter";

describe("frontmatter — parse", () => {
  it("parses scalar key:value pairs", () => {
    const raw = `---\nname: code-reviewer\ndescription: Reviews PRs\n---\n\nbody.\n`;
    const { data, content } = parseDoc<{
      name: string;
      description: string;
    }>(raw);
    expect(data.name).toBe("code-reviewer");
    expect(data.description).toBe("Reviews PRs");
    expect(content.startsWith("body.")).toBe(true);
  });

  it("parses inline arrays", () => {
    const raw = `---\ntools: [Read, Edit, Bash]\n---\nbody`;
    const { data } = parseDoc<{ tools: string[] }>(raw);
    expect(data.tools).toEqual(["Read", "Edit", "Bash"]);
  });

  it("parses block-style lists", () => {
    const raw = `---\nallowed-tools:\n  - Bash\n  - Read\n---\nbody`;
    const { data } = parseDoc<{ "allowed-tools": string[] }>(raw);
    expect(data["allowed-tools"]).toEqual(["Bash", "Read"]);
  });

  it("unquotes double-quoted strings and decodes escaped quotes", () => {
    const raw = `---\ndescription: "has: colon and \\"quote\\""\n---\nbody`;
    const { data } = parseDoc<{ description: string }>(raw);
    expect(data.description).toBe('has: colon and "quote"');
  });

  it("returns empty data + raw body when no frontmatter present", () => {
    const raw = `# Just a markdown file\n\nNo frontmatter here.\n`;
    const { data, content } = parseDoc<Record<string, unknown>>(raw);
    expect(data).toEqual({});
    expect(content.startsWith("# Just a markdown")).toBe(true);
  });

  it("does not throw on malformed YAML — falls back to empty data", () => {
    const raw = `---\n!!! invalid &^*( @@@\n---\n\nbody.\n`;
    const result = parseDoc<Record<string, unknown>>(raw);
    expect(result.data).toEqual({});
    expect(result.content).toContain("body.");
  });

  it("does not throw on empty file", () => {
    expect(() => parseDoc("")).not.toThrow();
    expect(parseDoc("").data).toEqual({});
  });

  it("ignores comment lines starting with #", () => {
    const raw = `---\n# this is a comment\nname: ok\n---\nbody`;
    const { data } = parseDoc<{ name: string }>(raw);
    expect(data.name).toBe("ok");
  });

  it("parses booleans and numbers", () => {
    const raw = `---\nenabled: true\ncount: 42\n---\nbody`;
    const { data } = parseDoc<{ enabled: boolean; count: number }>(raw);
    expect(data.enabled).toBe(true);
    expect(data.count).toBe(42);
  });
});

describe("frontmatter — stringify", () => {
  it("round-trips full agent frontmatter (inline array)", () => {
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
    const out = stringifyDoc({ description: "Has: a colon" }, "body");
    expect(out).toContain('description: "Has: a colon"');
    const { data } = parseDoc<{ description: string }>(out);
    expect(data.description).toBe("Has: a colon");
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
