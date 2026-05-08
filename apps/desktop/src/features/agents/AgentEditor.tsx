import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Plus, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AgentDoc } from "@/lib/schemas/agent";
import {
  deleteAgent,
  loadAllAgents,
  saveAgent,
} from "./agent-io";
import { AgentForm } from "./AgentForm";

interface Props {
  projectPath: string;
  refreshSummary: () => void;
}

const blank: AgentDoc = {
  frontmatter: { name: "", description: "" },
  body: "",
};

export function AgentEditor({ projectPath, refreshSummary }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<AgentDoc | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const agents = useQuery({
    queryKey: ["agents", projectPath],
    queryFn: () => loadAllAgents(projectPath),
  });

  useEffect(() => {
    if (!selected && draft === null && agents.data && agents.data.length > 0) {
      setSelected(agents.data[0]?.frontmatter.name ?? null);
    }
  }, [agents.data, selected, draft]);

  const current: AgentDoc | undefined =
    draft ?? agents.data?.find((a) => a.frontmatter.name === selected);

  const handleSave = async (doc: AgentDoc) => {
    setSaving(true);
    try {
      await saveAgent(projectPath, doc);
      await qc.invalidateQueries({ queryKey: ["agents", projectPath] });
      refreshSummary();
      setDraft(null);
      setSelected(doc.frontmatter.name);
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (name: string) => {
    await deleteAgent(projectPath, name);
    await qc.invalidateQueries({ queryKey: ["agents", projectPath] });
    refreshSummary();
    setSelected(null);
    setDraft(null);
  };

  return (
    <div className="grid h-full grid-cols-[260px_1fr] gap-0">
      <div className="flex h-full flex-col border-r">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Bot className="size-4" />
            {t("workspace.tabs.agents")}
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
          {agents.isLoading && (
            <li className="px-2 py-3 text-xs text-muted-foreground">
              로딩 중…
            </li>
          )}
          {agents.data?.length === 0 && (
            <li className="px-2 py-3 text-xs text-muted-foreground">
              {t("workspace.noItems")}
            </li>
          )}
          {agents.data?.map((a) => (
            <li key={a.frontmatter.name}>
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setSelected(a.frontmatter.name);
                }}
                className={cn(
                  "w-full rounded-md px-2 py-2 text-left transition-colors",
                  selected === a.frontmatter.name && !draft
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50",
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-medium">
                    {a.frontmatter.name}
                  </span>
                  {a.validationIssues && a.validationIssues.length > 0 && (
                    <AlertTriangle
                      className="size-3 shrink-0 text-amber-500"
                      aria-label="검증 이슈"
                    />
                  )}
                </div>
                <div className="line-clamp-1 text-xs text-muted-foreground">
                  {a.frontmatter.description || (
                    <em className="opacity-60">(설명 없음)</em>
                  )}
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
              왼쪽 리스트에서 agent를 선택하거나 새로 만드세요.
            </CardContent>
          </Card>
        ) : (
          <>
            {savedAt && (
              <div className="mb-3 inline-flex rounded-md bg-emerald-500/10 px-3 py-1 text-xs text-emerald-700 dark:text-emerald-400">
                {t("common.saved")} ✓
              </div>
            )}
            <AgentForm
              key={current.filePath ?? "new"}
              initial={current}
              projectPath={projectPath}
              isSaving={saving}
              onSave={handleSave}
              onCancel={
                draft
                  ? () => {
                      setDraft(null);
                      setSelected(agents.data?.[0]?.frontmatter.name ?? null);
                    }
                  : undefined
              }
              onDelete={
                current.filePath
                  ? () => handleDelete(current.frontmatter.name)
                  : undefined
              }
            />
          </>
        )}
      </div>
    </div>
  );
}
