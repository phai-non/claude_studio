use std::collections::HashMap;
use std::path::Path;
use std::time::Duration;

use reqwest::header::{HeaderMap, HeaderName, HeaderValue, ACCEPT, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::time::timeout;

use crate::error::{AppError, AppResult};

const HANDSHAKE_TIMEOUT_SECS: u64 = 30;
const PROTOCOL_VERSION: &str = "2025-06-18";
const CLIENT_NAME: &str = "claude-studio";
const CLIENT_VERSION: &str = "0.0.1";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ServerKind {
    Stdio,
    /// Streamable HTTP transport (MCP 2025-03-26 spec, 권장)
    Http,
    /// Legacy HTTP+SSE transport (MCP 2024-11 spec)
    Sse,
}

#[derive(Debug, Clone, Serialize)]
pub struct ConfiguredServer {
    pub name: String,
    pub kind: ServerKind,
    pub origin: String,
    /// stdio 서버의 명령(요약)
    pub command_preview: Option<String>,
    /// http/sse 서버의 url
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
    if let Some(t) = raw.get("type").and_then(|v| v.as_str()) {
        match t {
            "http" => return Some(ServerKind::Http),
            "sse" => return Some(ServerKind::Sse),
            _ => {}
        }
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
            ServerKind::Http | ServerKind::Sse => (
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
        ServerKind::Http => introspect_http(&target.raw).await,
        ServerKind::Sse => introspect_sse(&target.raw).await,
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

// ---------- 공통 헬퍼 ----------

fn init_params() -> Value {
    json!({
        "protocolVersion": PROTOCOL_VERSION,
        "capabilities": {},
        "clientInfo": { "name": CLIENT_NAME, "version": CLIENT_VERSION }
    })
}

fn parse_tools(response: &Value) -> AppResult<Vec<McpTool>> {
    let arr = response
        .get("result")
        .and_then(|r| r.get("tools"))
        .and_then(|t| t.as_array())
        .ok_or_else(|| AppError::Other("no tools[] in response".into()))?;
    Ok(arr
        .iter()
        .filter_map(|t| serde_json::from_value(t.clone()).ok())
        .collect())
}

fn read_headers(raw: &Value) -> HashMap<String, String> {
    raw.get("headers")
        .and_then(|v| v.as_object())
        .map(|m| {
            m.iter()
                .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                .collect()
        })
        .unwrap_or_default()
}

fn merge_user_headers(headers: &mut HeaderMap, user: &HashMap<String, String>) {
    for (k, v) in user {
        let Ok(name) = HeaderName::from_bytes(k.as_bytes()) else { continue };
        let Ok(val) = HeaderValue::from_str(v) else { continue };
        headers.insert(name, val);
    }
}

fn http_error_to_app_error(status: reqwest::StatusCode, body: &str) -> AppError {
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return AppError::Other(format!(
            "인증 실패 ({}): headers.Authorization 확인",
            status.as_u16()
        ));
    }
    let snippet: String = body.chars().take(200).collect();
    AppError::Other(format!("서버 응답 {}: {snippet}", status.as_u16()))
}

// ---------- stdio ----------

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
            "params": init_params(),
        });
        send_line(&mut stdin, &init).await?;
        let _init_resp = read_response(&mut reader, 1).await?;

        // 2) initialized notification
        let initialized = json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized",
        });
        send_line(&mut stdin, &initialized).await?;

        // 3) tools/list
        let list = json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {},
        });
        send_line(&mut stdin, &list).await?;
        let list_resp = read_response(&mut reader, 2).await?;

        parse_tools(&list_resp)
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

// ---------- Streamable HTTP transport (2025-03-26) ----------

async fn introspect_http(raw: &Value) -> AppResult<Vec<McpTool>> {
    let url = raw
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::Other("missing url".into()))?
        .to_string();
    let user_headers = read_headers(raw);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(HANDSHAKE_TIMEOUT_SECS))
        .build()
        .map_err(|e| AppError::Other(format!("http client: {e}")))?;

    let work = async {
        let mut session = StreamableSession::new(client, url, user_headers);

        let init_req = json!({
            "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": init_params()
        });
        let _init = session.send_request(&init_req, 1).await?;

        let notif = json!({
            "jsonrpc": "2.0", "method": "notifications/initialized"
        });
        session.send_notification(&notif).await?;

        let list = json!({
            "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}
        });
        let list_resp = session.send_request(&list, 2).await?;
        parse_tools(&list_resp)
    };

    timeout(Duration::from_secs(HANDSHAKE_TIMEOUT_SECS), work)
        .await
        .map_err(|_| AppError::Other(format!("MCP handshake timeout ({HANDSHAKE_TIMEOUT_SECS}s)")))?
}

struct StreamableSession {
    client: reqwest::Client,
    url: String,
    user_headers: HashMap<String, String>,
    session_id: Option<String>,
}

