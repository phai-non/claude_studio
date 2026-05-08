import { useEffect, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Save, Trash2, Wand2 } from "lucide-react";
import {
  KEBAB_RE,
  KNOWN_MODELS,
  suggestKebabName,
  type AgentDoc,
  type AgentFrontmatter,
} from "@/lib/schemas/agent";
import { readToolHints, type ToolHint } from "@/lib/tauri";
import { cn } from "@/lib/utils";

const FormSchema = z.object({
  name: z
    .string()
    .min(1, "agent.validation.nameRequired")
    .regex(KEBAB_RE, "agent.validation.nameKebab"),
  description: z.string().min(10, "agent.validation.descriptionMin"),
  toolsCsv: z.string().optional().default(""),
  model: z.enum(KNOWN_MODELS).optional(),
  color: z.string().optional(),
  body: z.string(),
});
type AgentFormValues = z.input<typeof FormSchema>;

interface AgentFormProps {
  initial?: AgentDoc;
  projectPath?: string;
  onSave: (doc: AgentDoc) => Promise<void> | void;
  onCancel?: () => void;
  onDelete?: () => Promise<void> | void;
  isSaving?: boolean;
}

export function AgentForm({
  initial,
  projectPath,
  onSave,
  onCancel,
  onDelete,
  isSaving,
}: AgentFormProps) {
  const { t } = useTranslation();

  const toolHintsQuery = useQuery({
    queryKey: ["tool-hints", projectPath],
    queryFn: () => readToolHints(projectPath),
  });

  const groupedHints = useMemo(() => {
    const all = toolHintsQuery.data?.hints ?? [];
    const groups: Record<ToolHint["source"], ToolHint[]> = {
      builtin: [],
      settings: [],
      mcp: [],
    };
    for (const h of all) groups[h.source].push(h);
    return groups;
  }, [toolHintsQuery.data]);

  const defaults: AgentFormValues = useMemo(
    () => ({
      name: initial?.frontmatter.name ?? "",
      description: initial?.frontmatter.description ?? "",
      toolsCsv: (initial?.frontmatter.tools ?? []).join(", "),
      model: initial?.frontmatter.model ?? "inherit",
      color: initial?.frontmatter.color,
      body: initial?.body ?? "",
    }),
    [initial],
  );

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<AgentFormValues>({
    defaultValues: defaults,
    mode: "onChange",
    resolver: zodResolver(FormSchema),
  });

  useEffect(() => reset(defaults), [defaults, reset]);

  // 이름 자동 수정 제안
  const nameValue = watch("name");
  const suggestedName = useMemo(() => {
    if (!nameValue) return null;
    if (KEBAB_RE.test(nameValue)) return null;
    const s = suggestKebabName(nameValue);
    return s && s !== nameValue ? s : null;
  }, [nameValue]);

  const appendTool = (tool: string) => {
    const current = watch("toolsCsv") ?? "";
    const arr = current
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (arr.includes(tool)) return;
    setValue("toolsCsv", [...arr, tool].join(", "), { shouldDirty: true });
  };

  const submit = handleSubmit(async (values) => {
    const tools = (values.toolsCsv ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const fm: AgentFrontmatter = {
      name: values.name,
      description: values.description,
      tools: tools.length ? tools : undefined,
      model: values.model,
      color: values.color || undefined,
    };
    await onSave({
      frontmatter: fm,
      body: values.body,
      filePath: initial?.filePath,
    });
  });

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div>
          <Label htmlFor="agent-name">{t("agent.name")}</Label>
          <Input
            id="agent-name"
            placeholder={t("agent.namePlaceholder")}
            {...register("name")}
            className={cn(errors.name && "border-destructive")}
          />
          {errors.name?.message && (
            <p className="mt-1 text-xs text-destructive">
              {t(errors.name.message)}
            </p>
          )}
          {suggestedName && (
            <button
              type="button"
              onClick={() =>
                setValue("name", suggestedName, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Wand2 className="size-3" />
              {t("agent.validation.suggest", { value: suggestedName })}
            </button>
          )}
        </div>

        <div>
          <Label htmlFor="agent-desc">{t("agent.description")}</Label>
          <Textarea
            id="agent-desc"
            rows={2}
            placeholder={t("agent.descriptionPlaceholder")}
            {...register("description")}
            className={cn(errors.description && "border-destructive")}
          />
          {errors.description?.message && (
            <p className="mt-1 text-xs text-destructive">
              {t(errors.description.message)}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="agent-body">{t("agent.body")}</Label>
          <Textarea
            id="agent-body"
            rows={14}
            className="font-mono text-xs"
            placeholder="You are a helpful agent that…"
            {...register("body")}
          />
        </div>
      </div>

      <div className="space-y-4 rounded-lg border bg-card p-4">
        <div>
          <Label>{t("agent.model")}</Label>
          <Controller
            control={control}
            name="model"
            render={({ field }) => (
              <div className="mt-1 flex flex-wrap gap-1">
                {KNOWN_MODELS.map((m) => (
                  <Button
                    key={m}
                    type="button"
                    size="sm"
                    variant={field.value === m ? "default" : "outline"}
                    onClick={() => field.onChange(m)}
                  >
                    {m}
                  </Button>
                ))}
              </div>
            )}
          />
        </div>

        <div>
          <Label htmlFor="agent-tools">{t("agent.tools")}</Label>
          <Input
            id="agent-tools"
            placeholder="Read, Edit, Bash"
            {...register("toolsCsv")}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {t("agent.toolsHint")}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground/80">
            ⚠ 아래 배지는 흔히 쓰이는 후보일 뿐 — 실제 사용 가능한 툴 전체 목록이 아닙니다. CSV에 직접 입력해도 됩니다.
          </p>

          <ToolHintGroup
            label="Built-in"
            hints={groupedHints.builtin}
            onPick={appendTool}
          />
          <ToolHintGroup
            label={`Settings (${groupedHints.settings.length})`}
            hints={groupedHints.settings}
            onPick={appendTool}
            note="permissions.allow 에서 추출"
          />
          <ToolHintGroup
            label={`MCP (${groupedHints.mcp.length})`}
            hints={groupedHints.mcp}
            onPick={appendTool}
            note="mcp.json 의 mcpServers 키"
          />
        </div>

        <div className="flex flex-col gap-2 pt-4">
          <Button type="submit" disabled={isSaving || !isDirty}>
            <Save className="size-4" />
            {isSaving ? t("common.saving") : t("agent.save")}
          </Button>
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t("agent.cancel")}
            </Button>
          )}
          {onDelete && initial && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => void onDelete()}
            >
              <Trash2 className="size-4" />
              {t("agent.delete")}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

interface ToolHintGroupProps {
  label: string;
  hints: ToolHint[];
  onPick: (name: string) => void;
  note?: string;
}

function ToolHintGroup({ label, hints, onPick, note }: ToolHintGroupProps) {
  if (hints.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {note && (
          <span className="text-[10px] text-muted-foreground/70">{note}</span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {hints.map((h) => (
          <Badge
            key={`${h.source}:${h.name}`}
            variant="outline"
            className="cursor-pointer"
            title={h.origin}
            onClick={() => onPick(h.name)}
          >
            + {h.name}
          </Badge>
        ))}
      </div>
    </div>
  );
}
