import { useEffect, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
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
  KNOWN_TOOLS,
  suggestKebabName,
  type AgentDoc,
  type AgentFrontmatter,
} from "@/lib/schemas/agent";
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
  onSave: (doc: AgentDoc) => Promise<void> | void;
  onCancel?: () => void;
  onDelete?: () => Promise<void> | void;
  isSaving?: boolean;
}

export function AgentForm({
  initial,
  onSave,
  onCancel,
  onDelete,
  isSaving,
}: AgentFormProps) {
  const { t } = useTranslation();

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
          <div className="mt-2 flex flex-wrap gap-1">
            {KNOWN_TOOLS.map((tool) => (
              <Badge
                key={tool}
                variant="outline"
                className="cursor-pointer"
                onClick={() => {
                  const current = watch("toolsCsv") ?? "";
                  const arr = current
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                  if (arr.includes(tool)) return;
                  setValue("toolsCsv", [...arr, tool].join(", "), {
                    shouldDirty: true,
                  });
                }}
              >
                + {tool}
              </Badge>
            ))}
          </div>
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
