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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkClaude } from "@/lib/tauri";

const INSTALL_URL = "https://docs.claude.com/en/docs/claude-code/setup";

export function ClaudeStatusBanner() {
  const { t } = useTranslation();
  const [showDetails, setShowDetails] = useState(false);

  const status = useQuery({
    queryKey: ["claude-status"],
    queryFn: checkClaude,
    staleTime: 1000 * 60 * 5,
    retry: false,
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
    return (
      <div className="mt-6 flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs">
        <CheckCircle2 className="size-3 text-emerald-600 dark:text-emerald-400" />
        <span className="font-medium text-emerald-700 dark:text-emerald-300">
          {t("claudeCheck.installedTitle", {
            version: status.data.version ?? "",
          })}
        </span>
        <span className="text-muted-foreground">
          · {t("claudeCheck.installedSubtitle")}
        </span>
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
