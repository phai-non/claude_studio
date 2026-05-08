use std::collections::HashMap;
use std::path::Path;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::time::timeout;

use crate::error::{AppError, AppResult};

const HANDSHAKE_TIMEOUT_SECS: u64 = 30;
const PROTOCOL_VERSION: &str = "2025-06-18";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ServerKind {
    Stdio,
    Http,
}

#[derive(Debug, Clone, Serialize)]
pub struct ConfiguredServer {
    pub name: String,
    pub kind: ServerKind,
    pub origin: String,
    /// stdio 서버의 명령(요약)
    pub command_preview: Option<String>,
    /// http 서버의 url
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct StoredConfig {
    name: String,
    origin: String,
    raw: Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct McpTool {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DiscoveryResult {
    pub server: String,
    pub tools: Vec<McpTool>,
    pub error: Option<String>,
}

fn read_json(path: &Path) -> Option<Value> {
    serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()
}

fn collect_into(map: Option<&Value>, origin: &str, out: &mut Vec<StoredConfig>) {
    let Some(servers) = map.and_then(|v| v.as_object()) else {
        return;
    };
    for (name, cfg) in servers {
        out.push(StoredConfig {
            name: name.clone(),
            origin: origin.to_string(),
            raw: cfg.clone(),
        });
    }
}

/// 우선순위: 프로젝트별 설정이 글로벌을 덮어쓴다.
fn collect_all_configs(project_path: Option<&str>) -> Vec<StoredConfig> {
    let mut out: Vec<StoredConfig> = Vec::new();

    if let Some(home) = std::env::var_os("HOME").map(std::path::PathBuf::from) {
        // ~/.claude/mcp.json (legacy)
        let p = home.join(".claude/mcp.json");
        if let Some(j) = read_json(&p) {
            collect_into(j.get("mcpServers"), &p.display().to_string(), &mut out);
        }
        // ~/.claude.json — 메인 설정
        let p = home.join(".claude.json");
        if let Some(j) = read_json(&p) {
            let origin = p.display().to_string();
            collect_into(j.get("mcpServers"), &origin, &mut out);
            // .projects[<path>].mcpServers
            if let Some(project) = project_path {
                if let Some(per_project) = j.get("projects").and_then(|p| p.get(project)) {
                    collect_into(
                        per_project.get("mcpServers"),
                        &format!("{origin} → projects[{project}]"),
                        &mut out,
                    );
                }
            }
        }
    }

    if let Some(project) = project_path {
        // 프로젝트 .mcp.json (Claude Code 표준)
        let p = Path::new(project).join(".mcp.json");
        if let Some(j) = read_json(&p) {
            collect_into(j.get("mcpServers"), &p.display().to_string(), &mut out);
        }
    }

    // 같은 이름이 여러 출처에 있으면 가장 마지막(가장 가까운 스코프)을 유지한다.
    let mut seen: HashMap<String, usize> = HashMap::new();
    for (idx, cfg) in out.iter().enumerate() {
        seen.insert(cfg.name.clone(), idx);
    }
    let keep: std::collections::HashSet<usize> = seen.values().copied().collect();
    out.into_iter()
        .enumerate()
        .filter(|(i, _)| keep.contains(i))
        .map(|(_, c)| c)
        .collect()
}

fn detect_kind(raw: &Value) -> Option<ServerKind> {
    if raw
        .get("type")
        .and_then(|v| v.as_str())
        .map(|s| s == "http" || s == "sse")
        .unwrap_or(false)
    {
        return Some(ServerKind::Http);
    }
    if raw.get("command").and_then(|v| v.as_str()).is_some() {
        return Some(ServerKind::Stdio);
    }
    None
}

#[tauri::command]
pub fn list_mcp_servers(project_path: Option<String>) -> AppResult<Vec<ConfiguredServer>> {
    let configs = collect_all_configs(project_path.as_deref());
    let mut result = Vec::new();
    for c in configs {
        let Some(kind) = detect_kind(&c.raw) else { continue };
        let (command_preview, url) = match kind {
            ServerKind::Stdio => {
                let cmd = c
                    .raw
                    .get("command")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default();
                let args: Vec<String> = c
                    .raw
                    .get("args")
                    .and_then(|v| v.as_array())
                    .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
                    .unwrap_or_default();
                let preview = if args.is_empty() {
                    cmd.to_string()
                } else {
                    format!("{cmd} {}", args.join(" "))
                };
                (Some(preview), None)
            }
            ServerKind::Http => (
                None,
                c.raw
                    .get("url")
                    .and_then(|v| v.as_str())
                    .map(String::from),
            ),
        };
        result.push(ConfiguredServer {
            name: c.name,
            kind,
            origin: c.origin,
            command_preview,
            url,
        });
    }
    result.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(result)
}

#[tauri::command]
pub async fn discover_mcp_tools(
    server_name: String,
    project_path: Option<String>,
) -> AppResult<DiscoveryResult> {
    let configs = collect_all_configs(project_path.as_deref());
    let target = configs
        .into_iter()
        .find(|c| c.name == server_name)
        .ok_or_else(|| AppError::Other(format!("server not found: {server_name}")))?;

    let kind = detect_kind(&target.raw)
        .ok_or_else(|| AppError::Other(format!("unsupported config for {server_name}")))?;

    let outcome = match kind {
        ServerKind::Stdio => introspect_stdio(&target.raw).await,
        ServerKind::Http => Err(AppError::Other(
            "HTTP MCP introspection은 v1.1에 지원 예정입니다".into(),
        )),
    };

    Ok(match outcome {
        Ok(tools) => DiscoveryResult {
            server: server_name,
            tools,
            error: None,
        },
        Err(e) => DiscoveryResult {
            server: server_name,
            tools: Vec::new(),
            error: Some(e.to_string()),
        },
    })
}

async fn introspect_stdio(raw: &Value) -> AppResult<Vec<McpTool>> {
    let command = raw
        .get("command")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::Other("missing command".into()))?
        .to_string();
    let args: Vec<String> = raw
        .get("args")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
        .unwrap_or_default();
    let env: HashMap<String, String> = raw
        .get("env")
        .and_then(|v| v.as_object())
        .map(|m| {
            m.iter()
                .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                .collect()
        })
        .unwrap_or_default();

    let mut cmd = tokio::process::Command::new(&command);
    cmd.args(&args)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);

    // 사용자 셸 환경 일부를 상속한다 (uvx, npx, node 등이 PATH에 있어야 동작)
    if let Ok(path) = std::env::var("PATH") {
        cmd.env("PATH", path);
    }
    if let Ok(home) = std::env::var("HOME") {
        cmd.env("HOME", home);
    }
    for (k, v) in &env {
        cmd.env(k, v);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| AppError::Other(format!("spawn failed: {e}")))?;

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| AppError::Other("no stdin".into()))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::Other("no stdout".into()))?;
    let mut reader = BufReader::new(stdout).lines();

    let work = async {
        // 1) initialize
        let init = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": { "name": "claude-studio", "version": "0.0.1" }
            }
        });
        send_line(&mut stdin, &init).await?;
        let _init_resp = read_response(&mut reader, 1).await?;

        // 2) initialized notification
        let initialized = json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        });
        send_line(&mut stdin, &initialized).await?;

        // 3) tools/list
        let list = json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {}
        });
        send_line(&mut stdin, &list).await?;
        let list_resp = read_response(&mut reader, 2).await?;

        let tools_array = list_resp
            .get("result")
            .and_then(|r| r.get("tools"))
            .and_then(|t| t.as_array())
            .ok_or_else(|| AppError::Other("no tools[] in response".into()))?;

        let tools: Vec<McpTool> = tools_array
            .iter()
            .filter_map(|t| serde_json::from_value(t.clone()).ok())
            .collect();

        Ok::<_, AppError>(tools)
    };

    let result = timeout(Duration::from_secs(HANDSHAKE_TIMEOUT_SECS), work).await;
    // 응답 여부와 무관하게 항상 자식을 종료한다
    let _ = child.kill().await;

    match result {
        Ok(r) => r,
        Err(_) => Err(AppError::Other(format!(
            "MCP handshake timeout ({HANDSHAKE_TIMEOUT_SECS}s)"
        ))),
    }
}

