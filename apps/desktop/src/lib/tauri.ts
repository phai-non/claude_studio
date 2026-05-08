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
