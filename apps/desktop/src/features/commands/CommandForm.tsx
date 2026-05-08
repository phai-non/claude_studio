import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { AlertTriangle, Save, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { KEBAB_RE, KNOWN_MODELS, suggestKebabName } from "@/lib/schemas/agent";
import type { CommandDoc } from "@/lib/schemas/command";
import { cn } from "@/lib/utils";

const FormSchema = z.object({
  name: z
    .string()
    .min(1, "agent.validation.nameRequired")
    .regex(KEBAB_RE, "agent.validation.nameKebab"),
  description: z.string().min(1, "agent.validation.descriptionMin"),
  argumentHint: z.string().optional(),
  allowedToolsCsv: z.string().optional().default(""),
  // Claude Code 슬래시 커맨드 frontmatter는 model을 임의 문자열로 받는다.
  // 폼에선 KNOWN_MODELS 버튼 + 빈 문자열로 노출하지만 여기엔 제약을 두지 않는다.
  model: z.string().optional(),
  body: z.string(),
});
type FormValues = z.input<typeof FormSchema>;

interface Props {
  initial?: CommandDoc;
  onSave: (doc: CommandDoc) => Promise<void> | void;
  onCancel?: () => void;
  onDelete?: () => Promise<void> | void;
  isSaving?: boolean;
}

export function CommandForm({
  initial,
  onSave,
  onCancel,
  onDelete,
  isSaving,
}: Props) {
  const { t } = useTranslation();

  const defaults: FormValues = useMemo(
    () => ({
      name: initial?.name ?? "",
      description: initial?.frontmatter.description ?? "",
      argumentHint: initial?.frontmatter["argument-hint"] ?? "",
      allowedToolsCsv: (initial?.frontmatter["allowed-tools"] ?? []).join(", "),
      model: initial?.frontmatter.model ?? "",
      body: initial?.body ?? "",
    }),
    [initial],
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    defaultValues: defaults,
    mode: "onChange",
    resolver: zodResolver(FormSchema),
  });

  useEffect(() => reset(defaults), [defaults, reset]);

  const nameValue = watch("name");
  const suggestedName = useMemo(() => {
    if (!nameValue) return null;
    if (KEBAB_RE.test(nameValue)) return null;
    const s = suggestKebabName(nameValue);
    return s && s !== nameValue ? s : null;
  }, [nameValue]);

  const submit = handleSubmit(async (values) => {
    const tools = (values.allowedToolsCsv ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    await onSave({
      name: values.name,
      frontmatter: {
        description: values.description,
        "argument-hint": values.argumentHint || undefined,
        "allowed-tools": tools.length ? tools : undefined,
        model: values.model || undefined,
      },
      body: values.body,
      filePath: initial?.filePath,
    });
  });

  const modelValue = watch("model") ?? "";

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {initial?.validationIssues && initial.validationIssues.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs lg:col-span-2">
          <div className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300">
            <AlertTriangle className="size-3.5" />
            이 파일에 검증 이슈가 있습니다 — 수정 후 저장하면 정상화됩니다.
          </div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-700/80 dark:text-amber-200/80">
            {initial.validationIssues.map((iss, i) => (
              <li key={i}>
                <span className="font-mono">
                  {iss.path.join(".") || "(root)"}
                </span>
                : {iss.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="space-y-4">
        <div>
          <Label htmlFor="cmd-name">{t("command.name")}</Label>
          <div className="flex items-center">
            <span className="rounded-l-md border border-r-0 bg-muted px-2 py-2 text-sm text-muted-foreground">
              /
            </span>
            <Input
              id="cmd-name"
              placeholder={t("command.namePlaceholder")}
              className={cn(
                "rounded-l-none",
                errors.name && "border-destructive",
              )}
              {...register("name")}
            />
          </div>
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
          <Label htmlFor="cmd-desc">{t("command.description")}</Label>
          <Input
            id="cmd-desc"
            {...register("description")}
            className={cn(errors.description && "border-destructive")}
          />
        </div>

        <div>
          <Label htmlFor="cmd-body">{t("command.body")}</Label>
          <Textarea
            id="cmd-body"
            rows={14}
            className="font-mono text-xs"
            placeholder="$ARGUMENTS 토큰을 사용해 인자를 받을 수 있습니다."
            {...register("body")}
          />
        </div>
      </div>

      <div className="space-y-4 rounded-lg border bg-card p-4">
        <div>
          <Label htmlFor="cmd-arg-hint">{t("command.argumentHint")}</Label>
          <Input
            id="cmd-arg-hint"
            placeholder="<message>"
            {...register("argumentHint")}
          />
        </div>
        <div>
          <Label htmlFor="cmd-allowed">{t("command.allowedTools")}</Label>
          <Input
            id="cmd-allowed"
            placeholder="Bash(git status), Read"
            {...register("allowedToolsCsv")}
          />
        </div>
        <div>
          <Label>{t("agent.model")}</Label>
          <div className="mt-1 flex flex-wrap gap-1">
            <Button
              type="button"
              size="sm"
              variant={modelValue === "" ? "default" : "outline"}
              onClick={() =>
                setValue("model", "", {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              title="기본값 사용 (frontmatter에 model 줄 없음)"
            >
              (기본)
            </Button>
            {KNOWN_MODELS.map((m) => (
              <Button
                key={m}
                type="button"
                size="sm"
                variant={modelValue === m ? "default" : "outline"}
                onClick={() =>
                  setValue("model", m, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              >
                {m}
              </Button>
            ))}
          </div>
          {modelValue && !KNOWN_MODELS.includes(modelValue as never) && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              custom: <span className="font-mono">{modelValue}</span>
            </p>
          )}
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
