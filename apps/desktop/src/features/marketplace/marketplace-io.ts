import { fetchText, isTauri } from "@/lib/tauri";
import { ManifestSchema, type ResolvedTemplate, type Manifest } from "./types";
import { getBuiltinTemplates } from "./builtin";

export async function loadAllTemplates(
  externalIndexUrl: string,
): Promise<{ templates: ResolvedTemplate[]; externalError?: string }> {
  const builtin = getBuiltinTemplates();

  if (!isTauri()) {
    return { templates: builtin, externalError: "Tauri 외부 환경 — 외부 인덱스 비활성화" };
  }

  try {
    const json = await fetchText(externalIndexUrl);
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
