import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useSettingsStore } from "@/store/project";

export function SettingsRoute() {
  const { t, i18n } = useTranslation();
  const {
    theme,
    setTheme,
    marketplaceIndexUrl,
    setMarketplaceIndexUrl,
    autoUpdateEnabled,
    setAutoUpdateEnabled,
    autoUpdateIntervalHours,
    setAutoUpdateIntervalHours,
  } = useSettingsStore();

  return (
    <div className="mx-auto w-full max-w-xl px-6 py-10">
      <Link to="/" className="text-xs text-muted-foreground hover:underline">
        {t("workspace.back")}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{t("settings.title")}</h1>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-sm">{t("settings.language")}</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          {(["ko", "en"] as const).map((lng) => (
            <Button
              key={lng}
              variant={i18n.language?.startsWith(lng) ? "default" : "outline"}
              size="sm"
              onClick={() => i18n.changeLanguage(lng)}
            >
              {lng === "ko" ? "한국어" : "English"}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-sm">{t("settings.theme")}</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          {(["light", "dark", "system"] as const).map((mode) => (
            <Button
              key={mode}
              variant={theme === mode ? "default" : "outline"}
              size="sm"
              onClick={() => setTheme(mode)}
            >
              {t(`settings.theme${mode[0].toUpperCase()}${mode.slice(1)}`)}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-sm">{t("settings.autoUpdate")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={autoUpdateEnabled ? "default" : "outline"}
              size="sm"
              onClick={() => setAutoUpdateEnabled(true)}
            >
              {t("settings.autoUpdateEnabled")}
            </Button>
            <Button
              type="button"
              variant={!autoUpdateEnabled ? "default" : "outline"}
              size="sm"
              onClick={() => setAutoUpdateEnabled(false)}
            >
              {t("settings.autoUpdateDisabled")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("settings.autoUpdateIntervalHint")}
          </p>
          <div className="space-y-1">
            <Label htmlFor="auto-update-interval" className="text-xs text-muted-foreground">
              {t("settings.autoUpdateInterval")}
            </Label>
            <Input
              id="auto-update-interval"
              type="number"
              min={1}
              max={720}
              value={autoUpdateIntervalHours}
              onChange={(e) => {
                const next = Number.parseInt(e.currentTarget.value, 10);
                if (!Number.isNaN(next)) {
                  setAutoUpdateIntervalHours(next);
                }
              }}
              className="w-36"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-sm">{t("marketplace.indexUrl")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="index-url" className="text-xs text-muted-foreground">
            manifest.json
          </Label>
          <Input
            id="index-url"
            value={marketplaceIndexUrl}
            onChange={(e) => setMarketplaceIndexUrl(e.currentTarget.value)}
          />
        </CardContent>
      </Card>

    </div>
  );
}
