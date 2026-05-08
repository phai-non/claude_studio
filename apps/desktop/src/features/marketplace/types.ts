import { z } from "zod";

export const TemplateEntrySchema = z.object({
  id: z.string(),
  type: z.enum(["agent", "command", "claude-md"]),
  name: z.string(),
  description: z.string(),
  author: z.string(),
  tags: z.array(z.string()).default([]),
  source: z.string(),
  icon: z.string().optional(),
});

export const ManifestSchema = z.object({
  version: z.literal("1"),
  templates: z.array(TemplateEntrySchema),
});

export type TemplateEntry = z.infer<typeof TemplateEntrySchema>;
export type Manifest = z.infer<typeof ManifestSchema>;

export interface ResolvedTemplate extends TemplateEntry {
  content: string;
}
