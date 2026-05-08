import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Loader2,
  RotateCw,
  ChevronDown,
  ChevronRight,
  ArrowUpCircle,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  checkClaude,
  checkClaudeLatest,
  compareDottedVersion,
} from "@/lib/tauri";

const INSTALL_URL = "https://docs.claude.com/en/docs/claude-code/setup";
const UPDATE_GUIDE_URL =
  "https://docs.claude.com/en/docs/claude-code/setup#update-claude-code";

export function ClaudeStatusBanner() {
  const { t } = useTranslation();
  const [showDetails, setShowDetails] = useState(false);

  const status = useQuery({
    queryKey: ["claude-status"],
    queryFn: checkClaude,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const latest = useQuery({
    queryKey: ["claude-latest"],
    queryFn: checkClaudeLatest,
    staleTime: 1000 * 60 * 60, // 1시간
    retry: false,
    enabled: !!status.data?.installed,
  });

  if (status.isPending) {
    return (
      <div className="mt-6 flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        {t("claudeCheck.checking")}
      </div>
    );
  }

  if (status.data?.installed) {
    const current = status.data.version ?? "0.0.0";
    const latestVersion = latest.data?.version;
    const cmp =
      latestVersion != null
        ? compareDottedVersion(current, latestVersion)
        : null;
    const outdated = cmp !== null && cmp > 0;

    return (
      <div
        className={`mt-6 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-xs ${
          outdated
            ? "border-sky-500/40 bg-sky-500/5"
            : "border-emerald-500/30 bg-emerald-500/5"
        }`}
      >
        {outdated ? (
          <ArrowUpCircle className="size-3 text-sky-600 dark:text-sky-400" />
        ) : (
          <CheckCircle2 className="size-3 text-emerald-600 dark:text-emerald-400" />
        )}
        <span
          className={`font-medium ${
            outdated
              ? "text-sky-700 dark:text-sky-300"
              : "text-emerald-700 dark:text-emerald-300"
          }`}
        >
          {t("claudeCheck.installedTitle", { version: current })}
        </span>

        {latest.isFetching && !latestVersion && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            {t("claudeCheck.checkingLatest")}
          </span>
        )}

        {!latest.isFetching && latest.error && (
          <span
            className="text-muted-foreground"
            title={String(latest.error)}
          >
            · {t("claudeCheck.latestUnknown")}
          </span>
        )}

        {!outdated && cmp === 0 && (
          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
            <Sparkles className="size-3" />
            {t("claudeCheck.upToDate")}
          </span>
        )}

        {outdated && latestVersion && (
          <>
            <span className="font-medium text-sky-700 dark:text-sky-300">
              · {t("claudeCheck.updateAvailable", { latest: latestVersion })}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-6 px-2 text-[11px]"
              onClick={() => void openUrl(UPDATE_GUIDE_URL)}
              title={t("claudeCheck.latestSource", {
                source: latest.data?.source ?? "",
              })}
            >
              <ExternalLink className="size-3" />
              {t("claudeCheck.openUpdateGuide")}
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            {t("claudeCheck.missingTitle")}
          </h3>
          <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-200/80">
            {t("claudeCheck.missingSubtitle")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => void openUrl(INSTALL_URL)}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              <ExternalLink className="size-3" />
              {t("claudeCheck.openInstallPage")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void status.refetch()}
              disabled={status.isFetching}
            >
              {status.isFetching ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <RotateCw className="size-3" />
              )}
              {t("claudeCheck.recheck")}
            </Button>
            {status.data?.error && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowDetails((v) => !v)}
              >
                {showDetails ? (
                  <ChevronDown className="size-3" />
                ) : (
                  <ChevronRight className="size-3" />
                )}
                {t("claudeCheck.details")}
              </Button>
            )}
          </div>
          {showDetails && status.data?.error && (
            <pre className="mt-2 max-h-32 overflow-auto rounded border bg-background/80 p-2 font-mono text-[10px] text-muted-foreground">
              {status.data.error}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
