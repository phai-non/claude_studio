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
  addRecent: (path: string) => void;
  removeRecent: (path: string) => void;
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      recents: [],
      current: null,
      setCurrent: (path) => set({ current: path }),
      addRecent: (path) => {
        const name = path.split("/").filter(Boolean).pop() ?? path;
        const next: RecentProject = {
          path,
          name,
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
  /** GitHub Releases 기반 앱 업데이트 체크 대상. "owner/repo" 형식. 빈 값이면 비활성. */
  appUpdateRepo: string;
  setTheme: (theme: SettingsStore["theme"]) => void;
  setMarketplaceIndexUrl: (url: string) => void;
  setAppUpdateRepo: (repo: string) => void;
}

const DEFAULT_INDEX_URL =
  "https://raw.githubusercontent.com/claude-studio/marketplace-index/main/manifest.json";

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      theme: "system",
      marketplaceIndexUrl: DEFAULT_INDEX_URL,
      appUpdateRepo: "",
      setTheme: (theme) => set({ theme }),
      setMarketplaceIndexUrl: (url) => set({ marketplaceIndexUrl: url }),
      setAppUpdateRepo: (repo) => set({ appUpdateRepo: repo.trim() }),
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
