import { describe, expect, it } from "vitest";
import { buildAgentDoc } from "../agent-io";

describe("buildAgentDoc — lenient read", () => {
  it("parses a fully valid agent without validationIssues", () => {
    const raw = `---\nname: code-reviewer\ndescription: Reviews PRs for the team\n---\n\nbody.\n`;
    const doc = buildAgentDoc("code-reviewer", raw);
    expect(doc.validationIssues).toBeUndefined();
    expect(doc.frontmatter.name).toBe("code-reviewer");
    expect(doc.frontmatter.description).toBe("Reviews PRs for the team");
    expect(doc.body).toContain("body.");
  });

  it("returns the doc with validationIssues when filename is not kebab-case", () => {
    const raw = `---\ndescription: short ok\n---\n\nbody.\n`;
    const doc = buildAgentDoc("My_Agent", raw);
    expect(doc.frontmatter.name).toBe("My_Agent");
    expect(doc.frontmatter.description).toBe("short ok");
    expect(doc.body).toContain("body.");
    expect(doc.validationIssues).toBeDefined();
    expect(doc.validationIssues?.some((i) => i.path[0] === "name")).toBe(true);
  });

  it("returns the doc when description is empty (legacy file)", () => {
    const raw = `---\nname: legacy\n---\n\nbody only.\n`;
    const doc = buildAgentDoc("legacy", raw);
    // current schema: description min 1 → empty string fails
    expect(doc.validationIssues).toBeDefined();
    expect(
      doc.validationIssues?.some((i) => i.path[0] === "description"),
    ).toBe(true);
    expect(doc.frontmatter.description).toBe("");
  });

  it("preserves valid tools but drops non-string entries silently", () => {
    const raw = `---\nname: bad-tools\ndescription: yes ok\ntools: ["Read", 42, "Edit"]\n---\nb`;
    const doc = buildAgentDoc("bad-tools", raw);
    // schema requires array of strings → validation fails, fallback used
    expect(doc.validationIssues).toBeDefined();
    expect(doc.frontmatter.tools).toEqual(["Read", "Edit"]);
  });

  it("falls back to undefined model when value is unknown", () => {
    const raw = `---\nname: x-model\ndescription: descr ok\nmodel: gpt-5\n---\nb`;
    const doc = buildAgentDoc("x-model", raw);
    expect(doc.validationIssues).toBeDefined();
    expect(doc.frontmatter.model).toBeUndefined();
  });

  it("sets filePath when provided", () => {
    const raw = `---\nname: ok-name\ndescription: desc text\n---\nb`;
    const doc = buildAgentDoc("ok-name", raw, "/tmp/p/.claude/agents/ok-name.md");
    expect(doc.filePath).toBe("/tmp/p/.claude/agents/ok-name.md");
  });

  it("filename overrides any frontmatter.name (canonical identity)", () => {
    // 두 다른 파일이 같은 frontmatter.name을 갖는 시나리오:
    // 사이드바에서 React key 충돌이 일어나지 않게, 파일명이 우선이어야 한다.
    const raw = `---\nname: test\ndescription: ok\n---\nbody`;
    const docA = buildAgentDoc("test", raw);
    const docB = buildAgentDoc("TestAgent", raw);
    expect(docA.frontmatter.name).toBe("test");
    expect(docB.frontmatter.name).toBe("TestAgent");
    // 두 doc은 서로 다른 name을 갖는다 → React key 충돌 없음
    expect(docA.frontmatter.name).not.toBe(docB.frontmatter.name);
  });
});
