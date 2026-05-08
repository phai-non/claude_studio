import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Bot, Download, ScrollText, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { writeTextFile } from "@/lib/tauri";
import { useSettingsStore } from "@/store/project";
import {
  fetchTemplateContent,
  loadAllTemplates,
} from "./marketplace-io";
import type { ResolvedTemplate } from "./types";

interface Props {
  projectPath: string;
  refreshSummary: () => void;
}

const TYPE_ICON = {
  agent: Bot,
  command: ScrollText,
  "claude-md": ScrollText,
} as const;

export function MarketplaceGallery({ projectPath, refreshSummary }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const indexUrl = useSettingsStore((s) => s.marketplaceIndexUrl);
  const [filter, setFilter] = useState("");
  const [preview, setPreview] = useState<ResolvedTemplate | null>(null);
  const [importedAt, setImportedAt] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["marketplace", indexUrl],
    queryFn: () => loadAllTemplates(indexUrl),
  });

  const filtered = useMemo(() => {
    const all = list.data?.templates ?? [];
    if (!filter) return all;
    const q = filter.toLowerCase();
    return all.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.tags.some((tg) => tg.includes(q)),
    );
  }, [list.data, filter]);

  const importTemplate = async (tpl: ResolvedTemplate) => {
    const content = tpl.content || (await fetchTemplateContent(tpl.source));
    if (tpl.type === "agent") {
      const fileName = tpl.id.replace(/^builtin-/, "");
      const target = `${projectPath}/.claude/agents/${fileName}.md`;
      await writeTextFile(target, content);
    } else if (tpl.type === "command") {
      const fileName = tpl.id.replace(/^builtin-/, "");
      const target = `${projectPath}/.claude/commands/${fileName}.md`;
      await writeTextFile(target, content);
    } else if (tpl.type === "claude-md") {
      await writeTextFile(`${projectPath}/CLAUDE.md`, content);
    }
    refreshSummary();
    await qc.invalidateQueries({ queryKey: ["agents", projectPath] });
    await qc.invalidateQueries({ queryKey: ["commands", projectPath] });
    setImportedAt(tpl.id);
    setPreview(null);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Store className="size-5" />
          {t("marketplace.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("marketplace.subtitle")}
        </p>
        <div className="mt-3 max-w-md">
          <Input
            value={filter}
            placeholder="검색…"
            onChange={(e) => setFilter(e.currentTarget.value)}
          />
        </div>
        {list.data?.externalError && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            ⚠ {t("marketplace.fetchError")} ({list.data.externalError})
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 overflow-auto p-6 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((tpl) => {
          const Icon = TYPE_ICON[tpl.type];
          const recentlyImported = importedAt === tpl.id;
          return (
            <Card key={tpl.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="size-4 text-muted-foreground" />
                  {tpl.name}
                </CardTitle>
                <p className="text-xs text-muted-foreground">{tpl.author}</p>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <p className="line-clamp-3 flex-1 text-sm text-muted-foreground">
                  {tpl.description}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {tpl.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[10px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPreview(tpl)}
                  >
                    {t("marketplace.preview")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void importTemplate(tpl)}
                    disabled={recentlyImported}
                  >
                    <Download className="size-3" />
                    {recentlyImported
                      ? t("common.saved")
                      : t("marketplace.addToProject")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {preview && (
        <PreviewModal
          template={preview}
          onClose={() => setPreview(null)}
          onImport={() => importTemplate(preview)}
        />
      )}
    </div>
  );
}

function PreviewModal({
  template,
  onClose,
  onImport,
}: {
  template: ResolvedTemplate;
  onClose: () => void;
  onImport: () => void;
}) {
  const { t } = useTranslation();
  const content = useQuery({
    queryKey: ["template-content", template.source],
    queryFn: () => fetchTemplateContent(template.source),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-lg border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">{template.name}</h3>
            <p className="text-xs text-muted-foreground">
              {t("marketplace.source")}: {template.source}
            </p>
          </div>
          <Button variant="ghost" onClick={onClose}>
            ×
          </Button>
        </div>
        <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted p-4 text-xs">
          {content.isLoading
            ? "Loading…"
            : content.error
              ? String(content.error)
              : content.data}
        </pre>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("agent.cancel")}
          </Button>
          <Button onClick={onImport}>
            <Download className="size-4" />
            {t("marketplace.addToProject")}
          </Button>
        </div>
      </div>
    </div>
  );
}
