# 릴리즈 가이드

Claude Studio는 `tauri-plugin-updater`(ed25519 서명)로 자동 업데이트를 제공합니다. 첫 셋업과 새 버전 발사 절차를 정리합니다.

## 1회성 셋업

### 1. ed25519 키페어 생성

로컬에서 1회만:

```bash
mkdir -p ~/.tauri
bunx tauri signer generate -w ~/.tauri/claude-studio.key
```

- 비밀번호 입력 — **반드시 메모 + 안전한 곳(1Password 등)에 백업**.
- 산출물 두 개:
  - `~/.tauri/claude-studio.key` — private key. 절대 git에 넣지 말 것 (`*.key`는 이미 `.gitignore`에 있음).
  - `~/.tauri/claude-studio.key.pub` — public key, base64 한 줄.

**키 분실 시 모든 사용자가 새 키로 서명된 새 버전을 수동으로 재설치해야** 하므로 백업이 가장 중요합니다.

### 2. public key를 코드에 박기

`apps/desktop/src-tauri/tauri.conf.json`의 `plugins.updater.pubkey` 값을 `~/.tauri/claude-studio.key.pub` 파일 내용으로 교체:

```json
"plugins": {
  "updater": {
    "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6...",
    "endpoints": ["..."]
  }
}
```

이 값은 public이므로 git에 커밋해도 됩니다.

### 3. GitHub repo secrets 등록

`https://github.com/UkiDelly/claude_studio/settings/secrets/actions` 에서:

| 이름 | 값 |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | `~/.tauri/claude-studio.key` 파일 내용 전체 (cat으로 출력해 복사) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 위에서 입력한 비밀번호 |

## 새 릴리즈 발사

### 1. 버전 bump

다음 4곳을 **반드시 동시에** 같은 버전으로:
- `package.json` (루트)
- `apps/desktop/package.json`
- `apps/desktop/src-tauri/Cargo.toml` (`[package].version`)
- `apps/desktop/src-tauri/tauri.conf.json` (`version`)

### 2. PR 머지 → tag 푸시

```bash
git tag v1.0.1
git push origin v1.0.1
```

### 3. CI가 자동으로 처리

`.github/workflows/release.yml`이 tag push를 트리거로:

1. 4개 플랫폼(macOS arm64/x64 · Linux x64 · Windows x64) 빌드.
2. 각 플랫폼 산출물을 `TAURI_SIGNING_PRIVATE_KEY`로 ed25519 서명 → `.sig` 파일 생성.
3. GitHub에 **draft release** 생성, 모든 산출물 + `latest.json` 자산으로 업로드.

### 4. release 검토 → publish

GitHub Releases 페이지에서 draft를 열어:
- release notes 보강 (자동 채워진 placeholder 교체)
- 자산 목록 확인 (각 플랫폼 `.sig`, `latest.json` 존재 여부)
- **Publish release** 클릭

`latest.json`이 `https://github.com/UkiDelly/claude_studio/releases/latest/download/latest.json` 에서 접근 가능해지는 순간, 기존 사용자의 앱이 다음 시작 시 새 버전을 감지합니다.

> Draft 상태에서는 `releases/latest/download/` URL이 동작하지 않습니다 — publish가 자동 업데이트 활성화의 트리거.

## 트러블슈팅

| 증상 | 원인 | 처리 |
|---|---|---|
| 빌드 시 `.sig` 파일이 안 생김 | `tauri.conf.json`의 `bundle.createUpdaterArtifacts: true` 누락 | 추가 |
| 사용자 앱이 업데이트를 못 봄 | release가 draft 상태 | publish 클릭 |
| `signature verification failed` | `pubkey`가 키페어와 안 맞음 또는 이전 키로 서명됨 | tauri.conf 갱신 또는 동일 private key로 재빌드 |
| Windows에서 SmartScreen 경고 | Authenticode 서명 없음 | v1.1.x 후속 (별도 인증서 필요) |
| macOS에서 "확인되지 않은 개발자" | Apple Developer ID 코드 서명 없음 | v1.1.x 후속 ($99/년 Apple Developer 계정 필요) |

## 비스코프 (후속 작업)

- macOS Apple Developer ID 서명 + notarization — Gatekeeper 경고 제거.
- Windows Authenticode 서명 — SmartScreen 경고 제거.
- 자동 업데이트 체크 주기·설정 UI.
