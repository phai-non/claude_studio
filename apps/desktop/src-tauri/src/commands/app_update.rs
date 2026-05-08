use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

const FETCH_TIMEOUT_SECS: u64 = 10;

#[derive(Debug, Serialize, Deserialize)]
pub struct LatestReleaseInfo {
    pub tag_name: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub body: Option<String>,
    pub html_url: String,
    #[serde(default)]
    pub published_at: Option<String>,
    #[serde(default)]
    pub draft: bool,
    #[serde(default)]
    pub prerelease: bool,
}

/// GitHub Releases API에서 owner/repo의 최신 release를 조회한다.
///
/// 반환값:
/// - Ok(Some(_)) — release 발견
/// - Ok(None)    — 404 (저장소가 없거나 release가 아직 없음)
/// - Err(_)      — 네트워크/응답 오류
#[tauri::command]
pub async fn check_app_update(
    owner: String,
    repo: String,
) -> AppResult<Option<LatestReleaseInfo>> {
    if owner.is_empty() || repo.is_empty() {
        return Err(AppError::Other("owner/repo is empty".into()));
    }
    if owner.contains('/') || repo.contains('/') {
        return Err(AppError::Other(
            "owner/repo must not contain '/'; pass them separately".into(),
        ));
    }

    let url = format!("https://api.github.com/repos/{owner}/{repo}/releases/latest");

    let client = reqwest::Client::builder()
        .user_agent("claude-studio")
        .timeout(Duration::from_secs(FETCH_TIMEOUT_SECS))
        .build()
        .map_err(|e| AppError::Other(format!("http client: {e}")))?;

    let resp = client
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| AppError::Other(format!("github fetch: {e}")))?;

    let status = resp.status();
    if status.as_u16() == 404 {
        return Ok(None);
    }
    if !status.is_success() {
        return Err(AppError::Other(format!(
            "github status {status}: {}",
            resp.text().await.unwrap_or_default()
        )));
    }

    let info: LatestReleaseInfo = resp
        .json()
        .await
        .map_err(|e| AppError::Other(format!("json parse: {e}")))?;

    Ok(Some(info))
}
