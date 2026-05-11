import {
  emptyHooksState,
  HOOK_EVENTS,
  HookEntrySchema,
  type HookEntry,
  type HookEvent,
} from "@/lib/schemas/hooks";
import {
  readSettingsFile,
  type SettingsScope,
  writeSettingsFile,
} from "@/lib/tauri";

/** UI 폼 단계의 hooks 상태 — 모든 event를 항상 키로 갖는다(빈 배열 포함). */
export type HooksState = Record<HookEvent, HookEntry[]>;

/** 파일 파싱 결과. parseError가 있으면 hooks 영역은 비어 있고 raw만 보존된다. */
export interface ParseResult {
  /** 원본 settings 객체 (hooks 외 키 보존용). 파싱 실패 시 빈 객체. */
  settings: Record<string, unknown>;
  /** UI 폼 초기값. */
  hooks: HooksState;
  /** JSON 또는 schema 파싱 실패 메시지. 정상 시 undefined. */
  parseError?: string;
}

/**
 * settings.json 원본 문자열을 파싱해 폼 초기값을 만든다.
 *
 * - 빈 문자열 → 빈 settings + 빈 hooks (정상).
 * - JSON 자체가 깨짐 → `parseError`에 사람 읽기 좋은 메시지, hooks는 빈 상태.
 * - hooks 필드가 스키마와 안 맞는 항목은 조용히 걸러낸다 — 사용자가 텍스트로 직접 넣은
 *   잘못된 entry 때문에 전체 편집이 막히지 않도록.
 */
export function parseSettingsRaw(raw: string): ParseResult {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { settings: {}, hooks: emptyHooksState() };
  }

  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch (e) {
    return {
      settings: {},
      hooks: emptyHooksState(),
      parseError: `settings.json이 올바른 JSON이 아닙니다: ${String(e)}`,
    };
  }

  if (!isPlainObject(value)) {
    return {
      settings: {},
      hooks: emptyHooksState(),
      parseError: "settings.json의 최상위가 객체가 아닙니다.",
    };
  }

  const settings = value as Record<string, unknown>;
  const hooksRaw = settings.hooks;
  const hooks = extractHooks(hooksRaw);

  return { settings, hooks };
}

function extractHooks(hooksRaw: unknown): HooksState {
  const state = emptyHooksState();
  if (!isPlainObject(hooksRaw)) return state;

  const obj = hooksRaw as Record<string, unknown>;
  for (const event of HOOK_EVENTS) {
    const arr = obj[event];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const parsed = HookEntrySchema.safeParse(item);
      if (parsed.success) {
        state[event].push(parsed.data);
      }
      // 스키마 안 맞는 entry는 조용히 drop — 사용자가 직접 고치게 함
    }
  }
  return state;
}

/**
 * 폼 상태와 기존 settings 객체를 합쳐 새 직렬화 결과를 만든다.
 *
 * - 빈 event는 결과 hooks 객체에서 제거.
 * - hooks 전체가 비어 있으면 settings에서 `hooks` 키 자체를 제거.
 * - hooks 외 다른 키(`permissions`, `model`, `env` 등)는 원본 그대로 보존.
 * - 들여쓰기 2칸 + 끝에 개행.
 */
export function serializeWithHooks(
  existingSettings: Record<string, unknown>,
  hooks: HooksState,
): string {
  const merged: Record<string, unknown> = { ...existingSettings };

  const compactHooks: Record<string, HookEntry[]> = {};
  for (const event of HOOK_EVENTS) {
    const entries = hooks[event];
    if (entries.length > 0) {
      compactHooks[event] = entries;
    }
  }

  if (Object.keys(compactHooks).length === 0) {
    delete merged.hooks;
  } else {
    merged.hooks = compactHooks;
  }

  return `${JSON.stringify(merged, null, 2)}\n`;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ---------- IPC wrap ----------

export async function loadHooks(
  scope: SettingsScope,
  projectPath?: string,
): Promise<ParseResult> {
  const raw = await readSettingsFile(scope, projectPath);
  return parseSettingsRaw(raw);
}

export async function saveHooks(
  scope: SettingsScope,
  existingSettings: Record<string, unknown>,
  hooks: HooksState,
  projectPath?: string,
): Promise<void> {
  const contents = serializeWithHooks(existingSettings, hooks);
  await writeSettingsFile(scope, contents, projectPath);
}