impl StreamableSession {
    fn new(
        client: reqwest::Client,
        url: String,
        user_headers: HashMap<String, String>,
    ) -> Self {
        Self {
            client,
            url,
            user_headers,
            session_id: None,
        }
    }

    fn build_headers(&self) -> HeaderMap {
        let mut h = HeaderMap::new();
        h.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        h.insert(
            ACCEPT,
            HeaderValue::from_static("application/json, text/event-stream"),
        );
        if let Some(sid) = self.session_id.as_deref() {
            if let Ok(v) = HeaderValue::from_str(sid) {
                if let Ok(name) = HeaderName::from_bytes(b"mcp-session-id") {
                    h.insert(name, v);
                }
            }
        }
        merge_user_headers(&mut h, &self.user_headers);
        h
    }

    async fn send_request(&mut self, payload: &Value, id: i64) -> AppResult<Value> {
        let headers = self.build_headers();
        let resp = self
            .client
            .post(&self.url)
            .headers(headers)
            .json(payload)
            .send()
            .await
            .map_err(|e| AppError::Other(format!("서버에 연결할 수 없습니다: {e}")))?;

        let status = resp.status();

        // Mcp-Session-Id 캡처 (서버가 발급하면 후속 요청에 echo)
        if let Some(sid) = resp
            .headers()
            .get("mcp-session-id")
            .and_then(|h| h.to_str().ok())
            .map(String::from)
        {
            self.session_id = Some(sid);
        }

        let content_type = resp
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|h| h.to_str().ok())
            .unwrap_or("")
            .to_string();

        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(http_error_to_app_error(status, &body));
        }

        if content_type.starts_with("text/event-stream") {
            read_sse_for_id(resp, id).await
        } else {
            let value: Value = resp
                .json()
                .await
                .map_err(|e| AppError::Other(format!("json parse: {e}")))?;
            Ok(value)
        }
    }

    async fn send_notification(&self, payload: &Value) -> AppResult<()> {
        let headers = self.build_headers();
        let _ = self
            .client
            .post(&self.url)
            .headers(headers)
            .json(payload)
            .send()
            .await
            .map_err(|e| AppError::Other(format!("notify: {e}")))?;
        Ok(())
    }
}

/// SSE 응답 스트림에서 id가 일치하는 메시지 1개를 찾아 반환한다.
async fn read_sse_for_id(mut resp: reqwest::Response, target_id: i64) -> AppResult<Value> {
    let mut parser = SseParser::default();
    loop {
        let chunk = match resp
            .chunk()
            .await
            .map_err(|e| AppError::Other(format!("stream: {e}")))?
        {
            Some(c) => c,
            None => return Err(AppError::Other("EOF before response".into())),
        };
        for msg in parser.feed(&chunk) {
            if let Ok(value) = serde_json::from_str::<Value>(&msg.data) {
                if value.get("id").and_then(|v| v.as_i64()) == Some(target_id) {
                    return Ok(value);
                }
            }
        }
    }
}

// ---------- Legacy HTTP+SSE transport (2024-11) ----------

async fn introspect_sse(raw: &Value) -> AppResult<Vec<McpTool>> {
    let url = raw
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::Other("missing url".into()))?
        .to_string();
    let user_headers = read_headers(raw);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(HANDSHAKE_TIMEOUT_SECS))
        .build()
        .map_err(|e| AppError::Other(format!("http client: {e}")))?;

    let work = legacy_sse_handshake(client, url, user_headers);
    timeout(Duration::from_secs(HANDSHAKE_TIMEOUT_SECS), work)
        .await
        .map_err(|_| AppError::Other(format!("MCP handshake timeout ({HANDSHAKE_TIMEOUT_SECS}s)")))?
}

async fn legacy_sse_handshake(
    client: reqwest::Client,
    base_url: String,
    user_headers: HashMap<String, String>,
) -> AppResult<Vec<McpTool>> {
    // 1) GET <url> 로 SSE 스트림 연결.
    let mut get_headers = HeaderMap::new();
    get_headers.insert(ACCEPT, HeaderValue::from_static("text/event-stream"));
    merge_user_headers(&mut get_headers, &user_headers);

    let resp = client
        .get(&base_url)
        .headers(get_headers)
        .send()
        .await
        .map_err(|e| AppError::Other(format!("서버에 연결할 수 없습니다: {e}")))?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(http_error_to_app_error(status, &body));
    }

    // 2) endpoint 이벤트를 받을 때까지 스트림을 읽어 message_url을 확보한다.
    let (mut parser, mut resp, message_url) = wait_for_endpoint(SseParser::default(), resp, &base_url).await?;

    // 3) 이후 SSE 메시지를 mpsc로 흘려보내는 백그라운드 태스크 시작.
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Value>();
    let stream_task = tokio::spawn(async move {
        loop {
            let chunk = match resp.chunk().await {
                Ok(Some(c)) => c,
                _ => return,
            };
            for msg in parser.feed(&chunk) {
                if let Ok(value) = serde_json::from_str::<Value>(&msg.data) {
                    if tx.send(value).is_err() {
                        return;
                    }
                }
            }
        }
    });

    let result = run_legacy_rpc(&client, &message_url, &user_headers, &mut rx).await;
    stream_task.abort();
    result
}

