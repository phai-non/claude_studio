import matter from "gray-matter";

export interface ParsedDoc<T extends Record<string, unknown>> {
  data: T;
  content: string;
}

export function parseDoc<T extends Record<string, unknown>>(
  raw: string,
): ParsedDoc<T> {
  const file = matter(raw);
  return { data: (file.data ?? {}) as T, content: file.content.trimStart() };
}

export function stringifyDoc(
  data: Record<string, unknown>,
  body: string,
): string {
  // gray-matter는 Buffer/Node 의존이 있어 브라우저용으로 직접 직렬화
  const yaml = toYaml(data);
  return `---\n${yaml}---\n\n${body.trimStart()}\n`;
}

function toYaml(obj: Record<string, unknown>, depth = 0): string {
  const pad = "  ".repeat(depth);
  const lines: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      const allScalar = value.every(
        (v) => typeof v !== "object" || v === null,
      );
      if (allScalar) {
        const arr = value
          .map((v) => quoteScalar(v as string | number | boolean))
          .join(", ");
        lines.push(`${pad}${key}: [${arr}]`);
      } else {
        lines.push(`${pad}${key}:`);
        for (const v of value) {
          lines.push(
            `${pad}- ${quoteScalar(v as string | number | boolean)}`,
          );
        }
      }
    } else if (typeof value === "object") {
      lines.push(`${pad}${key}:`);
      lines.push(toYaml(value as Record<string, unknown>, depth + 1));
    } else {
      lines.push(`${pad}${key}: ${quoteScalar(value as string | number | boolean)}`);
    }
  }
  return lines.join("\n") + "\n";
}

function quoteScalar(value: string | number | boolean): string {
  if (typeof value !== "string") return String(value);
  if (/^[\w./-]+$/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}
