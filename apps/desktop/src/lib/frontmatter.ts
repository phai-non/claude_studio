/**
 * 가벼운 YAML frontmatter 파서/직렬화기.
 *
 * 우리가 직접 stringify 하는 형식(`---\n<key: value | inline array | block list>\n---\n\n<body>`)
 * 만 안정적으로 다루는 게 목적이며, 외부에서 손으로 작성한 파일도 best-effort로 파싱한다.
 *
 * 절대 throw 하지 않는다 — 잘못된 입력이면 빈 data 와 raw body를 반환한다.
 * 이렇게 해서 readAgent / readCommand 가 silent drop 되지 않게 한다.
 *
 * 지원 형식:
 *   key: scalar
 *   key: "quoted string"
 *   key: [a, b, c]
 *   key:
 *     - item1
 *     - item2
 * 미지원: 깊은 nested object, multi-line scalar, anchor, !tag — 우리 스키마에 필요 없음.
 */

export interface ParsedDoc<T extends Record<string, unknown>> {
  data: T;
  content: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const KEY_VALUE_RE = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/;
const LIST_ITEM_RE = /^\s+-\s+(.*)$/;

export function parseDoc<T extends Record<string, unknown>>(
  raw: string,
): ParsedDoc<T> {
  const m = raw.match(FRONTMATTER_RE);
  if (!m) {
    return { data: {} as T, content: raw.trimStart() };
  }
  const yamlBlock = m[1] ?? "";
  const body = m[2] ?? "";
  let data: Record<string, unknown> = {};
  try {
    data = parseSimpleYaml(yamlBlock);
  } catch {
    // 어떤 비정상 입력이라도 빈 객체로 폴백. throw 금지.
    data = {};
  }
  return { data: data as T, content: body.replace(/^\r?\n/, "") };
}

function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const lines = yaml.split(/\r?\n/);

  let pendingKey: string | null = null;
  let pendingList: unknown[] | null = null;

  const flush = () => {
    if (pendingKey !== null && pendingList !== null) {
      out[pendingKey] = pendingList;
    }
    pendingKey = null;
    pendingList = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim()) continue;
    if (line.trimStart().startsWith("#")) continue;

    const listMatch = line.match(LIST_ITEM_RE);
    if (listMatch && pendingKey !== null && pendingList !== null) {
      pendingList.push(parseScalar(listMatch[1] ?? ""));
      continue;
    }

    flush();

    const kv = line.match(KEY_VALUE_RE);
    if (!kv) continue;
    const key = kv[1] ?? "";
    const valuePart = kv[2] ?? "";

    if (valuePart === "") {
      pendingKey = key;
      pendingList = [];
      continue;
    }

    if (valuePart.startsWith("[") && valuePart.endsWith("]")) {
      out[key] = parseInlineArray(valuePart);
      continue;
    }

    out[key] = parseScalar(valuePart);
  }

  flush();
  return out;
}

function parseInlineArray(raw: string): unknown[] {
  const inner = raw.slice(1, -1).trim();
  if (!inner) return [];
  // 따옴표 안의 콤마는 우리 출력엔 등장하지 않으므로 단순 split으로 충분.
  return inner.split(",").map((s) => parseScalar(s.trim()));
}

function parseScalar(raw: string): unknown {
  const t = raw.trim();
  if (t === "" || t === "null" || t === "~") return null;
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?\d+$/.test(t)) return Number(t);
  if (/^-?\d+\.\d+$/.test(t)) return Number(t);
  if (t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (t.startsWith("'") && t.endsWith("'")) {
    return t.slice(1, -1);
  }
  return t;
}

export function stringifyDoc(
  data: Record<string, unknown>,
  body: string,
): string {
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
      lines.push(
        `${pad}${key}: ${quoteScalar(value as string | number | boolean)}`,
      );
    }
  }
  return lines.join("\n") + "\n";
}

function quoteScalar(value: string | number | boolean): string {
  if (typeof value !== "string") return String(value);
  // 영문/숫자/.-_/ 만으로 이뤄진 안전한 토큰은 그대로
  if (/^[\w./-]+$/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
