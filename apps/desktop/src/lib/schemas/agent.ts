import { z } from "zod";

export const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const KNOWN_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Bash",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "TodoWrite",
  "Task",
  "NotebookEdit",
  "BashOutput",
  "KillShell",
] as const;

export const KNOWN_MODELS = ["opus", "sonnet", "haiku", "inherit"] as const;

export const AgentFrontmatterSchema = z.object({
  name: z
    .string()
    .min(1, "agent.validation.nameRequired")
    .regex(KEBAB_RE, "agent.validation.nameKebab"),
  description: z.string().min(1, "agent.validation.descriptionMin"),
  tools: z.array(z.string()).optional(),
  model: z.enum(KNOWN_MODELS).optional(),
  color: z.string().optional(),
});

export type AgentFrontmatter = z.infer<typeof AgentFrontmatterSchema>;

export interface ValidationIssue {
  path: string[];
  message: string;
}

export interface AgentDoc {
  frontmatter: AgentFrontmatter;
  body: string;
  /** 파일 절대 경로 (저장된 경우만 존재) */
  filePath?: string;
  /**
   * 디스크에서 읽을 때 strict 스키마 검증을 통과하지 못한 경우의 이슈 목록.
   * 새로 생성한 draft에는 undefined.
   */
  validationIssues?: ValidationIssue[];
}

/** 사용자 입력에서 kebab-case 후보 자동 생성 */
export function suggestKebabName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
