import builtinManifest from "../../../../../packages/templates/manifest.json";
import { ManifestSchema, type ResolvedTemplate } from "./types";

const rawFiles = import.meta.glob(
  "../../../../../packages/templates/**/*.md",
  { eager: true, query: "?raw", import: "default" },
) as Record<string, string>;

function resolveBuiltinSource(source: string): string {
  if (!source.startsWith("builtin:")) {
    throw new Error(`Not a builtin source: ${source}`);
  }
  const rel = source.slice("builtin:".length);
  const fullKey = Object.keys(rawFiles).find((k) =>
    k.endsWith(`/packages/templates/${rel}`),
  );
  if (!fullKey) {
    throw new Error(`Built-in template not found: ${rel}`);
  }
  return rawFiles[fullKey];
}

export function getBuiltinTemplates(): ResolvedTemplate[] {
  const parsed = ManifestSchema.parse(builtinManifest);
  return parsed.templates.map((t) => ({
    ...t,
    content: resolveBuiltinSource(t.source),
  }));
}
