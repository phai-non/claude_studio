import { basename as tauriBasename } from "@tauri-apps/api/path";
import { isTauri } from "./tauri";

/**
 * 경로의 마지막 segment를 OS-aware 로 뽑는다.
 * Tauri 환경에서는 std::path 기반의 `basename` 호출, dev 브라우저 환경에서는
 * `/` 와 `\` 둘 다 분리자로 보는 fallback regex.
 *
 * Windows path (`F:\git\Madonna`), POSIX path (`/Users/foo/bar`) 모두 안전.
 */
export async function projectBasename(path: string): Promise<string> {
  if (isTauri()) {
    try {
      const name = await tauriBasename(path);
      if (name) return name;
    } catch {
      // Tauri 가 reject 한 경우 (잘못된 path 등) regex fallback 으로 떨어진다.
    }
  }
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path;
}
