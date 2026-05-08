# Claude Studio (가칭)

> `.claude/` 폴더의 agents · slash commands · CLAUDE.md를 GUI로 손쉽게 만들고 편집하는 데스크톱 앱.

매번 `.claude/agents/*.md`를 손으로 작성하거나, frontmatter 규칙을 외워서 CLI에서 만들어 본 적 있다면 — 이 앱이 그 작업을 폼 한 화면으로 해결합니다. 초보자도 폼만 채우면 유효한 agent가 즉시 생성되고, 템플릿 갤러리에서 검증된 자산을 가져다 쓸 수 있습니다.

## 핵심 기능

- 📂 **Open Folder**: 기존 프로젝트 폴더를 열어 `.claude/`를 자동 탐색·생성
- 🤖 **Agents 편집기**: name(kebab-case 자동 수정 제안), description, tools(자동완성), model, system prompt 까지 폼 한 화면
- ⌨️ **Slash Commands 편집기**: `/이름`, argument-hint, allowed-tools, body 폼
- 📝 **CLAUDE.md 에디터**: 좌 입력 / 우 라이브 마크다운 프리뷰
- 🛒 **Marketplace**: 내장 템플릿 + GitHub 인덱스 레포의 manifest.json에서 가져온 외부 템플릿
- 💻 **내장 터미널**: 프로젝트 cwd로 `claude` CLI를 바로 실행 (xterm.js + portable-pty)
- 🌐 **i18n**: 한국어 / English

## 기술 스택

- **Tauri v2** + Rust (네이티브 데스크톱)
- **React 19** + TypeScript + Vite 7
- **Tailwind CSS v4** + shadcn 스타일 컴포넌트
- **react-hook-form + zod** (실시간 검증 + 자동 수정 제안)
- **TanStack Query** (마켓플레이스 fetch 캐싱)
- **gray-matter** (frontmatter parsing)
- **xterm.js + portable-pty** (내장 터미널)
- **Bun** (패키지 매니저 / 런타임)

## 개발 환경

### 사전 요구

- [Bun](https://bun.sh) ≥ 1.2
- [Rust](https://rustup.rs) (Tauri v2 빌드용)
- macOS / Windows / Linux

### 시작하기

```bash
bun install
bun tauri:dev    # Tauri 데스크톱 앱 (개발)
```

### 빌드

```bash
bun tauri:build
```

### 테스트

```bash
bun run test     # vitest (zod 스키마, frontmatter round-trip)
```

## 프로젝트 구조

```
.
├── apps/desktop/             # Tauri + React 앱
│   ├── src/                  # React 코드
│   │   ├── routes/           # 페이지/탭
│   │   ├── features/         # agents · commands · claude-md · marketplace · terminal
│   │   ├── lib/              # tauri 래퍼, frontmatter, zod 스키마
│   │   ├── components/ui/    # shadcn-스타일 컴포넌트
│   │   ├── store/            # Zustand
│   │   └── i18n/             # ko/en 리소스
│   └── src-tauri/            # Rust 백엔드
│       └── src/commands/     # fs_ops · marketplace · pty
└── packages/templates/       # 내장 템플릿 + manifest.json
```

## Marketplace 인덱스 만들기

본인의 GitHub repo에 `manifest.json`을 두고 raw URL을 설정에 붙여넣으면 됩니다.

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

## 라이선스

MIT — 자세한 내용은 [LICENSE](LICENSE) 참조.
