import {
  deleteFile,
  listAgents,
  readTextFile,
  writeTextFile,
} from "@/lib/tauri";
import { parseDoc, stringifyDoc } from "@/lib/frontmatter";
import {
  AgentFrontmatterSchema,
  KNOWN_MODELS,
  type AgentDoc,
  type AgentFrontmatter,
  type ValidationIssue,
} from "@/lib/schemas/agent";

const agentPath = (project: string, name: string) =>
  `${project}/.claude/agents/${name}.md`;

/**
 * 파일 내용을 AgentDoc로 빌드한다.
 * - strict 스키마 통과 → 정상 doc 반환
 * - strict 실패 → best-effort frontmatter + validationIssues 동반 (사용자가 폼에서
 *   고칠 수 있도록 silent drop 하지 않는다)
 *
 * **파일명이 canonical name** — frontmatter에 name 필드가 있어도 파일명이 우선한다.
 * 그렇지 않으면 두 다른 파일이 같은 frontmatter.name 을 갖는 경우 사이드바에서
 * 같은 항목으로 보이는 React key 충돌이 발생한다 (둘 다 선택된 것처럼 보임).
 *
 * 저장 시점에는 form의 zodResolver가 그대로 strict 검증을 수행한다.
 */
export function buildAgentDoc(
  name: string,
  raw: string,
  filePath?: string,
): AgentDoc {
  const { data, content } = parseDoc<Partial<AgentFrontmatter>>(raw);
  // 순서 주의: data를 먼저 펼치고 name을 마지막에 — 파일명이 frontmatter.name을 덮어쓴다.
  const merged: Record<string, unknown> = { ...data, name };

  const parsed = AgentFrontmatterSchema.safeParse(merged);
  if (parsed.success) {
    return { frontmatter: parsed.data, body: content, filePath };
  }

  const issues: ValidationIssue[] = parsed.error.issues.map((i) => ({
    path: i.path.map(String),
    message: i.message,
  }));

  const knownModels = KNOWN_MODELS as readonly string[];
  const fallback: AgentFrontmatter = {
    name, // 파일명이 canonical
    description: typeof data.description === "string" ? data.description : "",
    tools: Array.isArray(data.tools)
      ? data.tools.filter((t): t is string => typeof t === "string")
      : undefined,
    model:
      typeof data.model === "string" && knownModels.includes(data.model)
        ? (data.model as AgentFrontmatter["model"])
        : undefined,
    color: typeof data.color === "string" ? data.color : undefined,
  };

  return {
    frontmatter: fallback,
    body: content,
    filePath,
    validationIssues: issues,
  };
}

export async function readAgent(
  project: string,
  name: string,
): Promise<AgentDoc> {
  const file = agentPath(project, name);
  const raw = await readTextFile(file);
  return buildAgentDoc(name, raw, file);
}

export async function loadAllAgents(project: string): Promise<AgentDoc[]> {
  const names = await listAgents(project);
  const docs: AgentDoc[] = [];
  for (const name of names) {
    try {
      docs.push(await readAgent(project, name));
    } catch (e) {
      // 여기서의 에러는 IO 또는 frontmatter parse 실패 — 검증 실패가 아님.
      // 검증 실패는 readAgent 내부에서 validationIssues로 동반 반환됨.
      console.warn(`Failed to read agent ${name}:`, e);
    }
  }
  return docs;
}

export async function saveAgent(
  project: string,
  doc: AgentDoc,
): Promise<string> {
  const fm = AgentFrontmatterSchema.parse(doc.frontmatter);
  const newFile = agentPath(project, fm.name);
  const serialized = stringifyDoc(fm, doc.body);
  await writeTextFile(newFile, serialized);

  // Rename: 기존 파일 경로가 새 경로와 다르면 옛 파일 삭제 (orphan 방지)
  if (doc.filePath && doc.filePath !== newFile) {
    try {
      await deleteFile(doc.filePath);
    } catch (e) {
      console.warn(
        `Renamed agent saved as ${newFile}, but failed to delete old file ${doc.filePath}:`,
        e,
      );
    }
  }

  return newFile;
}

export async function deleteAgent(
  project: string,
  name: string,
): Promise<void> {
  await deleteFile(agentPath(project, name));
}
