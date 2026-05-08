import { invoke } from "@tauri-apps/api/core";

// Tauri 외 환경(예: 일반 브라우저에서 vite 개발)에서도 안전하게 동작하도록 가드
export const isTauri = (): boolean => {
  if (typeof window === "undefined") return false;
  return Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
};

export interface ClaudeProjectSummary {
  path: string;
  has_claude_dir: boolean;
  agents: string[];
  commands: string[];
  has_claude_md: boolean;
}

export async function pickFolder(): Promise<string | null> {
  if (!isTauri()) return null;
  return await invoke<string | null>("pick_folder");
}

export async function readProjectSummary(
  path: string,
): Promise<ClaudeProjectSummary> {
  return await invoke<ClaudeProjectSummary>("read_project_summary", { path });
}

export async function readTextFile(path: string): Promise<string> {
  return await invoke<string>("read_text_file", { path });
}

export async function writeTextFile(
  path: string,
  contents: string,
): Promise<void> {
  await invoke<void>("write_text_file", { path, contents });
}

export async function ensureClaudeDir(path: string): Promise<void> {
  await invoke<void>("ensure_claude_dir", { path });
}

export async function listAgents(projectPath: string): Promise<string[]> {
  return await invoke<string[]>("list_agents", { projectPath });
}

export async function listCommands(projectPath: string): Promise<string[]> {
  return await invoke<string[]>("list_commands", { projectPath });
}

export async function deleteFile(path: string): Promise<void> {
  await invoke<void>("delete_file", { path });
}

export async function fetchText(url: string): Promise<string> {
  return await invoke<string>("fetch_text", { url });
}

export type ToolHintSource = "builtin" | "settings" | "mcp";

export interface ToolHint {
  name: string;
  source: ToolHintSource;
  origin: string;
}

export interface ToolHints {
  hints: ToolHint[];
  warnings: string[];
}

export async function readToolHints(
  projectPath?: string,
): Promise<ToolHints> {
  if (!isTauri()) return { hints: [], warnings: ["non-tauri"] };
  return await invoke<ToolHints>("read_tool_hints", { projectPath });
}

export type ServerKind = "stdio" | "http";

export interface ConfiguredMcpServer {
  name: string;
  kind: ServerKind;
  origin: string;
  command_preview?: string;
  url?: string;
}

export interface DiscoveredTool {
  name: string;
  description?: string;
}

export interface DiscoveryResult {
  server: string;
  tools: DiscoveredTool[];
  error?: string;
}

export async function listMcpServers(
  projectPath?: string,
): Promise<ConfiguredMcpServer[]> {
  if (!isTauri()) return [];
  return await invoke<ConfiguredMcpServer[]>("list_mcp_servers", {
    projectPath,
  });
}

export async function discoverMcpTools(
  serverName: string,
  projectPath?: string,
): Promise<DiscoveryResult> {
  return await invoke<DiscoveryResult>("discover_mcp_tools", {
    serverName,
    projectPath,
  });
}

export interface ClaudeStatus {
  installed: boolean;
  version?: string;
  error?: string;
}

export async function checkClaude(): Promise<ClaudeStatus> {
  if (!isTauri()) {
    return { installed: false, error: "non-tauri runtime" };
  }
  return await invoke<ClaudeStatus>("check_claude");
}

export interface LatestVersionInfo {
  version: string;
  source: string;
}

export async function checkClaudeLatest(): Promise<LatestVersionInfo> {
  return await invoke<LatestVersionInfo>("check_claude_latest");
}

export interface LatestReleaseInfo {
  tag_name: string;
  name?: string;
  body?: string;
  html_url: string;
  published_at?: string;
  draft: boolean;
  prerelease: boolean;
}

/**
 * GitHub Releases API에서 owner/repo의 최신 release를 조회한다.
 * 404(release 없음/repo 없음)는 null로 매핑. 그 외 오류는 throw.
 */
export async function checkAppUpdate(
  ownerRepo: string,
): Promise<LatestReleaseInfo | null> {
  const cleaned = ownerRepo.trim().replace(/^https?:\/\/github\.com\//, "");
  const slash = cleaned.indexOf("/");
  if (slash <= 0 || slash === cleaned.length - 1) {
    throw new Error(`invalid owner/repo: ${ownerRepo}`);
  }
  const owner = cleaned.slice(0, slash);
  const repo = cleaned.slice(slash + 1).replace(/\/$/, "");
  return await invoke<LatestReleaseInfo | null>("check_app_update", {
    owner,
    repo,
  });
}

/**
 * 단순 점-구분 정수 비교 (semver 가벼운 버전).
 * 양수 = current가 더 낮음 (업데이트 필요)
 * 0 = 동일
 * 음수 = current가 더 높음 (preview/local build 가능성)
 */
export function compareDottedVersion(current: string, latest: string): number {
  const norm = (v: string) =>
    v
      .trim()
      .split(/\s+/)[0]!
      .replace(/^v/i, "")
      .split(".")
      .map((s) => Number(s) || 0);
  const a = norm(current);
  const b = norm(latest);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av < bv) return 1;
    if (av > bv) return -1;
  }
  return 0;
}
