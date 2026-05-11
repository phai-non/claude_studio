import { describe, expect, it } from "vitest";
import {
  emptyHooksState,
  HOOK_EVENTS,
} from "@/lib/schemas/hooks";
import { parseSettingsRaw, serializeWithHooks } from "../hooks-io";

describe("parseSettingsRaw", () => {
  it("빈 문자열은 빈 settings + 빈 hooks", () => {
    const r = parseSettingsRaw("");
    expect(r.parseError).toBeUndefined();
    expect(r.settings).toEqual({});
    for (const event of HOOK_EVENTS) {
      expect(r.hooks[event]).toEqual([]);
    }
  });

  it("hooks 키가 없는 settings는 다른 키만 settings에 살아남음", () => {
    const raw = JSON.stringify({
      model: "claude-opus-4-7",
      permissions: { allow: ["Bash"] },
    });
    const r = parseSettingsRaw(raw);
    expect(r.parseError).toBeUndefined();
    expect(r.settings).toEqual({
      model: "claude-opus-4-7",
      permissions: { allow: ["Bash"] },
    });
    expect(r.hooks.PreToolUse).toEqual([]);
  });

  it("정상 hooks를 폼 state로 변환", () => {
    const raw = JSON.stringify({
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [{ type: "command", command: "echo hi" }],
          },
        ],
      },
    });
    const r = parseSettingsRaw(raw);
    expect(r.parseError).toBeUndefined();
    expect(r.hooks.PreToolUse).toHaveLength(1);
    expect(r.hooks.PreToolUse[0]).toEqual({
      matcher: "Bash",
      hooks: [{ type: "command", command: "echo hi" }],
    });
  });

  it("스키마 안 맞는 entry는 조용히 drop, 정상 entry는 살아남음", () => {
    const raw = JSON.stringify({
      hooks: {
        PreToolUse: [
          { matcher: "Bash", hooks: [] }, // hooks 비어있어서 invalid
          {
            matcher: "Read",
            hooks: [{ type: "command", command: "ls" }],
          },
        ],
      },
    });
    const r = parseSettingsRaw(raw);
    expect(r.parseError).toBeUndefined();
    expect(r.hooks.PreToolUse).toHaveLength(1);
    expect(r.hooks.PreToolUse[0].matcher).toBe("Read");
  });

  it("잘못된 JSON은 parseError를 채우고 빈 상태 반환", () => {
    const r = parseSettingsRaw("{not valid json");
    expect(r.parseError).toBeDefined();
    expect(r.settings).toEqual({});
    expect(r.hooks).toEqual(emptyHooksState());
  });

  it("최상위가 배열이면 parseError", () => {
    const r = parseSettingsRaw("[1, 2, 3]");
    expect(r.parseError).toBeDefined();
  });
});

describe("serializeWithHooks", () => {
  it("빈 hooks는 hooks 키를 settings에서 제거", () => {
    const out = serializeWithHooks(
      { model: "x", hooks: { PreToolUse: [] } },
      emptyHooksState(),
    );
    const parsed = JSON.parse(out);
    expect(parsed).toEqual({ model: "x" });
    expect(out.endsWith("\n")).toBe(true);
  });

  it("hooks 외 키는 보존", () => {
    const state = emptyHooksState();
    state.PreToolUse.push({
      matcher: "Bash",
      hooks: [{ type: "command", command: "echo go" }],
    });
    const out = serializeWithHooks(
      {
        model: "claude-opus-4-7",
        permissions: { allow: ["Bash"] },
        env: { DEBUG: "1" },
      },
      state,
    );
    const parsed = JSON.parse(out);
    expect(parsed.model).toBe("claude-opus-4-7");
    expect(parsed.permissions).toEqual({ allow: ["Bash"] });
    expect(parsed.env).toEqual({ DEBUG: "1" });
    expect(parsed.hooks.PreToolUse).toHaveLength(1);
  });

  it("빈 event는 결과 hooks 객체에서 제외", () => {
    const state = emptyHooksState();
    state.PostToolUse.push({
      matcher: "",
      hooks: [{ type: "command", command: "log" }],
    });
    const out = serializeWithHooks({}, state);
    const parsed = JSON.parse(out);
    expect(parsed.hooks.PreToolUse).toBeUndefined();
    expect(parsed.hooks.PostToolUse).toHaveLength(1);
  });

  it("들여쓰기 2칸 직렬화", () => {
    const state = emptyHooksState();
    state.PreToolUse.push({
      matcher: "Bash",
      hooks: [{ type: "command", command: "echo" }],
    });
    const out = serializeWithHooks({}, state);
    expect(out).toContain('  "hooks": {');
    expect(out).toContain('    "PreToolUse": [');
  });

  it("read → modify → write round-trip", () => {
    const original = JSON.stringify(
      {
        model: "x",
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [{ type: "command", command: "echo a" }],
            },
          ],
        },
      },
      null,
      2,
    );
    const parsed = parseSettingsRaw(original);
    parsed.hooks.PostToolUse.push({
      matcher: "Edit",
      hooks: [{ type: "command", command: "echo b" }],
    });
    const out = serializeWithHooks(parsed.settings, parsed.hooks);
    const reparsed = JSON.parse(out);
    expect(reparsed.model).toBe("x");
    expect(reparsed.hooks.PreToolUse).toHaveLength(1);
    expect(reparsed.hooks.PostToolUse).toHaveLength(1);
  });
});
