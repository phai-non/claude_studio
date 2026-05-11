import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2, RotateCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  emptyHooksState,
  HOOK_EVENTS,
  type HookEntry,
  type HookEvent,
} from "@/lib/schemas/hooks";
import { settingsFilePath, type SettingsScope } from "@/lib/tauri";
import { HookEventGroup } from "./HookEventGroup";
import { loadHooks, type HooksState, saveHooks } from "./hooks-io";

interface Props {
  projectPath: string;
}

export function HooksEditor({ projectPath }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [scope, setScope] = useState<SettingsScope>("project");
  const [hooks, setHooks] = useState<HooksState>(emptyHooksState());
  const [initialKey, setInitialKey] = useState<string>("");
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  const query = useQuery({
    queryKey: ["hooks", scope, projectPath],
    queryFn: () =>
      loadHooks(scope, scope === "project" ? projectPath : undefined),
  });

  const pathQuery = useQuery({
    queryKey: ["hooks-path", scope, projectPath],
    queryFn: () =>
      settingsFilePath(scope, scope === "project" ? projectPath : undefined),
  });

  useEffect(() => {
    if (!query.data) return;
    setHooks(query.data.hooks);
    setSettings(query.data.settings);
    setInitialKey(JSON.stringify(query.data.hooks));
  }, [query.data]);

  const dirty = JSON.stringify(hooks) !== initialKey;
  const parseError = query.data?.parseError;

  const updateEvent = (event: HookEvent, next: HookEntry[]) => {
    setHooks((prev) => ({ ...prev, [event]: next }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveHooks(
        scope,
        settings,
        hooks,
        scope === "project" ? projectPath : undefined,
      );
      await qc.invalidateQueries({ queryKey: ["hooks", scope, projectPath] });
      toast.success(t("hooks.saved"), {
        description: t(`hooks.scope.${scope}`),
      });
    } catch (e) {
      toast.error(t("hooks.saveFailed"), { description: String(e) });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    void query.refetch();
  };

  const totalEntries = HOOK_EVENTS.reduce(
    (sum, e) => sum + hooks[e].length,
    0,
  );

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">{t("hooks.title")}</h2>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {pathQuery.data ?? "…"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={reset}
              disabled={query.isFetching}
              title={t("hooks.reset")}
              aria-label={t("hooks.reset")}
            >
              {query.isFetching ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <RotateCw className="size-3" />
              )}
            </Button>
            <Button
              type="button"
              onClick={save}
              disabled={saving || !dirty || Boolean(parseError)}
            >
              <Save className="size-4" />
              {saving ? t("common.saving") : t("hooks.save")}
            </Button>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1">
          {(["project", "user"] as const).map((s) => (
            <Button
              key={s}
              type="button"
              size="sm"
              variant={scope === s ? "default" : "outline"}
              onClick={() => setScope(s)}
              className="h-7 text-[11px]"
            >
              {t(`hooks.scope.${s}`)}
            </Button>
          ))}
          <span className="ml-3 text-[11px] text-muted-foreground">
            {t("hooks.entryCount", { count: totalEntries })}
          </span>
        </div>
      </div>

      {parseError && (
        <div className="flex items-start gap-2 border-b bg-destructive/5 px-6 py-3 text-xs text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          <div>
            <p className="font-medium">{t("hooks.parseError")}</p>
            <p className="mt-1 font-mono text-[11px]">{parseError}</p>
          </div>
        </div>
      )}

      <div
        className={cn(
          "flex-1 space-y-3 overflow-auto px-6 py-4",
          query.isLoading && "opacity-60",
        )}
      >
        {HOOK_EVENTS.map((event) => (
          <HookEventGroup
            key={event}
            event={event}
            entries={hooks[event]}
            onChange={(next) => updateEvent(event, next)}
          />
        ))}
      </div>
    </div>
  );
}
