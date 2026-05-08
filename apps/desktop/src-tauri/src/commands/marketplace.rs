use crate::error::{AppError, AppResult};

const USER_AGENT: &str = "claude-studio";
const MAX_BYTES: usize = 1_048_576; // 1 MB
const TIMEOUT_SECS: u64 = 10;

fn client() -> AppResult<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(TIMEOUT_SECS))
        .build()
        .map_err(|e| AppError::Other(format!("http client: {e}")))
}

#[tauri::command]
pub async fn fetch_text(url: String) -> AppResult<String> {
    let resp = client()?
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::Other(format!("request failed: {e}")))?;
    if !resp.status().is_success() {
        return Err(AppError::Other(format!(
            "status {} for {}",
            resp.status(),
            url
        )));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| AppError::Other(format!("read body: {e}")))?;
    if bytes.len() > MAX_BYTES {
        return Err(AppError::Other(format!(
            "response too large: {} bytes",
            bytes.len()
        )));
    }
    String::from_utf8(bytes.to_vec())
        .map_err(|e| AppError::Other(format!("non-utf8 body: {e}")))
}
