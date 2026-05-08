import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CommandDoc } from "@/lib/schemas/command";
import {
  deleteCommand,
  loadAllCommands,
  saveCommand,
} from "./command-io";
import { CommandForm } from "./CommandForm";

const blank: CommandDoc = {
  name: "",
  frontmatter: { description: "" },
  body: "",
};

interface Props {
  projectPath: string;
  refreshSummary: () => void;
}

export function CommandEditor({ projectPath, refreshSummary }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<CommandDoc | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const list = useQuery({
    queryKey: ["commands", projectPath],
    queryFn: () => loadAllCommands(projectPath),
  });

  useEffect(() => {
    if (!selected && draft === null && list.data && list.data.length > 0) {
      setSelected(list.data[0]?.name ?? null);
    }
  }, [list.data, selected, draft]);

  const current: CommandDoc | undefined =
    draft ?? list.data?.find((c) => c.name === selected);

  const handleSave = async (doc: CommandDoc) => {
    setSaving(true);
    try {
      await saveCommand(projectPath, doc);
      await qc.invalidateQueries({ queryKey: ["commands", projectPath] });
      refreshSummary();
      setDraft(null);
      setSelected(doc.name);
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (name: string) => {
    await deleteCommand(projectPath, name);
    await qc.invalidateQueries({ queryKey: ["commands", projectPath] });
    refreshSummary();
    setSelected(null);
    setDraft(null);
  };

  return (
    <div className="grid h-full grid-cols-[260px_1fr] gap-0">
      <div className="flex h-full flex-col border-r">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <ScrollText className="size-4" />
            {t("workspace.tabs.commands")}
          </h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSelected(null);
              setDraft(blank);
            }}
          >
            <Plus className="size-3" />
            {t("workspace.create")}
          </Button>
        </div>
        <ul className="flex-1 space-y-0.5 overflow-auto p-2 text-sm">
          {list.data?.length === 0 && (
            <li className="px-2 py-3 text-xs text-muted-foreground">
              {t("workspace.noItems")}
            </li>
          )}
          {list.data?.map((c) => (
            <li key={c.name}>
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setSelected(c.name);
                }}
                className={cn(
                  "w-full rounded-md px-2 py-2 text-left transition-colors",
                  selected === c.name && !draft
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50",
                )}
              >
                <div className="font-medium">/{c.name}</div>
                <div className="line-clamp-1 text-xs text-muted-foreground">
                  {c.frontmatter.description}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="overflow-auto p-6">
        {!current ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              왼쪽 리스트에서 command를 선택하거나 새로 만드세요.
            </CardContent>
          </Card>
        ) : (
          <>
            {savedAt && (
              <div className="mb-3 inline-flex rounded-md bg-emerald-500/10 px-3 py-1 text-xs text-emerald-700 dark:text-emerald-400">
                {t("common.saved")} ✓
              </div>
            )}
            <CommandForm
              key={current.filePath ?? "new"}
              initial={current}
              isSaving={saving}
              onSave={handleSave}
              onCancel={
                draft
                  ? () => {
                      setDraft(null);
                      setSelected(list.data?.[0]?.name ?? null);
                    }
                  : undefined
              }
              onDelete={
                current.filePath ? () => handleDelete(current.name) : undefined
              }
            />
          </>
        )}
      </div>
    </div>
  );
}
