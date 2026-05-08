import { z } from "zod";
import { KEBAB_RE } from "./agent";

export const CommandFrontmatterSchema = z.object({
  description: z.string().min(1),
  "argument-hint": z.string().optional(),
  "allowed-tools": z.array(z.string()).optional(),
  model: z.string().optional(),
});

export type CommandFrontmatter = z.infer<typeof CommandFrontmatterSchema>;

export interface CommandDoc {
  /** /이름 — 파일명에서 추출 */
  name: string;
  frontmatter: CommandFrontmatter;
  body: string;
  filePath?: string;
  /** 디스크에서 strict 스키마 검증을 통과하지 못한 경우의 이슈 목록 */
  validationIssues?: { path: string[]; message: string }[];
}

export function isValidCommandName(name: string): boolean {
  return KEBAB_RE.test(name);
}
