//! `.claude/settings.json` 의 read/write — scope(project/user)에 따라 경로를 자동 결정한다.
//!
//! - `project` → `<project_path>/.claude/settings.json`
//! - `user`    → `$HOME/.claude/settings.json`
//!
//! 파일이 없으면 read는 빈 문자열을 반환한다(클라이언트에서 `"{}"` 로 취급).
//! write는 부모 디렉터리를 `mkdir -p` 한 뒤 쓴다.

use std::path::PathBuf;

use crate::error::{AppError, AppResult};

const SETTINGS_REL: &str = ".claude/settings.json";

fn resolve_path(scope: &str, project_path: Option<&str>) -> AppResult<PathBuf> {
    match scope {
        "project" => {
            let p = project_path.ok_or_else(|| {
                AppError::Other("project scope에는 project_path가 필요합니다".into())
            })?;
            Ok(PathBuf::from(p).join(SETTINGS_REL))
        }
        "user" => {
            // Windows 에는 HOME 이 없고 USERPROFILE 이 표준. dirs crate 가
            // OS API (Win32 KnownFolderID / unix $HOME) 로 안전하게 처리.
            let home = dirs::home_dir()
                .ok_or_else(|| AppError::Other("사용자 홈 디렉터리를 찾을 수 없습니다".into()))?;
            Ok(home.join(SETTINGS_REL))
        }
        other => Err(AppError::Other(format!("알 수 없는 scope: {other}"))),
    }
}

/// settings.json 의 내용을 그대로 반환. 파일이 없으면 빈 문자열.
#[tauri::command]
pub fn read_settings_file(
    scope: String,
    project_path: Option<String>,
) -> AppResult<String> {
    let path = resolve_path(&scope, project_path.as_deref())?;
    if !path.is_file() {
        return Ok(String::new());
    }
    Ok(std::fs::read_to_string(&path)?)
}

/// settings.json 에 내용을 쓴다. 부모 디렉터리는 없으면 만든다.
#[tauri::command]
pub fn write_settings_file(
    scope: String,
    project_path: Option<String>,
    contents: String,
) -> AppResult<()> {
    let path = resolve_path(&scope, project_path.as_deref())?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path, contents)?;
    Ok(())
}

/// 클라이언트가 표시할 수 있도록 결정된 절대 경로를 돌려준다.
#[tauri::command]
pub fn settings_file_path(
    scope: String,
    project_path: Option<String>,
) -> AppResult<String> {
    Ok(resolve_path(&scope, project_path.as_deref())?
        .display()
        .to_string())
}
