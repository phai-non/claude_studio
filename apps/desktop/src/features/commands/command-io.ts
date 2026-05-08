import {
  deleteFile,
  listCommands,
  readTextFile,
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

export async function readCommand(
  project: string,
  name: string,
): Promise<CommandDoc> {
  const file = cmdPath(project, name);
  const raw = await readTextFile(file);
  const { data, content } = parseDoc<Partial<CommandFrontmatter>>(raw);
  return {
    name,
    frontmatter: CommandFrontmatterSchema.parse({
      description: data.description ?? "",
      "argument-hint": data["argument-hint"],
      "allowed-tools": data["allowed-tools"],
      model: data.model,
    }),
    body: content,
    filePath: file,
  };
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
  const file = cmdPath(project, doc.name);
  const serialized = stringifyDoc(fm, doc.body);
  await writeTextFile(file, serialized);
  return file;
}

export async function deleteCommand(
  project: string,
  name: string,
): Promise<void> {
  await deleteFile(cmdPath(project, name));
}
