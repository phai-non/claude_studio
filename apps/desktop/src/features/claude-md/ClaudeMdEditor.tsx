import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { readTextFile, writeTextFile } from "@/lib/tauri";

const claudeMdPath = (project: string) => `${project}/CLAUDE.md`;

interface Props {
  projectPath: string;
  refreshSummary: () => void;
}

export function ClaudeMdEditor({ projectPath, refreshSummary }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const file = claudeMdPath(projectPath);

  const [draft, setDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const initial = useQuery({
    queryKey: ["claude-md", projectPath],
    queryFn: async () => {
      try {
        return await readTextFile(file);
      } catch {
        return "";
      }
    },
  });

  useEffect(() => {
    if (initial.data !== undefined) setDraft(initial.data);
  }, [initial.data]);

  const dirty = (initial.data ?? "") !== draft;

  const save = async () => {
    setSaving(true);
    try {
      await writeTextFile(file, draft);
      await qc.invalidateQueries({ queryKey: ["claude-md", projectPath] });
      refreshSummary();
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-3">
        <div>
          <h2 className="text-sm font-semibold">{t("claudeMd.title")}</h2>
          <p className="text-xs text-muted-foreground">{file}</p>
        </div>
        <div className="flex items-center gap-2">
          {savedAt && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">
              {t("common.saved")} ✓
            </span>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={() => {
              void initial.refetch();
              refreshSummary();
            }}
            disabled={initial.isFetching}
            title="디스크에서 다시 로드"
            aria-label="새로고침"
          >
            {initial.isFetching ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RotateCw className="size-3" />
            )}
          </Button>
          <Button onClick={save} disabled={saving || !dirty}>
            <Save className="size-4" />
            {saving ? t("common.saving") : t("agent.save")}
          </Button>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-2 overflow-hidden">
        <div className="border-r">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.currentTarget.value)}
            className="h-full resize-none rounded-none border-0 font-mono text-xs focus-visible:ring-0"
            placeholder="# Project Memory&#10;&#10;Instructions, conventions, architecture notes..."
          />
        </div>
        <div className="overflow-auto bg-muted/20 px-6 py-4 markdown-preview">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {draft || "_(empty)_"}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
