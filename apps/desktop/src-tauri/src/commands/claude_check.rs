use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use tokio::time::timeout;

use crate::error::{AppError, AppResult};

#[derive(Debug, Serialize)]
pub struct ClaudeStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub error: Option<String>,
}

const PROBE_TIMEOUT_SECS: u64 = 5;

/// 사용자 환경에 `claude` CLI 가 설치돼 있는지 확인한다.
/// `claude --version` 의 첫 줄을 버전으로 본다.
///
/// 1차로 PATH에서 직접 spawn, 실패 시 unix 환경에서는 사용자 로그인 셸을 통해 재시도.
/// (macOS GUI 앱이 launchd 기본 PATH로 떴을 때 nvm/asdf 등 경로를 못 찾는 케이스 보호.)
#[tauri::command]
pub async fn check_claude() -> ClaudeStatus {
    let first_err = match probe_direct().await {
        Ok(version) => return ClaudeStatus::ok(version),
        Err(e) => e,
    };

    #[cfg(unix)]
    if let Ok(version) = probe_via_login_shell().await {
        return ClaudeStatus::ok(version);
    }

    ClaudeStatus::fail(first_err)
}

impl ClaudeStatus {
    fn ok(version: String) -> Self {
        ClaudeStatus {
            installed: true,
            version: if version.is_empty() { None } else { Some(version) },
            error: None,
        }
    }

    fn fail(error: String) -> Self {
        ClaudeStatus {
            installed: false,
            version: None,
            error: Some(error),
        }
    }
}

async fn probe_direct() -> Result<String, String> {
    let mut cmd = tokio::process::Command::new("claude");
    cmd.arg("--version");
    cmd.kill_on_drop(true);

    if let Ok(path) = std::env::var("PATH") {
        cmd.env("PATH", path);
    }
    if let Ok(home) = std::env::var("HOME") {
        cmd.env("HOME", home);
    }

    run_probe(cmd).await
}

#[cfg(unix)]
async fn probe_via_login_shell() -> Result<String, String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
    let mut cmd = tokio::process::Command::new(shell);
    // `-lc` — 로그인 셸로 .zprofile/.bash_profile을 읽고 claude 실행.
    cmd.args(["-lc", "claude --version"]);
    cmd.kill_on_drop(true);

    if let Ok(home) = std::env::var("HOME") {
        cmd.env("HOME", home);
    }

    run_probe(cmd).await
}

async fn run_probe(mut cmd: tokio::process::Command) -> Result<String, String> {
    let outcome = timeout(Duration::from_secs(PROBE_TIMEOUT_SECS), cmd.output()).await;
    match outcome {
        Ok(Ok(out)) if out.status.success() => Ok(String::from_utf8_lossy(&out.stdout)
            .lines()
            .next()
            .unwrap_or("")
            .trim()
            .to_string()),
        Ok(Ok(out)) => Err(format!(
            "claude --version exited with status {}: {}",
            out.status,
            String::from_utf8_lossy(&out.stderr).trim()
        )),
        Ok(Err(e)) => Err(format!("spawn failed: {e}")),
        Err(_) => Err(format!("timeout after {PROBE_TIMEOUT_SECS}s")),
    }
}

#[derive(Debug, Serialize)]
pub struct LatestVersionInfo {
    pub version: String,
    pub source: String,
}

const NPM_REGISTRY_URL: &str =
    "https://registry.npmjs.org/@anthropic-ai/claude-code/latest";
const NPM_FETCH_TIMEOUT_SECS: u64 = 10;

/// npm 레지스트리에서 Claude Code의 최신 발행 버전을 조회한다.
#[tauri::command]
pub async fn check_claude_latest() -> AppResult<LatestVersionInfo> {
    let client = reqwest::Client::builder()
        .user_agent("claude-studio")
        .timeout(Duration::from_secs(NPM_FETCH_TIMEOUT_SECS))
        .build()
        .map_err(|e| AppError::Other(format!("http client: {e}")))?;

    let resp = client
        .get(NPM_REGISTRY_URL)
        .send()
        .await
        .map_err(|e| AppError::Other(format!("registry fetch: {e}")))?;

    if !resp.status().is_success() {
        return Err(AppError::Other(format!(
            "registry status {}",
            resp.status()
        )));
    }

    let body: Value = resp
        .json()
        .await
        .map_err(|e| AppError::Other(format!("json parse: {e}")))?;

    let version = body
        .get("version")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::Other("missing version field in registry response".into()))?
        .to_string();

    Ok(LatestVersionInfo {
        version,
        source: "npm:@anthropic-ai/claude-code".to_string(),
    })
}
