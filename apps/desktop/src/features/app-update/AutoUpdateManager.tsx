import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { toast } from "sonner";
import { isTauri } from "@/lib/tauri";
import { useSettingsStore } from "@/store/project";

interface UpdateProbeResult {
  update: Update | null;
}

const MIN_INTERVAL_HOURS = 1;
const MAX_INTERVAL_HOURS = 720; // 30 days

export function AutoUpdateManager() {
  const { t } = useTranslation();
  const {
    autoUpdateEnabled,
    autoUpdateIntervalHours,
  } = useSettingsStore((s) => ({
    autoUpdateEnabled: s.autoUpdateEnabled,
    autoUpdateIntervalHours: s.autoUpdateIntervalHours,
  }));

  const intervalMs = useMemo(() => {
    const normalized = Math.min(
      MAX_INTERVAL_HOURS,
      Math.max(MIN_INTERVAL_HOURS, Math.floor(autoUpdateIntervalHours)),
    );
    return normalized * 60 * 60 * 1000;
  }, [autoUpdateIntervalHours]);

  const lastPromptedVersion = useRef<string | null>(null);
  const applyingRef = useRef(false);

  useEffect(() => {
    if (!autoUpdateEnabled) {
      lastPromptedVersion.current = null;
      applyingRef.current = false;
    }
  }, [autoUpdateEnabled]);

  const query = useQuery<UpdateProbeResult>({
    queryKey: ["app-update-auto"],
    queryFn: async () => {
      if (!isTauri()) return { update: null };
      const update = await check();
      return { update };
    },
    enabled: autoUpdateEnabled && isTauri(),
    staleTime: 1000 * 60 * 10,
    retry: false,
    refetchInterval: autoUpdateEnabled ? intervalMs : false,
    refetchOnWindowFocus: true,
  });

  const applyUpdate = useCallback(async (update: Update) => {
    if (applyingRef.current) return;
    applyingRef.current = true;

    const toastId = toast.info(t("appUpdate.autoChecking"), {
      description: t("appUpdate.autoApplying", { version: `v${update.version}` }),
    });

    try {
      await update.downloadAndInstall(() => {
        return;
      });
      toast.success(t("appUpdate.installed"), {
        description: t("appUpdate.relaunching"),
        id: toastId,
      });
      await relaunch();
    } catch (error) {
      applyingRef.current = false;
      lastPromptedVersion.current = null;
      toast.error(t("appUpdate.installFailed"), {
        description: String(error),
      });
    }
  }, [t]);

  useEffect(() => {
    if (!autoUpdateEnabled) {
      return;
    }

    const { update } = query.data ?? { update: null };
    if (!update || applyingRef.current || query.isPending) {
      return;
    }

    if (lastPromptedVersion.current === update.version) {
      return;
    }
    lastPromptedVersion.current = update.version;
    void applyUpdate(update);
  }, [autoUpdateEnabled, applyUpdate, query.data?.update?.version, query.isPending]);

  return null;
}
