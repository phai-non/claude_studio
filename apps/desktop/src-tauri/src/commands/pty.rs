use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use once_cell::sync::Lazy;
use parking_lot::Mutex;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::error::{AppError, AppResult};

/// `program` 을 OS 의 PATH 검색 규칙에 맞춰 절대 경로로 resolve.
///
/// - 절대 경로면 그대로 반환.
/// - 그 외엔 `which` crate 가 PATH 와 (Windows 의 경우) PATHEXT 까지 고려해서
///   실제 실행 가능 파일을 찾는다. 이게 없으면 portable-pty 가 raw 한
///   `CreateProcessW` / `execvp` 를 호출하면서 Windows 의 `.cmd`/`.bat` 같은
///   PATHEXT 의존 실행 파일을 못 찾는다.
fn resolve_program(program: &str) -> AppResult<PathBuf> {
    let p = Path::new(program);
    if p.is_absolute() {
        return Ok(p.to_path_buf());
    }
    which::which(program).map_err(|e| {
        AppError::Other(format!(
            "program not found in PATH: {program} ({e})"
        ))
    })
}

struct Session {
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    /// `_child` 는 우리가 살아있는 동안 자식 프로세스를 유지하기 위한 핸들
    _child: Box<dyn Child + Send + Sync>,
}

static SESSIONS: Lazy<Mutex<HashMap<String, Session>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Serialize, Clone)]
struct PtyData {
    session_id: String,
    chunk: String,
}

#[derive(Serialize, Clone)]
struct PtyExit {
    session_id: String,
}

/// 새 PTY 세션을 시작하고 자식 프로세스를 spawn 한다.
#[tauri::command]
pub async fn pty_open(
    app: AppHandle,
    cwd: String,
    program: String,
    args: Vec<String>,
    cols: u16,
    rows: u16,
) -> AppResult<String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| AppError::Other(format!("openpty: {e}")))?;

    let resolved = resolve_program(&program)?;
    let mut cmd = CommandBuilder::new(resolved);
    for a in args {
        cmd.arg(a);
    }
    cmd.cwd(PathBuf::from(&cwd));
    // 기본 환경 유지를 위해 PATH 등을 부모에서 상속
    if let Ok(path) = std::env::var("PATH") {
        cmd.env("PATH", path);
    }
    if let Ok(home) = std::env::var("HOME") {
        cmd.env("HOME", home);
    }
    cmd.env("TERM", "xterm-256color");
    #[cfg(windows)]
    {
        // Windows native console 앱 (claude.cmd 가 띄우는 node 등) 이 PATHEXT/USERPROFILE
        // 등을 못 받으면 npm 글로벌 패키지를 다시 못 찾는다.
        for key in [
            "PATHEXT",
            "USERPROFILE",
            "APPDATA",
            "LOCALAPPDATA",
            "ProgramFiles",
            "ProgramFiles(x86)",
            "SystemRoot",
            "ComSpec",
            "NVM_SYMLINK",
        ] {
            if let Ok(value) = std::env::var(key) {
                cmd.env(key, value);
            }
        }
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| AppError::Other(format!("spawn: {e}")))?;
    drop(pair.slave); // slave는 child가 보유

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| AppError::Other(format!("take_writer: {e}")))?;
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| AppError::Other(format!("clone_reader: {e}")))?;

    let session_id = uuid::Uuid::new_v4().to_string();

    SESSIONS.lock().insert(
        session_id.clone(),
        Session {
            master: Arc::new(Mutex::new(pair.master)),
            writer: Arc::new(Mutex::new(writer)),
            _child: child,
        },
    );

    // stdout 스트리밍 스레드
    let app_handle = app.clone();
    let id_for_thread = session_id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_handle.emit(
                        "pty:data",
                        PtyData {
                            session_id: id_for_thread.clone(),
                            chunk,
                        },
                    );
                }
                Err(_) => break,
            }
        }
        let _ = app_handle.emit(
            "pty:exit",
            PtyExit {
                session_id: id_for_thread.clone(),
            },
        );
        SESSIONS.lock().remove(&id_for_thread);
    });

    Ok(session_id)
}

#[tauri::command]
pub fn pty_write(session_id: String, data: String) -> AppResult<()> {
    let sessions = SESSIONS.lock();
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| AppError::Other(format!("unknown session {session_id}")))?;
    let mut w = session.writer.lock();
    w.write_all(data.as_bytes())
        .map_err(|e| AppError::Other(format!("write: {e}")))?;
    Ok(())
}

#[tauri::command]
pub fn pty_resize(session_id: String, cols: u16, rows: u16) -> AppResult<()> {
    let sessions = SESSIONS.lock();
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| AppError::Other(format!("unknown session {session_id}")))?;
    session
        .master
        .lock()
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| AppError::Other(format!("resize: {e}")))?;
    Ok(())
}

#[tauri::command]
pub fn pty_close(session_id: String) -> AppResult<()> {
    SESSIONS.lock().remove(&session_id);
    Ok(())
}
