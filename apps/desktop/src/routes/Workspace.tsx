import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Link,
  NavLink,
  Outlet,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bot, FileText, ScrollText, Store, Terminal } from "lucide-react";
import { useProjectStore } from "@/store/project";
import { cn } from "@/lib/utils";
import {
  ensureClaudeDir,
  isTauri,
  readProjectSummary,
  type ClaudeProjectSummary,
} from "@/lib/tauri";

export function WorkspaceRoute() {
  const { t } = useTranslation();
  const { path: encoded } = useParams();
  const navigate = useNavigate();
  const setCurrent = useProjectStore((s) => s.setCurrent);

  const path = encoded ? decodeURIComponent(encoded) : null;

  useEffect(() => {
    if (!path) {
      navigate("/", { replace: true });
      return;
    }
    setCurrent(path);
  }, [path, setCurrent, navigate]);

  const summary = useQuery<ClaudeProjectSummary>({
    queryKey: ["project-summary", path],
    enabled: Boolean(path && isTauri()),
    queryFn: async () => {
      if (!path) throw new Error("no path");
      await ensureClaudeDir(path);
      return await readProjectSummary(path);
    },
  });

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
    { to: "marketplace", icon: Store, label: t("workspace.tabs.marketplace") },
    { to: "terminal", icon: Terminal, label: t("workspace.tabs.terminal") },
  ];

  const projectName = path.split("/").filter(Boolean).pop() ?? path;

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
          {tabs.map(({ to, icon: Icon, label, count }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )
              }
            >
              <Icon className="size-4" />
              <span className="flex-1">{label}</span>
              {typeof count === "number" && count > 0 && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {count}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        {summary.error && (
          <div className="border-t px-4 py-3 text-xs text-destructive">
            {String(summary.error)}
          </div>
        )}
      </aside>
      <main className="overflow-auto bg-background">
        <Outlet
          context={{
            projectPath: path,
            summary: summary.data,
            refreshSummary: () => summary.refetch(),
          }}
        />
      </main>
    </div>
  );
}

export interface WorkspaceContext {
  projectPath: string;
  summary?: ClaudeProjectSummary;
  refreshSummary: () => void;
}
