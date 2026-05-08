use std::time::Duration;

use serde::Serialize;
use tokio::time::timeout;

#[derive(Debug, Serialize)]
pub struct ClaudeStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub error: Option<String>,
}

const PROBE_TIMEOUT_SECS: u64 = 5;

/// 사용자 환경에 `claude` CLI 가 설치돼 있는지 확인한다.
/// `claude --version` 의 첫 줄을 버전으로 본다.
#[tauri::command]
pub async fn check_claude() -> ClaudeStatus {
    let mut cmd = tokio::process::Command::new("claude");
    cmd.arg("--version");
    cmd.kill_on_drop(true);

    if let Ok(path) = std::env::var("PATH") {
        cmd.env("PATH", path);
    }
    if let Ok(home) = std::env::var("HOME") {
        cmd.env("HOME", home);
    }

    let outcome = timeout(Duration::from_secs(PROBE_TIMEOUT_SECS), cmd.output()).await;

    match outcome {
        Ok(Ok(out)) if out.status.success() => {
            let version = String::from_utf8_lossy(&out.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_string();
            ClaudeStatus {
                installed: true,
                version: if version.is_empty() {
                    None
                } else {
                    Some(version)
                },
                error: None,
            }
        }
        Ok(Ok(out)) => ClaudeStatus {
            installed: false,
            version: None,
            error: Some(format!(
                "claude --version exited with status {}: {}",
                out.status,
                String::from_utf8_lossy(&out.stderr).trim()
            )),
        },
        Ok(Err(e)) => ClaudeStatus {
            installed: false,
            version: None,
            error: Some(format!("spawn failed: {e}")),
        },
        Err(_) => ClaudeStatus {
            installed: false,
            version: None,
            error: Some(format!("timeout after {PROBE_TIMEOUT_SECS}s")),
        },
    }
}
