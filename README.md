<div align="center">

# Claude Studio

**`.claude/` 폴더의 agents · slash commands · CLAUDE.md를 GUI로 만들고 편집하는 Tauri 데스크톱 앱.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Tauri v2](https://img.shields.io/badge/Tauri-v2-FFC131?logo=tauri&logoColor=white)](https://tauri.app)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Bun](https://img.shields.io/badge/Bun-1.2+-F7DC6F?logo=bun&logoColor=white)](https://bun.sh)

[GitHub](https://github.com/UkiDelly/claude_studio) · [Issues](https://github.com/UkiDelly/claude_studio/issues) · [Releases](https://github.com/UkiDelly/claude_studio/releases)

</div>

---

매번 `.claude/agents/*.md` 를 손으로 짜고, frontmatter 규칙을 외우고, CLI에서 끄적이거나 Claude에게 묻는 게 번거로웠다면 — 이 앱이 폼 한 화면으로 그 작업을 끝냅니다. 초보자도 폼만 채우면 유효한 agent가 즉시 생성되고, 템플릿 갤러리에서 검증된 자산을 가져다 쓸 수 있습니다.

> 스크린샷 및 데모는 첫 release 후 추가 예정입니다.

## 주요 기능

| 영역 | 기능 |
|------|------|
| 📂 **프로젝트** | 폴더 열기 / 최근 프로젝트 목록 / `.claude/` 자동 탐색·생성 |
| 🤖 **Agents 편집기** | kebab-case 자동 수정 제안, tools 자동완성, model picker, system prompt — 폼 한 화면. zod 실시간 검증 |
| ⌨️ **Slash Commands** | `/이름`, argument-hint, allowed-tools, body 폼 |
| 📝 **CLAUDE.md** | 좌 입력 / 우 라이브 마크다운 프리뷰 split 에디터 |
| 🛒 **Marketplace** | 내장 템플릿 + GitHub 인덱스 레포 manifest 기반 가져오기 (Rust HTTP fetch) |
| 💻 **내장 터미널** | xterm.js + portable-pty 로 프로젝트 cwd에서 `claude` CLI 실행. ResizeObserver로 폭 자동 맞춤 |
| 🧪 **툴 힌트** | 글로벌/프로젝트 `settings.json` + `~/.claude.json` (top-level + `projects[path].mcpServers`) + `.mcp.json` 에서 툴 후보 추출 |
| 🔌 **MCP 디스커버리** | 서버별 collapsible 그룹. 펼치면 stdio 서버를 spawn → MCP 프로토콜 `tools/list` 호출로 실제 툴 목록 조회 (30분 캐시) |
| ✅ **Claude CLI 상태** | 시작 시 `claude --version` 확인 + npm 레지스트리에서 최신 버전 비교. 미설치 시 설치 페이지로 안내 |
| 🆕 **앱 업데이트** | GitHub Releases API 로 최신 release 비교, "릴리즈 페이지 열기" 안내 |
| 🌐 **i18n** | 한국어(기본) / English. 다크 / 라이트 / 시스템 테마 |

## 기술 스택

- **Tauri v2** + Rust (네이티브 데스크톱, ~10MB)
- **React 19** + TypeScript + **Vite 7**
- **Tailwind CSS v4** + shadcn 스타일 컴포넌트
- **react-hook-form** + **zod** (실시간 검증 + 자동 수정 제안)
- **TanStack Query** (마켓플레이스/MCP 디스커버리/업데이트 fetch 캐싱)
- **Zustand** + persist (최근 프로젝트, 설정)
- **gray-matter** (frontmatter parsing/serialization)
- **xterm.js** + **portable-pty** (내장 터미널)
- **react-i18next** (ko/en 리소스)
- **Bun** 1.2+ (패키지 매니저 / 런타임)

## 시작하기

### 사전 요구

- [Bun](https://bun.sh) ≥ 1.2
- [Rust toolchain](https://rustup.rs) (Tauri v2 네이티브 빌드용)
- macOS / Windows / Linux

> 사용자 환경에 별도로 [`claude` CLI](https://docs.claude.com/en/docs/claude-code/setup) 도 설치되어 있어야 내장 터미널과 일부 기능이 정상 동작합니다. 미설치 시 Welcome 화면이 자동으로 안내해줍니다.

### 개발 모드

```bash
bun install
bun tauri dev          # 또는: bun tauri:dev
```

### 프로덕션 빌드

```bash
bun tauri build        # 또는: bun tauri:build
```

생성물은 `apps/desktop/src-tauri/target/release/bundle/` 아래에 플랫폼별로 패키징됩니다.

### 테스트 / 검증

```bash
bun run test                                  # vitest: zod 스키마, frontmatter, version 비교
cd apps/desktop && bunx tsc --noEmit          # TypeScript strict 체크
cd apps/desktop/src-tauri && cargo clippy -- -D warnings
```

## 프로젝트 구조

```
.
├── apps/desktop/                        # Tauri 앱
│   ├── src/                             # React 코드
│   │   ├── routes/                      # Welcome / Workspace / Settings + tabs/
│   │   ├── features/
│   │   │   ├── agents/                  # AgentForm, AgentEditor, McpServerGroup
│   │   │   ├── commands/                # CommandForm, CommandEditor
│   │   │   ├── claude-md/               # split-view 에디터
│   │   │   ├── marketplace/             # 내장 + 외부 매니페스트 갤러리
│   │   │   ├── terminal/                # xterm.js 패널
│   │   │   ├── claude-check/            # CLI 설치/버전 체크 배너
│   │   │   └── app-update/              # GitHub Releases 기반 업데이트 배너
│   │   ├── components/ui/               # shadcn 스타일 컴포넌트
│   │   ├── lib/
│   │   │   ├── tauri.ts                 # invoke 래퍼 + 버전 비교 유틸
│   │   │   ├── frontmatter.ts           # gray-matter 래퍼
│   │   │   └── schemas/                 # agent / command zod 스키마
│   │   ├── store/                       # Zustand (project recents, settings)
│   │   └── i18n/                        # ko/en 리소스
│   └── src-tauri/
│       ├── src/commands/
│       │   ├── fs_ops.rs                # 폴더 선택 / .claude 입출력
│       │   ├── marketplace.rs           # 외부 manifest fetch
│       │   ├── mcp_discover.rs          # MCP 프로토콜 introspection (stdio)
│       │   ├── tool_hints.rs            # settings/.claude.json/.mcp.json 스캔
│       │   ├── claude_check.rs          # `claude --version` + npm latest 비교
│       │   ├── app_update.rs            # GitHub Releases API
│       │   └── pty.rs                   # portable-pty 세션 관리
│       └── tauri.conf.json
└── packages/templates/                  # 내장 템플릿 + manifest.json
    ├── agents/                          # code-reviewer, test-writer, debugger
    └── commands/                        # /commit, /explain
```

## Marketplace 인덱스 만들기

본인의 GitHub repo에 `manifest.json` 을 두고 raw URL 을 설정에 붙여넣으면 됩니다 (Settings → Marketplace index URL).

```json
{
  "version": "1",
  "templates": [
    {
      "id": "my-reviewer",
      "type": "agent",
      "name": "My Reviewer",
      "description": "내 팀 컨벤션을 따르는 리뷰어",
      "author": "you",
      "tags": ["review"],
      "source": "https://raw.githubusercontent.com/<user>/<repo>/main/agents/my-reviewer.md"
    }
  ]
}
```

지원 `type`: `agent` · `command` · `claude-md`. `source` 는 raw URL (또는 내장 템플릿의 `builtin:agents/<name>.md`).

## MCP 서버 툴 디스커버리 — 어떻게 동작하는지

Agent 편집기 우측 패널의 **MCP servers** 섹션에서 각 서버를 펼치면, 앱이 다음을 수행합니다.

1. `~/.claude/mcp.json`, `~/.claude.json` (top-level + `projects[<현재 프로젝트>].mcpServers`), 프로젝트 `.mcp.json` 을 모두 스캔해 서버 설정을 모은다 (가까운 스코프 우선).
2. stdio 서버는 명령(`uvx ...`, `npx ...` 등)을 spawn하고, JSON-RPC 2.0 으로 `initialize` → `notifications/initialized` → `tools/list` 핸드셰이크.
3. 응답에서 받은 `tools[]` 를 30분 캐시(TanStack Query) 후 클릭 한 번에 `mcp__<server>__<tool>` 형태로 CSV 에 추가.

> HTTP / SSE 기반 MCP 서버는 v1.1 에서 지원 예정 (세션·SSE 처리 추가 필요).

## 로드맵

### v1.1 (계획)

- **Hooks / settings.json / MCP 편집기** — `.claude/settings.json` 의 PreToolUse/PostToolUse 훅, permissions, env, MCP 등 직접 편집
- **HTTP / SSE MCP 서버 introspection** — 현재는 stdio만
- **플러그인 디스커버리** — `~/.claude/plugins/` 에서 동적으로 등록되는 MCP 서버까지 잡기
- **자동 업데이트** — `tauri-plugin-updater` + 코드 서명 키페어, CI에서 빌드 서명, `latest.json` 호스팅. 클릭 한 번으로 다운로드+재시작 (현재는 release 페이지 안내만)

### v1.2+ (가능성)

- AI 보조 생성 (자연어 → agent 스캐폴드)
- 팀 동기화 / 클라우드 백업
- 모바일 / 웹 버전

## 기여하기

이슈와 PR 환영입니다.

- **버그 리포트 / 기능 제안**: [Issues](https://github.com/UkiDelly/claude_studio/issues)
- **PR 전 체크리스트**:
  - `bun run test` (vitest 모두 통과)
  - `cd apps/desktop && bunx tsc --noEmit` (strict 통과)
  - `cd apps/desktop/src-tauri && cargo clippy -- -D warnings` (warning 0)
  - 커밋 메시지: Conventional Commits (`feat:`, `fix:`, `refactor:` …)
- 한국어 / English 둘 다 환영합니다.

## 라이선스

[MIT](./LICENSE) © Claude Studio contributors

## Acknowledgments

- [Tauri](https://tauri.app) — 가벼운 데스크톱 셸
- [shadcn/ui](https://ui.shadcn.com) — 컴포넌트 디자인 시스템 영감
- [Anthropic Claude Code](https://docs.claude.com/en/docs/claude-code) — 이 앱이 설정해주는 대상
- [oraios/serena](https://github.com/oraios/serena), [Upstash context7](https://github.com/upstash/context7) — 좋은 stdio MCP 서버 예시
