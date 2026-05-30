import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface RecentProject {
  path: string;
  name: string;
  lastOpenedAt: number;
}

interface ProjectStore {
  recents: RecentProject[];
  current: string | null;
  setCurrent: (path: string | null) => void;
  addRecent: (path: string, name: string) => void;
  removeRecent: (path: string) => void;
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      recents: [],
      current: null,
      setCurrent: (path) => set({ current: path }),
      addRecent: (path, name) => {
        const next: RecentProject = {
          path,
          name: name || path,
          lastOpenedAt: Date.now(),
        };
        const filtered = get().recents.filter((p) => p.path !== path);
        set({ recents: [next, ...filtered].slice(0, 12) });
      },
      removeRecent: (path) =>
        set({ recents: get().recents.filter((p) => p.path !== path) }),
    }),
    { name: "cs.recents" },
  ),
);

interface SettingsStore {
  theme: "light" | "dark" | "system";
  marketplaceIndexUrl: string;
  autoUpdateEnabled: boolean;
  autoUpdateIntervalHours: number;
  setTheme: (theme: SettingsStore["theme"]) => void;
  setMarketplaceIndexUrl: (url: string) => void;
  setAutoUpdateEnabled: (enabled: boolean) => void;
  setAutoUpdateIntervalHours: (hours: number) => void;
}

// 외부 마켓플레이스 인덱스는 옵션 (builtin 템플릿이 항상 보임). 사용자가
// Settings 에서 URL 을 직접 등록하기 전엔 외부 fetch 안 한다.
const DEFAULT_INDEX_URL = "";
const DEFAULT_AUTO_UPDATE_INTERVAL_HOURS = 24;

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      theme: "system",
      marketplaceIndexUrl: DEFAULT_INDEX_URL,
      autoUpdateEnabled: true,
      autoUpdateIntervalHours: DEFAULT_AUTO_UPDATE_INTERVAL_HOURS,
      setTheme: (theme) => set({ theme }),
      setMarketplaceIndexUrl: (url) => set({ marketplaceIndexUrl: url }),
      setAutoUpdateEnabled: (enabled) => set({ autoUpdateEnabled: enabled }),
      setAutoUpdateIntervalHours: (hours) => {
        const normalized = Math.max(1, Math.min(720, Math.floor(hours)));
        set({ autoUpdateIntervalHours: normalized });
      },
    }),
    { name: "cs.settings" },
  ),
);

/** 테마를 document에 적용 (system은 prefers-color-scheme 추적) */
export function applyTheme(theme: SettingsStore["theme"]): () => void {
  const root = document.documentElement;
  const apply = () => {
    if (theme === "dark") root.classList.add("dark");
    else if (theme === "light") root.classList.remove("dark");
    else {
      const dark = matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", dark);
    }
  };
  apply();
  if (theme === "system") {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const handler = () => apply();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }
  return () => {};
}