async fn send_line(
    stdin: &mut tokio::process::ChildStdin,
    value: &Value,
) -> AppResult<()> {
    let mut s = serde_json::to_string(value).map_err(|e| AppError::Other(e.to_string()))?;
    s.push('\n');
    stdin
        .write_all(s.as_bytes())
        .await
        .map_err(|e| AppError::Other(format!("write: {e}")))?;
    stdin
        .flush()
        .await
        .map_err(|e| AppError::Other(format!("flush: {e}")))?;
    Ok(())
}

async fn read_response<R>(
    reader: &mut tokio::io::Lines<BufReader<R>>,
    id: i64,
) -> AppResult<Value>
where
    R: tokio::io::AsyncRead + Unpin,
{
    loop {
        let next = reader
            .next_line()
            .await
            .map_err(|e| AppError::Other(format!("read: {e}")))?;
        let Some(line) = next else {
            return Err(AppError::Other("EOF before response".into()));
        };
        if line.trim().is_empty() {
            continue;
        }
        let value: Value = serde_json::from_str(&line)
            .map_err(|e| AppError::Other(format!("parse: {e} (line: {line})")))?;
        if value.get("id").and_then(|i| i.as_i64()) == Some(id) {
            return Ok(value);
        }
        // 알림/다른 응답은 무시
    }
}
