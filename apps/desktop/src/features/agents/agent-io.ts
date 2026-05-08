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
 * 저장 시점에는 form의 zodResolver가 그대로 strict 검증을 수행한다.
 */
export function buildAgentDoc(
  name: string,
  raw: string,
  filePath?: string,
): AgentDoc {
  const { data, content } = parseDoc<Partial<AgentFrontmatter>>(raw);
  const merged: Record<string, unknown> = { name, ...data };

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
    name,
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
  const file = agentPath(project, fm.name);
  const serialized = stringifyDoc(fm, doc.body);
  await writeTextFile(file, serialized);
  return file;
}

export async function deleteAgent(
  project: string,
  name: string,
): Promise<void> {
  await deleteFile(agentPath(project, name));
}
