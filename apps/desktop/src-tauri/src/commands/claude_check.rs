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
/// 1차로 PATH에서 직접 spawn, 실패 시 OS별 fallback:
/// - unix: 사용자 로그인 셸을 통해 재시도 (macOS GUI 앱이 launchd 기본 PATH로 떴을 때
///   nvm/asdf 등 경로를 못 찾는 케이스 보호).
/// - windows: `cmd /C` 로 PATHEXT 확장을 거쳐 `claude.cmd` (npm 글로벌 설치 시 기본) 를 찾고,
///   실패하면 `%APPDATA%\npm\claude.cmd` 등 잘 알려진 npm prefix 후보를 직접 시도.
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

    #[cfg(windows)]
    {
        if let Ok(version) = probe_via_cmd_shell().await {
            return ClaudeStatus::ok(version);
        }
        if let Ok(version) = probe_windows_well_known_paths().await {
            return ClaudeStatus::ok(version);
        }
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
    #[cfg(windows)]
    forward_windows_env(&mut cmd);

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

/// Windows: `cmd /C` 로 실행해서 PATHEXT 확장을 cmd.exe 에 위임한다.
/// npm 글로벌 설치는 `claude.cmd` 를 만들지만 `CreateProcessW` 는 PATHEXT 를
/// 보지 않기 때문에 `Command::new("claude")` 만으로는 찾지 못한다.
#[cfg(windows)]
async fn probe_via_cmd_shell() -> Result<String, String> {
    let comspec = std::env::var("ComSpec").unwrap_or_else(|_| "cmd.exe".to_string());
    let mut cmd = tokio::process::Command::new(comspec);
    cmd.args(["/C", "claude --version"]);
    cmd.kill_on_drop(true);

    forward_windows_env(&mut cmd);

    run_probe(cmd).await
}

/// Windows: npm/Volta/Scoop 등 잘 알려진 글로벌 prefix 후보를 직접 훑는다.
/// PATH 가 비어 떴거나 (release MSI 등) cmd.exe 가 막혀 있는 환경 대비.
#[cfg(windows)]
async fn probe_windows_well_known_paths() -> Result<String, String> {
    use std::path::PathBuf;

    let mut candidates: Vec<PathBuf> = Vec::new();

    // npm 글로벌 prefix: %APPDATA%\npm\claude.cmd  (npm config get prefix 의 기본값)
    if let Ok(appdata) = std::env::var("APPDATA") {
        let base = PathBuf::from(appdata).join("npm");
        candidates.push(base.join("claude.cmd"));
        candidates.push(base.join("claude.ps1"));
        candidates.push(base.join("claude.exe"));
    }

    // Node Windows 설치본 (nodejs 가 PATH 에 깔리는 곳)
    for env_key in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Ok(pf) = std::env::var(env_key) {
            let base = PathBuf::from(pf).join("nodejs");
            candidates.push(base.join("claude.cmd"));
            candidates.push(base.join("claude.exe"));
        }
    }

    // nvm-for-windows: NVM_SYMLINK 이 활성 노드 폴더를 가리킨다.
    // (보통 C:\nvm4w\nodejs 또는 사용자가 지정한 경로)
    if let Ok(symlink) = std::env::var("NVM_SYMLINK") {
        let base = PathBuf::from(symlink);
        candidates.push(base.join("claude.cmd"));
        candidates.push(base.join("claude.exe"));
    }

    // Volta shim: %LOCALAPPDATA%\Volta\bin\claude.exe
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        candidates.push(
            PathBuf::from(&local)
                .join("Volta")
                .join("bin")
                .join("claude.exe"),
        );
        // pnpm: %LOCALAPPDATA%\pnpm\claude.cmd
        candidates.push(PathBuf::from(&local).join("pnpm").join("claude.cmd"));
        candidates.push(PathBuf::from(&local).join("pnpm").join("claude.exe"));
    }

    // Scoop shim: %USERPROFILE%\scoop\shims\claude.exe
    if let Ok(user) = std::env::var("USERPROFILE") {
        candidates.push(
            PathBuf::from(&user)
                .join("scoop")
                .join("shims")
                .join("claude.exe"),
        );
        candidates.push(
            PathBuf::from(&user)
                .join("scoop")
                .join("shims")
                .join("claude.cmd"),
        );
    }

    let mut last_err = String::from("no known windows install path matched");
    for path in candidates {
        if !path.is_file() {
            continue;
        }
        let mut cmd = tokio::process::Command::new(&path);
        cmd.arg("--version");
        cmd.kill_on_drop(true);
        forward_windows_env(&mut cmd);

        match run_probe(cmd).await {
            Ok(v) => return Ok(v),
            Err(e) => last_err = format!("{}: {}", path.display(), e),
        }
    }
    Err(last_err)
}

#[cfg(windows)]
fn forward_windows_env(cmd: &mut tokio::process::Command) {
    for key in [
        "PATH",
        "PATHEXT",
        "USERPROFILE",
        "APPDATA",
        "LOCALAPPDATA",
        "ProgramFiles",
        "ProgramFiles(x86)",
        "SystemRoot",
        "ComSpec",
    ] {
        if let Ok(value) = std::env::var(key) {
            cmd.env(key, value);
        }
    }
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
