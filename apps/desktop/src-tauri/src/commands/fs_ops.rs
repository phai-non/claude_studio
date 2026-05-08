use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::error::{AppError, AppResult};

#[derive(Debug, Serialize)]
pub struct ClaudeProjectSummary {
    pub path: String,
    pub has_claude_dir: bool,
    pub agents: Vec<String>,
    pub commands: Vec<String>,
    pub has_claude_md: bool,
}

#[tauri::command]
pub async fn pick_folder(app: AppHandle) -> AppResult<Option<String>> {
    // Tauri plugin-dialog의 폴더 선택은 콜백 기반.
    // 콜백 결과를 std mpsc로 받아 spawn_blocking에서 대기 후 async로 합류한다.
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    app.dialog().file().pick_folder(move |path| {
        let _ = tx.send(path);
    });

    let picked = tauri::async_runtime::spawn_blocking(move || rx.recv())
        .await
        .map_err(|e| AppError::Other(format!("join error: {e}")))?
        .map_err(|e| AppError::Other(format!("recv error: {e}")))?;

    Ok(picked.map(|fp| fp.to_string()))
}

/// 주어진 프로젝트 경로의 .claude/ 와 CLAUDE.md 상태를 요약한다.
#[tauri::command]
pub fn read_project_summary(path: String) -> AppResult<ClaudeProjectSummary> {
    let project = Path::new(&path);
    if !project.is_dir() {
        return Err(AppError::NotADirectory(path));
    }

    let claude_dir = project.join(".claude");
    let has_claude_dir = claude_dir.is_dir();
    let agents = if has_claude_dir {
        list_md_files(&claude_dir.join("agents"))?
    } else {
        Vec::new()
    };
    let commands = if has_claude_dir {
        list_md_files(&claude_dir.join("commands"))?
    } else {
        Vec::new()
    };
    let has_claude_md = project.join("CLAUDE.md").is_file();

    Ok(ClaudeProjectSummary {
        path: path.clone(),
        has_claude_dir,
        agents,
        commands,
        has_claude_md,
    })
}

#[tauri::command]
pub fn ensure_claude_dir(path: String) -> AppResult<()> {
    let project = Path::new(&path);
    if !project.is_dir() {
        return Err(AppError::NotADirectory(path));
    }
    std::fs::create_dir_all(project.join(".claude/agents"))?;
    std::fs::create_dir_all(project.join(".claude/commands"))?;
    Ok(())
}

#[tauri::command]
pub fn read_text_file(path: String) -> AppResult<String> {
    let p = Path::new(&path);
    let s = std::fs::read_to_string(p)?;
    Ok(s)
}

#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> AppResult<()> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(p, contents)?;
    Ok(())
}

#[tauri::command]
pub fn delete_file(path: String) -> AppResult<()> {
    let p = Path::new(&path);
    if p.is_file() {
        std::fs::remove_file(p)?;
    }
    Ok(())
}

#[tauri::command]
pub fn list_agents(project_path: String) -> AppResult<Vec<String>> {
    let project = Path::new(&project_path);
    list_md_files(&project.join(".claude/agents"))
}

#[tauri::command]
pub fn list_commands(project_path: String) -> AppResult<Vec<String>> {
    let project = Path::new(&project_path);
    list_md_files(&project.join(".claude/commands"))
}

fn list_md_files(dir: &Path) -> AppResult<Vec<String>> {
    if !dir.is_dir() {
        return Ok(Vec::new());
    }
    let mut names = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let p: PathBuf = entry.path();
        if p.is_file() && p.extension().and_then(|s| s.to_str()) == Some("md") {
            if let Some(name) = p.file_stem().and_then(|s| s.to_str()) {
                names.push(name.to_string());
            }
        }
    }
    names.sort();
    Ok(names)
}
