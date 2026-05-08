import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { FolderOpen, X, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useProjectStore } from "@/store/project";
import { isTauri, pickFolder } from "@/lib/tauri";
import { ClaudeStatusBanner } from "@/features/claude-check/ClaudeStatusBanner";
import { AppUpdateBanner } from "@/features/app-update/AppUpdateBanner";

export function WelcomeRoute() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { recents, addRecent, removeRecent, setCurrent } = useProjectStore();

  const openFolder = async () => {
    if (!isTauri()) {
      // 브라우저 개발 모드: 임시 데모 경로
      const demoPath = "/tmp/claude-studio-demo";
      addRecent(demoPath);
      setCurrent(demoPath);
      navigate(`/project/${encodeURIComponent(demoPath)}`);
      return;
    }
    const path = await pickFolder();
    if (!path) return;
    addRecent(path);
    setCurrent(path);
    navigate(`/project/${encodeURIComponent(path)}`);
  };

  const openRecent = (path: string) => {
    addRecent(path);
    setCurrent(path);
    navigate(`/project/${encodeURIComponent(path)}`);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <span className="font-bold">C</span>
          </div>
          <div>
            <h1 className="text-base font-semibold leading-none">
              {t("app.name")}
            </h1>
            <p className="text-xs text-muted-foreground">{t("app.tagline")}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/settings")}
          aria-label={t("settings.title")}
        >
          <Settings className="size-4" />
        </Button>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h2 className="text-2xl font-semibold tracking-tight">
          {t("welcome.title")}
        </h2>
        <p className="mt-2 text-muted-foreground">{t("welcome.subtitle")}</p>

        <ClaudeStatusBanner />
        <AppUpdateBanner />

        <Button size="lg" className="mt-6" onClick={openFolder}>
          <FolderOpen />
          {t("welcome.openFolder")}
        </Button>

        <section className="mt-12">
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">
            {t("welcome.recentProjects")}
          </h3>
          {recents.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                {t("welcome.emptyRecent")}
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-2">
              {recents.map((p) => (
                <li key={p.path}>
                  <Card className="group transition-colors hover:bg-accent">
                    <CardContent className="flex items-center justify-between gap-3 p-3">
                      <button
                        type="button"
                        onClick={() => openRecent(p.path)}
                        className="flex flex-1 items-center gap-3 text-left"
                      >
                        <FolderOpen className="size-4 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {p.name}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {p.path}
                          </div>
                        </div>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRecent(p.path)}
                        aria-label={t("welcome.remove")}
                      >
                        <X className="size-4" />
                      </Button>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
