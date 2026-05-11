//! macOS GUI 앱(Dock/Finder 실행)이 launchd 기본 PATH(`/usr/bin:/bin:/usr/sbin:/sbin`)만 갖고
//! 뜨는 문제 보정. Homebrew/nvm/bun/pnpm 등에 설치된 사용자 도구가 안 보이는 걸 막는다.
//!
//! 사용자의 로그인 셸을 잠깐 띄워서 그 PATH를 가져온 뒤 `std::env::set_var`로 박는다.
//! 이후 spawn되는 모든 자식 프로세스(`check_claude`, pty 등)가 같은 PATH를 상속한다.

use std::time::Duration;

const SHELL_TIMEOUT_SECS: u64 = 3;

/// 사용자 셸의 PATH로 process-global PATH를 갱신한다. dev 모드(터미널에서 띄운 경우)는 no-op.
#[cfg(target_os = "macos")]
pub fn fix_path_env() {
    // dev 모드는 부모(터미널)에서 이미 풀 PATH를 받았으니 건너뛴다.
    if is_launched_from_terminal() {
        return;
    }

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());

    // `-ilc` — interactive + login. .zprofile, .zshrc 모두 적용된 PATH를 얻기 위함.
    // printf로 마지막 \n까지 컨트롤 (echo는 셸마다 동작이 다름).
    let mut cmd = std::process::Command::new(&shell);
    cmd.args(["-ilc", "printf %s \"$PATH\""]);
    cmd.env_remove("PROMPT_COMMAND");

    let Ok(child) = cmd.stdout(std::process::Stdio::piped()).spawn() else {
        return;
    };

    let Ok(output) = wait_with_timeout(child, Duration::from_secs(SHELL_TIMEOUT_SECS)) else {
        return;
    };

    if !output.status.success() {
        return;
    }

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        return;
    }

    std::env::set_var("PATH", path);
}

#[cfg(not(target_os = "macos"))]
pub fn fix_path_env() {}

/// 터미널에서 띄웠는지 어림짐작 — TERM_PROGRAM 또는 controlling TTY 존재 여부.
#[cfg(target_os = "macos")]
fn is_launched_from_terminal() -> bool {
    // TERM_PROGRAM은 Terminal.app, iTerm, Warp, VS Code integrated terminal 등이 세팅.
    if std::env::var("TERM_PROGRAM").is_ok() {
        return true;
    }
    // launchd 기본 PATH는 보통 4개 항목. 그보다 길면 사용자 PATH가 이미 들어온 것으로 본다.
    if let Ok(path) = std::env::var("PATH") {
        let count = path.split(':').filter(|s| !s.is_empty()).count();
        if count > 5 {
            return true;
        }
    }
    false
}

#[cfg(target_os = "macos")]
fn wait_with_timeout(
    mut child: std::process::Child,
    timeout: Duration,
) -> std::io::Result<std::process::Output> {
    use std::sync::mpsc;
    use std::thread;

    let (tx, rx) = mpsc::channel();
    let stdout = child.stdout.take();
    thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(mut s) = stdout {
            use std::io::Read;
            let _ = s.read_to_end(&mut buf);
        }
        let _ = tx.send(buf);
    });

    let start = std::time::Instant::now();
    loop {
        match child.try_wait()? {
            Some(status) => {
                let stdout = rx.recv_timeout(Duration::from_millis(200)).unwrap_or_default();
                return Ok(std::process::Output {
                    status,
                    stdout,
                    stderr: Vec::new(),
                });
            }
            None => {
                if start.elapsed() > timeout {
                    let _ = child.kill();
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::TimedOut,
                        "shell PATH probe timed out",
                    ));
                }
                thread::sleep(Duration::from_millis(50));
            }
        }
    }
}
