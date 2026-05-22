use std::path::Path;

use serde::Serialize;
use serde_json::Value;

use crate::error::AppResult;

/// 어디서 발견됐는지에 따른 툴 힌트 분류.
#[derive(Debug, Serialize, Clone, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ToolHintSource {
    /// Claude Code 내장 툴로 추정
    Builtin,
    /// settings.json `permissions.allow` 에서 추출
    Settings,
    /// mcp.json 의 `mcpServers` 키에서 파생
    Mcp,
}

#[derive(Debug, Serialize)]
pub struct ToolHint {
    pub name: String,
    pub source: ToolHintSource,
    /// 출처 파일 절대 경로 (디버깅·노출용)
    pub origin: String,
}

#[derive(Debug, Serialize)]
pub struct ToolHints {
    pub hints: Vec<ToolHint>,
    /// 분석 중 무시한 항목이 있는 경우의 노트
    pub warnings: Vec<String>,
}

/// `permissions.allow` 의 한 패턴에서 툴 이름만 추출한다.
///
/// 예) `Bash(git status:*)` → `Bash`
///     `mcp__serena__find_symbol` → `mcp__serena__find_symbol`
///     `mcp__serena__*` → `mcp__serena__*`
fn extract_tool_name(pattern: &str) -> String {
    pattern.split('(').next().unwrap_or(pattern).trim().to_string()
}

fn read_json(path: &Path) -> Option<Value> {
    let raw = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn collect_settings(json: &Value, origin: &str, out: &mut Vec<ToolHint>) {
    let allow = json
        .get("permissions")
        .and_then(|p| p.get("allow"))
        .and_then(|a| a.as_array());
    if let Some(arr) = allow {
        for v in arr {
            if let Some(s) = v.as_str() {
                let name = extract_tool_name(s);
                if !name.is_empty() {
                    out.push(ToolHint {
                        name,
                        source: ToolHintSource::Settings,
                        origin: origin.to_string(),
                    });
                }
            }
        }
    }
}

fn collect_mcp(json: &Value, origin: &str, out: &mut Vec<ToolHint>) {
    let servers = json.get("mcpServers").and_then(|v| v.as_object());
    if let Some(map) = servers {
        for key in map.keys() {
            // `mcp__<server>__*` 형식의 와일드카드 힌트로 노출
            out.push(ToolHint {
                name: format!("mcp__{key}__*"),
                source: ToolHintSource::Mcp,
                origin: origin.to_string(),
            });
        }
    }
}

/// 글로벌 ~/.claude 와 주어진 프로젝트의 설정에서 툴 힌트를 수집한다.
#[tauri::command]
pub fn read_tool_hints(project_path: Option<String>) -> AppResult<ToolHints> {
    let mut hints: Vec<ToolHint> = Vec::new();
    let warnings: Vec<String> = Vec::new();

    // 1) Claude Code 내장 툴 (정적 목록 — 외부 시스템에서 동적 발견 어려움)
    for name in BUILTIN_TOOLS {
        hints.push(ToolHint {
            name: (*name).to_string(),
            source: ToolHintSource::Builtin,
            origin: "builtin".to_string(),
        });
    }

    // 2) ~/.claude/settings.json + ~/.claude/mcp.json + ~/.claude.json
    if let Some(home) = dirs_home() {
        let global_settings = home.join(".claude/settings.json");
        if let Some(j) = read_json(&global_settings) {
            collect_settings(&j, &global_settings.display().to_string(), &mut hints);
        }
        let global_mcp_legacy = home.join(".claude/mcp.json");
        if let Some(j) = read_json(&global_mcp_legacy) {
            collect_mcp(&j, &global_mcp_legacy.display().to_string(), &mut hints);
        }

        // ~/.claude.json — Claude Code의 메인 설정.
        // 최상위 mcpServers (글로벌) + projects.<path>.mcpServers (프로젝트별).
        let global_state = home.join(".claude.json");
        if let Some(j) = read_json(&global_state) {
            let origin = global_state.display().to_string();
            collect_mcp(&j, &origin, &mut hints);
            // 프로젝트별 항목
            if let Some(project) = project_path.as_deref() {
                if let Some(per_project) = j
                    .get("projects")
                    .and_then(|p| p.get(project))
                {
                    collect_mcp(
                        per_project,
                        &format!("{origin} → projects[{project}]"),
                        &mut hints,
                    );
                    collect_settings(
                        per_project,
                        &format!("{origin} → projects[{project}]"),
                        &mut hints,
                    );
                }
            }
        }
    }

    // 3) 프로젝트 .claude/settings.json{,.local.json}, .mcp.json
    if let Some(project) = project_path.as_deref() {
        let project_dir = Path::new(project);
        for fname in ["settings.json", "settings.local.json"] {
            let p = project_dir.join(".claude").join(fname);
            if let Some(j) = read_json(&p) {
                collect_settings(&j, &p.display().to_string(), &mut hints);
            }
        }
        let mcp = project_dir.join(".mcp.json");
        if let Some(j) = read_json(&mcp) {
            collect_mcp(&j, &mcp.display().to_string(), &mut hints);
        }
    }

    // 중복 제거 (name 기준, 첫 출처 유지)
    let mut seen = std::collections::HashSet::new();
    hints.retain(|h| seen.insert(h.name.clone()));

    Ok(ToolHints { hints, warnings })
}

/// OS-native 사용자 홈 조회. Windows 는 USERPROFILE, unix 는 $HOME 을
/// `dirs` crate 가 알아서 처리한다.
fn dirs_home() -> Option<std::path::PathBuf> {
    dirs::home_dir()
}

const BUILTIN_TOOLS: &[&str] = &[
    "Read",
    "Write",
    "Edit",
    "Bash",
    "BashOutput",
    "KillShell",
    "Glob",
    "Grep",
    "WebFetch",
    "WebSearch",
    "TodoWrite",
    "Task",
    "NotebookEdit",
    "Skill",
    "SlashCommand",
];
