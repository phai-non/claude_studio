import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowUpCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  checkAppUpdate,
  compareDottedVersion,
  type LatestReleaseInfo,
} from "@/lib/tauri";
import pkg from "../../../package.json";

const APP_VERSION: string = (pkg as { version: string }).version;
const APP_UPDATE_REPO = "UkiDelly/claude_studio";

export function AppUpdateBanner() {
  const { t } = useTranslation();

  const query = useQuery<LatestReleaseInfo | null>({
    queryKey: ["app-update", APP_UPDATE_REPO],
    queryFn: () => checkAppUpdate(APP_UPDATE_REPO),
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

  const release = query.data;

  if (!release) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <Package className="size-3" />
        {t("appUpdate.current", { version: APP_VERSION })} ·{" "}
        {t("appUpdate.noReleasesYet")}
      </div>
    );
  }

  const cmp = compareDottedVersion(APP_VERSION, release.tag_name);
  const outdated = cmp > 0;

  if (!outdated) {
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

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-sky-500/40 bg-sky-500/5 px-3 py-2 text-xs">
      <ArrowUpCircle className="size-3 text-sky-600 dark:text-sky-400" />
      <span className="font-medium text-sky-700 dark:text-sky-300">
        {t("appUpdate.available", { tag: release.tag_name })}
      </span>
      <span className="text-muted-foreground">
        · {t("appUpdate.current", { version: APP_VERSION })}
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="ml-auto h-6 px-2 text-[11px]"
        onClick={() => void openUrl(release.html_url)}
      >
        <ExternalLink className="size-3" />
        {t("appUpdate.openRelease")}
      </Button>
    </div>
  );
}
