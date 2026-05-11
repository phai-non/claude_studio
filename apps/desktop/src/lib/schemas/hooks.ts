import { z } from "zod";

/** Claude Code가 지원하는 hook event 이름 — 공식 문서 기준 9종. */
export const HOOK_EVENTS = [
  "PreToolUse",
  "PostToolUse",
  "UserPromptSubmit",
  "Notification",
  "Stop",
  "SubagentStop",
  "PreCompact",
  "SessionStart",
  "SessionEnd",
] as const;

export type HookEvent = (typeof HOOK_EVENTS)[number];

export const HookCommandSchema = z.object({
  type: z.literal("command"),
  command: z.string().min(1, "command가 비어 있습니다"),
});
export type HookCommand = z.infer<typeof HookCommandSchema>;

export const HookEntrySchema = z.object({
  matcher: z.string().default(""),
  hooks: z.array(HookCommandSchema).min(1, "최소 1개 command가 필요합니다"),
});
export type HookEntry = z.infer<typeof HookEntrySchema>;

/**
 * settings.json의 `hooks` 객체 형태.
 * 각 event는 선택 필드 — 비어 있으면 직렬화 시 키 자체를 생략한다.
 */
export const HooksSchema = z.object(
  Object.fromEntries(
    HOOK_EVENTS.map((e) => [e, z.array(HookEntrySchema).optional()]),
  ) as Record<HookEvent, z.ZodOptional<z.ZodArray<typeof HookEntrySchema>>>,
);
export type Hooks = z.infer<typeof HooksSchema>;

/** 빈 폼 초기값. 모든 event에 빈 배열을 둬서 UI에서 일관되게 다룬다. */
export function emptyHooksState(): Record<HookEvent, HookEntry[]> {
  const out = {} as Record<HookEvent, HookEntry[]>;
  for (const event of HOOK_EVENTS) {
    out[event] = [];
  }
  return out;
}
