import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { toast } from "sonner";
import {
  ArrowUpCircle,
  CheckCircle2,
  Loader2,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { isTauri } from "@/lib/tauri";
import pkg from "../../../package.json";

const APP_VERSION: string = (pkg as { version: string }).version;

interface UpdateProbeResult {
  update: Update | null;
}

export function AppUpdateBanner() {
  const { t } = useTranslation();
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const query = useQuery<UpdateProbeResult>({
    queryKey: ["app-update"],
    queryFn: async () => {
      if (!isTauri()) return { update: null };
      const update = await check();
      return { update };
    },
    staleTime: 1000 * 60 * 30,
    retry: false,
  });

  if (query.isPending) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        {t("appUpdate.checking")}
      </div>
    );
  }

  if (query.error) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">
        <Package className="size-3 text-amber-600" />
        <span className="text-amber-800/90 dark:text-amber-200/80">
          {t("appUpdate.fetchError")} ({String(query.error)})
        </span>
      </div>
    );
  }

  const update = query.data?.update ?? null;

  if (!update) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs">
        <CheckCircle2 className="size-3 text-emerald-600 dark:text-emerald-400" />
        <span className="font-medium text-emerald-700 dark:text-emerald-300">
          {t("appUpdate.current", { version: APP_VERSION })}
        </span>
        <span className="text-muted-foreground">
          · {t("appUpdate.upToDate")}
        </span>
      </div>
    );
  }

  const runUpdate = async () => {
    setInstalling(true);
    setProgress(0);
    let downloaded = 0;
    let total = 0;
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (total > 0) {
            setProgress(Math.round((downloaded / total) * 100));
          }
        } else if (event.event === "Finished") {
          setProgress(100);
        }
      });
      toast.success(t("appUpdate.installed"), {
        description: t("appUpdate.relaunching"),
      });
      await relaunch();
    } catch (e) {
      toast.error(t("appUpdate.installFailed"), { description: String(e) });
      setInstalling(false);
      setProgress(null);
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-sky-500/40 bg-sky-500/5 px-3 py-2 text-xs">
      <ArrowUpCircle className="size-3 text-sky-600 dark:text-sky-400" />
      <span className="font-medium text-sky-700 dark:text-sky-300">
        {t("appUpdate.available", { tag: `v${update.version}` })}
      </span>
      <span className="text-muted-foreground">
        · {t("appUpdate.current", { version: APP_VERSION })}
      </span>
      {installing && progress !== null && (
        <span className="text-muted-foreground">· {progress}%</span>
      )}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="ml-auto h-6 px-2 text-[11px]"
        onClick={() => void runUpdate()}
        disabled={installing}
      >
        {installing ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <ArrowUpCircle className="size-3" />
        )}
        {installing ? t("appUpdate.installing") : t("appUpdate.installNow")}
      </Button>
    </div>
  );
}
