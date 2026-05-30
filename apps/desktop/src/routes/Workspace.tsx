import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, FileText, ScrollText, Store, Terminal, Webhook } from "lucide-react";
import { useProjectStore } from "@/store/project";
import { TerminalView } from "@/features/terminal/Terminal";
import { cn } from "@/lib/utils";
import {
  ensureClaudeDir,
  isTauri,
  readProjectSummary,
  type ClaudeProjectSummary,
} from "@/lib/tauri";
import { projectBasename } from "@/lib/path";

export function WorkspaceRoute() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  // 프로젝트 경로는 URL이 아니라 store에 둔다 — Windows 백슬래시 등 reserved
  // char가 들어간 raw path를 URL segment로 박으면 react-router v7의 nested
  // route + relative <Navigate> 가 재조립 단계에서 경로를 깨뜨린다.
  // store는 zustand persist라 새로고침에도 살아남는다.
  const path = useProjectStore((s) => s.current);

  useEffect(() => {
    if (!path) {
      navigate("/", { replace: true });
    }
  }, [path, navigate]);

  const summary = useQuery<ClaudeProjectSummary>({
    queryKey: ["project-summary", path],
    enabled: Boolean(path && isTauri()),
    queryFn: async () => {
      if (!path) throw new Error("no path");
      await ensureClaudeDir(path);
      return await readProjectSummary(path);
    },
  });

  const isTerminalRoute = location.pathname.endsWith("/terminal");
  const [terminalMountState, setTerminalMountState] = useState<{
    projectPath: string;
    mounted: boolean;
  } | null>(
    path
      ? {
          projectPath: path,
          mounted: isTerminalRoute,
        }
      : null,
  );

  useEffect(() => {
    if (!path) return;
    setTerminalMountState((current) => {
      if (current?.projectPath !== path) {
        return { projectPath: path, mounted: isTerminalRoute };
      }
      if (isTerminalRoute && !current.mounted) {
        return { ...current, mounted: true };
      }
      return current;
    });
  }, [isTerminalRoute, path]);

  if (!path) return null;

  const tabs = [
    {
      to: "agents",
      icon: Bot,
      label: t("workspace.tabs.agents"),
      count: summary.data?.agents.length,
    },
    {
      to: "commands",
      icon: ScrollText,
      label: t("workspace.tabs.commands"),
      count: summary.data?.commands.length,
    },
    { to: "claude-md", icon: FileText, label: t("workspace.tabs.claudeMd") },
    { to: "hooks", icon: Webhook, label: t("workspace.tabs.hooks") },
    { to: "marketplace", icon: Store, label: t("workspace.tabs.marketplace") },
    { to: "terminal", icon: Terminal, label: t("workspace.tabs.terminal") },
  ];

  const [projectName, setProjectName] = useState<string>(path);
  useEffect(() => {
    let cancelled = false;
    void projectBasename(path).then((name) => {
      if (!cancelled) setProjectName(name);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <div className="grid h-full grid-cols-[260px_1fr]">
      <aside className="flex flex-col border-r bg-sidebar text-sidebar-foreground">
        <div className="border-b px-4 py-4">
          <Link
            to="/"
            className="text-xs text-muted-foreground hover:underline"
          >
            {t("workspace.back")}
          </Link>
          <h2 className="mt-1 truncate text-sm font-semibold">{projectName}</h2>
          <p className="truncate text-xs text-muted-foreground">{path}</p>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {tabs.map(({ to, icon: Icon, label, count }) => {
            const isActive = location.pathname.endsWith(`/${to}`);
            return (
              <button
                key={to}
                type="button"
                onClick={() => {
                  if (isActive) {
                    // 같은 탭 재클릭 → 디스크에서 다시 로드
                    void summary.refetch();
                    void qc.invalidateQueries({ queryKey: ["agents", path] });
                    void qc.invalidateQueries({ queryKey: ["commands", path] });
                    void qc.invalidateQueries({
                      queryKey: ["claude-md", path],
                    });
                    void qc.invalidateQueries({ queryKey: ["hooks"] });
                    void qc.invalidateQueries({ queryKey: ["marketplace"] });
                    void qc.invalidateQueries({ queryKey: ["mcp-servers"] });
                  } else {
                    navigate(to);
                  }
                }}
                title={isActive ? "다시 클릭해 새로고침" : label}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                <span className="flex-1">{label}</span>
                {typeof count === "number" && count > 0 && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        {summary.error && (
          <div className="border-t px-4 py-3 text-xs text-destructive">
            {String(summary.error)}
          </div>
        )}
      </aside>
      <main className="relative min-h-0 overflow-hidden bg-background">
        <div
          className={cn(
            "h-full min-h-0 overflow-auto",
            isTerminalRoute && "hidden",
          )}
        >
          <Outlet
            context={{
              projectPath: path,
              summary: summary.data,
              refreshSummary: () => summary.refetch(),
            }}
          />
        </div>
        {terminalMountState?.projectPath === path &&
          terminalMountState.mounted && (
            <div
              className={cn(
                "absolute inset-0 h-full min-h-0",
                !isTerminalRoute && "hidden",
              )}
            >
              <TerminalView
                key={path}
                projectPath={path}
                active={isTerminalRoute}
              />
            </div>
          )}
      </main>
    </div>
  );
}

export interface WorkspaceContext {
  projectPath: string;
  summary?: ClaudeProjectSummary;
  refreshSummary: () => void;
}
