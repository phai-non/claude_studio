import { fetchText, isTauri } from "@/lib/tauri";
import { ManifestSchema, type ResolvedTemplate, type Manifest } from "./types";
import { getBuiltinTemplates } from "./builtin";

// 과거 release(<= v1.0.1) 가 default 로 박아두었던 placeholder URL.
// 그 리포는 존재하지 않아 항상 404. 기존 사용자 localStorage 마이그레이션을
// 위해 명시적으로 스킵한다.
const LEGACY_PLACEHOLDER_INDEX_URLS = new Set([
  "https://raw.githubusercontent.com/claude-studio/marketplace-index/main/manifest.json",
]);

export async function loadAllTemplates(
  externalIndexUrl: string,
): Promise<{ templates: ResolvedTemplate[]; externalError?: string }> {
  const builtin = getBuiltinTemplates();

  if (!isTauri()) {
    return { templates: builtin, externalError: "Tauri 외부 환경 — 외부 인덱스 비활성화" };
  }

  const url = externalIndexUrl.trim();
  if (!url || LEGACY_PLACEHOLDER_INDEX_URLS.has(url)) {
    // 사용자가 외부 인덱스 URL 을 등록하지 않은 경우. builtin 만 표시.
    return { templates: builtin };
  }

  try {
    const json = await fetchText(url);
    const manifest: Manifest = ManifestSchema.parse(JSON.parse(json));
    const external: ResolvedTemplate[] = manifest.templates.map((t) => ({
      ...t,
      content: "",
    }));
    return { templates: [...builtin, ...external] };
  } catch (e) {
    return { templates: builtin, externalError: String(e) };
  }
}

export async function fetchTemplateContent(
  source: string,
): Promise<string> {
  if (source.startsWith("builtin:")) {
    const builtins = getBuiltinTemplates();
    const found = builtins.find((b) => b.source === source);
    if (!found) throw new Error(`Built-in template not found: ${source}`);
    return found.content;
  }
  return await fetchText(source);
}