async fn run_legacy_rpc(
    client: &reqwest::Client,
    message_url: &str,
    user_headers: &HashMap<String, String>,
    rx: &mut tokio::sync::mpsc::UnboundedReceiver<Value>,
) -> AppResult<Vec<McpTool>> {
    // POST 헤더 — Content-Type만 강제, 나머지는 사용자 설정 그대로.
    let mut post_headers = HeaderMap::new();
    post_headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    merge_user_headers(&mut post_headers, user_headers);

    let post = |payload: Value| {
        let client = client.clone();
        let url = message_url.to_string();
        let headers = post_headers.clone();
        async move {
            let resp = client
                .post(&url)
                .headers(headers)
                .json(&payload)
                .send()
                .await
                .map_err(|e| AppError::Other(format!("post: {e}")))?;
            let status = resp.status();
            if !status.is_success() {
                let body = resp.text().await.unwrap_or_default();
                return Err(http_error_to_app_error(status, &body));
            }
            Ok::<_, AppError>(())
        }
    };

    post(json!({
        "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": init_params()
    }))
    .await?;
    let _init = wait_for_id(rx, 1).await?;

    post(json!({
        "jsonrpc": "2.0", "method": "notifications/initialized"
    }))
    .await?;

    post(json!({
        "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}
    }))
    .await?;
    let list_resp = wait_for_id(rx, 2).await?;

    parse_tools(&list_resp)
}

async fn wait_for_endpoint(
    mut parser: SseParser,
    mut resp: reqwest::Response,
    base_url: &str,
) -> AppResult<(SseParser, reqwest::Response, String)> {
    loop {
        let chunk = resp
            .chunk()
            .await
            .map_err(|e| AppError::Other(format!("stream: {e}")))?
            .ok_or_else(|| AppError::Other("EOF before endpoint event".into()))?;
        for msg in parser.feed(&chunk) {
            if msg.event.as_deref() == Some("endpoint") && !msg.data.is_empty() {
                let resolved = resolve_url(base_url, &msg.data);
                return Ok((parser, resp, resolved));
            }
        }
    }
}

async fn wait_for_id(
    rx: &mut tokio::sync::mpsc::UnboundedReceiver<Value>,
    id: i64,
) -> AppResult<Value> {
    while let Some(value) = rx.recv().await {
        if value.get("id").and_then(|v| v.as_i64()) == Some(id) {
            return Ok(value);
        }
    }
    Err(AppError::Other("SSE stream closed before response".into()))
}

fn resolve_url(base: &str, relative: &str) -> String {
    if relative.starts_with("http://") || relative.starts_with("https://") {
        return relative.to_string();
    }
    if let Ok(base_url) = reqwest::Url::parse(base) {
        if let Ok(joined) = base_url.join(relative) {
            return joined.to_string();
        }
    }
    relative.to_string()
}

// ---------- 간단한 SSE 파서 ----------

#[derive(Default)]
struct SseParser {
    buf: Vec<u8>,
    current_event: Option<String>,
    current_data: String,
}

struct SseMessage {
    event: Option<String>,
    data: String,
}

impl SseParser {
    /// 바이트 청크를 누적하고 완성된 메시지들을 반환한다.
    fn feed(&mut self, chunk: &[u8]) -> Vec<SseMessage> {
        self.buf.extend_from_slice(chunk);
        let mut out = Vec::new();
        while let Some(pos) = self.buf.iter().position(|&b| b == b'\n') {
            let line_bytes: Vec<u8> = self.buf.drain(..=pos).collect();
            // 후행 \n과 가능한 \r 제거
            let mut len = line_bytes.len() - 1;
            if len > 0 && line_bytes[len - 1] == b'\r' {
                len -= 1;
            }
            let line = String::from_utf8_lossy(&line_bytes[..len]).to_string();

            if line.is_empty() {
                if !self.current_data.is_empty() {
                    out.push(SseMessage {
                        event: self.current_event.take(),
                        data: std::mem::take(&mut self.current_data),
                    });
                }
                self.current_event = None;
                self.current_data.clear();
                continue;
            }

            if let Some(v) = line.strip_prefix("event:") {
                self.current_event = Some(v.trim().to_string());
            } else if let Some(v) = line.strip_prefix("data:") {
                let v = v.strip_prefix(' ').unwrap_or(v);
                if !self.current_data.is_empty() {
                    self.current_data.push('\n');
                }
                self.current_data.push_str(v);
            }
            // id:, retry:, 주석(:) 등 다른 SSE 필드는 무시
        }
        out
    }
}
