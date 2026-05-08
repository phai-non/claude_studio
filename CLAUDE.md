# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo identity

**Claude Studio** — `.claude/` 폴더의 agents · slash commands · CLAUDE.md를 GUI로 만들고 편집하는 Tauri v2 데스크톱 앱. 패키지 식별자는 `claude-studio`이고 GitHub 슬러그는 `UkiDelly/claude_studio` (앱 업데이트 체크가 이 슬러그에 하드코딩됨 — `apps/desktop/src-tauri/src/commands/app_update.rs`).

## 워크스페이스 / 패키지 매니저

Bun workspaces 모노레포. **`pnpm`/`npm` 쓰지 말 것** — 글로벌 가이드와 충돌하지만 이 프로젝트는 Bun이 정답이다 (`engines.bun: ">=1.2.0"`, `bun.lock` 커밋됨).

```
apps/desktop/        Tauri 앱 (React 프런트 + Rust src-tauri)
packages/templates/  내장 agent/command 템플릿 + manifest.json (Marketplace 빌트인 소스)
```

루트 스크립트는 전부 `bun --filter=desktop run …` 위임이라 루트에서 실행해도 되고, 디버깅·타입체크·clippy는 보통 `apps/desktop` 또는 `apps/desktop/src-tauri`에서 직접 돌린다.

## 자주 쓰는 명령

```bash
# 의존성
bun install

# 개발 (Tauri dev — Rust + Vite 동시 기동)
bun tauri:dev

# 프로덕션 빌드 (산출물: apps/desktop/src-tauri/target/release/bundle/)
bun tauri:build

# 프런트만 Vite로 (Rust 명령 invoke는 isTauri() 가드로 no-op 처리됨)
bun run dev

# 전체 테스트 (vitest, jsdom)
bun run test

# 단일 테스트 / 특정 파일만
cd apps/desktop && bunx vitest run src/lib/__tests__/<file>.test.ts
cd apps/desktop && bunx vitest run -t "<test name 일부>"

# TypeScript strict 체크 (실 빌드 없이 타입만)
cd apps/desktop && bunx tsc --noEmit

# Rust 정적 분석 — PR 전 필수
cd apps/desktop/src-tauri && cargo clippy -- -D warnings
```

PR 머지 전 README에 명시된 게이트 3종: `bun run test` · `bunx tsc --noEmit` · `cargo clippy -- -D warnings` (warning 0). 커밋 메시지는 Conventional Commits.

## 아키텍처 — 큰 그림

### 두 가지 런타임 경계

1. **React 19 + TS** (`apps/desktop/src/`) — Vite 7 빌드, Tailwind v4 (`@tailwindcss/vite`), shadcn 스타일 컴포넌트, react-hook-form + zod 검증, TanStack Query 캐시, Zustand persist, react-i18next (ko 기본/en).
2. **Rust + Tauri v2** (`apps/desktop/src-tauri/src/`) — 파일 I/O, `claude` CLI 검사, GitHub Releases polling, MCP stdio introspection, portable-pty 기반 내장 터미널.

두 경계의 IPC는 **반드시 `src/lib/tauri.ts`의 래퍼**를 거친다. 이 파일이 `invoke<T>(…)` 호출과 `isTauri()` 가드를 캡슐화해서, 일반 브라우저(`bun run dev`)에서도 UI가 깨지지 않게 한다. 새 Rust 명령을 추가할 때 잊지 말 것:

1. `src-tauri/src/commands/<file>.rs`에 `#[tauri::command] async fn …` 정의
2. `src-tauri/src/commands/mod.rs`에 `pub mod` + re-export
3. `src-tauri/src/lib.rs`의 `invoke_handler![…]` 목록에 추가
4. `src/lib/tauri.ts`에 타입 안전 래퍼 추가 (key는 snake_case로 invoke가 받지만 일부 인자는 camelCase — 기존 코드 패턴 참고)

### 라우팅

`App.tsx` 한 곳에 정의된 단순 router:

- `/` → Welcome (프로젝트 열기 / 최근 / Claude CLI 설치 검사 / 앱 업데이트 배너)
- `/settings` → 테마 · 언어 · Marketplace index URL
- `/project/:path/*` → Workspace 셸 + 5개 탭: `agents` · `commands` · `claude-md` · `marketplace` · `terminal`

각 탭은 `src/routes/tabs/`에 얇은 컴포넌트로 있고, 실제 로직은 `src/features/<domain>/`에 모인다.

### feature 모듈 책임

