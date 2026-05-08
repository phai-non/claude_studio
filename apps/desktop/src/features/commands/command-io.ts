import {
  deleteFile,
  listCommands,
  readTextFile,
  renameFile,
  writeTextFile,
} from "@/lib/tauri";
import { parseDoc, stringifyDoc } from "@/lib/frontmatter";
import {
  CommandFrontmatterSchema,
  type CommandDoc,
  type CommandFrontmatter,
} from "@/lib/schemas/command";

const cmdPath = (project: string, name: string) =>
  `${project}/.claude/commands/${name}.md`;

export function buildCommandDoc(
  name: string,
  raw: string,
  filePath?: string,
): CommandDoc {
  const { data, content } = parseDoc<Partial<CommandFrontmatter>>(raw);
  const incoming = {
    description: data.description ?? "",
    "argument-hint": data["argument-hint"],
    "allowed-tools": data["allowed-tools"],
    model: data.model,
  };

  const parsed = CommandFrontmatterSchema.safeParse(incoming);
  if (parsed.success) {
    return { name, frontmatter: parsed.data, body: content, filePath };
  }

  const issues = parsed.error.issues.map((i) => ({
    path: i.path.map(String),
    message: i.message,
  }));

  // best-effort: 검증 실패 항목은 사용자가 폼에서 고치도록 그대로 노출
  const fallback: CommandFrontmatter = {
    description:
      typeof data.description === "string" ? data.description : "",
    "argument-hint":
      typeof data["argument-hint"] === "string"
        ? data["argument-hint"]
        : undefined,
    "allowed-tools": Array.isArray(data["allowed-tools"])
      ? data["allowed-tools"].filter(
          (t): t is string => typeof t === "string",
        )
      : undefined,
    model: typeof data.model === "string" ? data.model : undefined,
  };

  return {
    name,
    frontmatter: fallback,
    body: content,
    filePath,
    validationIssues: issues,
  };
}

export async function readCommand(
  project: string,
  name: string,
): Promise<CommandDoc> {
  const file = cmdPath(project, name);
  const raw = await readTextFile(file);
  return buildCommandDoc(name, raw, file);
}

export async function loadAllCommands(project: string): Promise<CommandDoc[]> {
  const names = await listCommands(project);
  const docs: CommandDoc[] = [];
  for (const name of names) {
    try {
      docs.push(await readCommand(project, name));
    } catch (e) {
      console.warn(`Failed to read command ${name}:`, e);
    }
  }
  return docs;
}

export async function saveCommand(
  project: string,
  doc: CommandDoc,
): Promise<string> {
  const fm = CommandFrontmatterSchema.parse(doc.frontmatter);
  const newFile = cmdPath(project, doc.name);
  const serialized = stringifyDoc(fm, doc.body);

  // Rename: 옛 경로 → 새 경로 atomic rename 후 새 내용 overwrite
  if (doc.filePath && doc.filePath !== newFile) {
    await renameFile(doc.filePath, newFile);
  }
  await writeTextFile(newFile, serialized);

  return newFile;
}

export async function deleteCommand(
  project: string,
  name: string,
): Promise<void> {
  await deleteFile(cmdPath(project, name));
}
