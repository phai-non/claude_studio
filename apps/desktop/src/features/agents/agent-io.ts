import {
  deleteFile,
  listAgents,
  readTextFile,
  writeTextFile,
} from "@/lib/tauri";
import { parseDoc, stringifyDoc } from "@/lib/frontmatter";
import {
  AgentFrontmatterSchema,
  type AgentDoc,
  type AgentFrontmatter,
} from "@/lib/schemas/agent";

const agentPath = (project: string, name: string) =>
  `${project}/.claude/agents/${name}.md`;

export async function readAgent(
  project: string,
  name: string,
): Promise<AgentDoc> {
  const file = agentPath(project, name);
  const raw = await readTextFile(file);
  const { data, content } = parseDoc<Partial<AgentFrontmatter>>(raw);
  const merged: Partial<AgentFrontmatter> = { name, ...data };
  return {
    frontmatter: AgentFrontmatterSchema.parse(merged),
    body: content,
    filePath: file,
  };
}

export async function loadAllAgents(project: string): Promise<AgentDoc[]> {
  const names = await listAgents(project);
  const docs: AgentDoc[] = [];
  for (const name of names) {
    try {
      docs.push(await readAgent(project, name));
    } catch (e) {
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