- **`features/agents/`** — `.claude/agents/*.md` 편집 폼. `lib/schemas/agent.ts` zod 스키마로 frontmatter (`name` kebab-case, `description`, `tools` CSV, `model`)를 실시간 검증하고 자동 수정 제안. 우측 패널 `McpServerGroup`이 MCP 디스커버리(아래) 결과를 펼쳐 툴을 CSV로 추가.
- **`features/commands/`** — `.claude/commands/*.md`. frontmatter는 `argument-hint`, `allowed-tools`, `description`. body가 슬래시 커맨드 본문.
- **`features/claude-md/`** — split-view 마크다운 에디터 (좌 입력 / 우 react-markdown + remark-gfm 프리뷰).
- **`features/marketplace/`** — 빌트인(`packages/templates/manifest.json`) + Settings에 등록된 외부 manifest URL을 합쳐 갤러리 표시. `source` 가 `builtin:agents/foo.md` 면 templates 패키지에서 직접 로드, 그 외엔 Rust `fetch_text` 명령(별도 reqwest)로 raw URL 다운로드.
- **`features/terminal/`** — xterm.js 인스턴스 + `pty_open/write/resize/close` Rust 명령. ResizeObserver로 컬럼 자동 맞춤.
- **`features/claude-check/`** — 시작 시 `claude --version` 실행 후 `https://registry.npmjs.org/@anthropic-ai/claude-code/latest`와 비교. 미설치면 설치 페이지로 안내.
- **`features/app-update/`** — GitHub Releases API (`UkiDelly/claude_studio`)로 최신 release 비교, "릴리즈 페이지 열기"만 지원 (자동 다운로드는 v1.1 로드맵).

### Frontmatter 표준

모든 agent/command 파일은 `lib/frontmatter.ts`의 자체 파서로 직렬화/역직렬화한다 (gray-matter는 Buffer/eval 의존이 Tauri 웹뷰에서 throw하던 이슈로 제거됨, commit f14656a). **`lib/frontmatter.ts`의 `parseDoc`/`stringifyDoc`를 통해서만 다룰 것** — 절대 throw 하지 않고 (잘못된 입력이면 빈 data + raw body), 우리가 emit하는 형식(scalar, inline array, block list)을 안정적으로 round-trip한다. zod 스키마는 `lib/schemas/{agent,command}.ts`에 격리되어 있어 빌드/테스트가 빠르다.

### 툴 힌트 & MCP 디스커버리 — 두 단계로 분리

이 프로젝트의 가장 미묘한 부분이라 한 곳에 정리:

1. **정적 힌트** (`tool_hints.rs` → `read_tool_hints`)
   - `~/.claude/settings.json`, 프로젝트 `.claude/settings.json`, `~/.claude.json` (top-level + `projects[<현재 path>].mcpServers`), 프로젝트 `.mcp.json`을 모두 읽어 **이름만** 모음.
   - 가까운 스코프(프로젝트 > 사용자) 우선, 중복 dedupe.
   - `ToolHint { name, source: 'builtin'|'settings'|'mcp', origin }` 리스트로 반환.

2. **동적 introspection** (`mcp_discover.rs` → `discover_mcp_tools`)
   - 사용자가 agent 편집기에서 특정 MCP 서버를 펼칠 때만 호출.
   - stdio 서버를 spawn하고 JSON-RPC 2.0 핸드셰이크: `initialize` → `notifications/initialized` → `tools/list`.
   - 결과 `tools[]`는 TanStack Query에 30분 캐시. 클릭하면 `mcp__<server>__<tool>` 형태로 agent의 `tools` CSV에 추가.
   - **HTTP/SSE MCP 서버는 미지원** (v1.1 예정). 새 서버 종류 추가 시 `ServerKind` enum과 분기 모두 손봐야 함.

이 둘을 섞지 말 것: 정적 힌트는 항상 즉시 반환되어야 하고 (UI 첫 렌더 차단), 동적 introspection은 명시적 사용자 액션 뒤에서만 돌아야 함.

### 상태 관리

- **Server-state**: TanStack Query (마켓플레이스 fetch, MCP 디스커버리, 업데이트 체크). 캐시 키 패턴은 `[domain, …args]` — 기존 hook 참고.
- **Client-state**: Zustand `useSettingsStore` (`store/project.ts`)에 테마 · 언어 · 최근 프로젝트 목록 · marketplace URL 등을 persist. `applyTheme(theme)`이 `<html>`에 `data-theme` 토글.
- 폼 상태는 react-hook-form + `@hookform/resolvers` + zod. 글로벌 store에 폼 값을 올리지 않는다.

### 경로 별칭

`@/*` → `apps/desktop/src/*` (vitest/tsc/vite 모두 동일하게 적용됨, `apps/desktop/tsconfig.json` 및 `vite.config.ts`).

## 언어 / 톤

- README, 라벨, 에러 메시지, i18n 기본 리소스 모두 한국어. 영어는 보조.
- 코드 주석도 한국어 OK. 식별자(변수/함수)는 영어 (TS는 camelCase, Rust는 snake_case).
- PR 설명 / 커밋 메시지는 한국어 또는 영어 모두 환영 (Conventional Commits 형식 유지).
