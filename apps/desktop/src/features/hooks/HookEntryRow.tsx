import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { HookEntry } from "@/lib/schemas/hooks";

interface Props {
  entry: HookEntry;
  onChange: (next: HookEntry) => void;
  onRemove: () => void;
}

export function HookEntryRow({ entry, onChange, onRemove }: Props) {
  const { t } = useTranslation();

  const updateMatcher = (matcher: string) => onChange({ ...entry, matcher });
  const updateCommand = (idx: number, command: string) => {
    const next = entry.hooks.map((h, i) =>
      i === idx ? { ...h, command } : h,
    );
    onChange({ ...entry, hooks: next });
  };
  const addCommand = () =>
    onChange({
      ...entry,
      hooks: [...entry.hooks, { type: "command", command: "" }],
    });
  const removeCommand = (idx: number) => {
    if (entry.hooks.length <= 1) return; // 최소 1개 유지
    onChange({
      ...entry,
      hooks: entry.hooks.filter((_, i) => i !== idx),
    });
  };

  return (
    <div className="rounded-md border bg-background/50 p-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-2">
          <div>
            <Label className="text-[11px] text-muted-foreground">
              {t("hooks.matcher")}
            </Label>
            <Input
              value={entry.matcher}
              onChange={(e) => updateMatcher(e.currentTarget.value)}
              placeholder={t("hooks.matcherPlaceholder")}
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">
              {t("hooks.commands")}
            </Label>
            <div className="space-y-1">
              {entry.hooks.map((h, idx) => (
                <div key={idx} className="flex gap-1">
                  <Textarea
                    value={h.command}
                    onChange={(e) => updateCommand(idx, e.currentTarget.value)}
                    placeholder={t("hooks.commandPlaceholder")}
                    className="min-h-[60px] flex-1 resize-y font-mono text-xs"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7 shrink-0"
                    onClick={() => removeCommand(idx)}
                    disabled={entry.hooks.length <= 1}
                    title={t("hooks.removeCommand")}
                    aria-label={t("hooks.removeCommand")}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-[11px]"
                onClick={addCommand}
              >
                <Plus className="size-3" />
                {t("hooks.addCommand")}
              </Button>
            </div>
          </div>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7 shrink-0 text-destructive"
          onClick={onRemove}
          title={t("hooks.removeEntry")}
          aria-label={t("hooks.removeEntry")}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
    </div>
  );
}
